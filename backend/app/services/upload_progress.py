"""In-memory, thread-safe tracker for server-side upload processing & TOS sync progress."""

from __future__ import annotations

import threading
import time
from typing import Any, Literal

UploadStage = Literal["receiving", "probing", "cloud_sync", "done", "error"]

STAGE_LABELS: dict[UploadStage, str] = {
    "receiving": "正在接收文件",
    "probing": "正在解析视频元信息与封面",
    "cloud_sync": "正在同步至云端存储",
    "done": "上传与解析完成",
    "error": "上传处理失败",
}

TTL_SECONDS = 600.0
MAX_ENTRIES = 500


class UploadProgressTracker:
    """Tracks per-upload server stage and TOS cloud transfer progress across threads."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: dict[str, dict[str, Any]] = {}

    def _prune_locked(self, now: float) -> None:
        expired = [k for k, v in self._entries.items() if now - v["updated_at"] > TTL_SECONDS]
        for k in expired:
            self._entries.pop(k, None)
        if len(self._entries) > MAX_ENTRIES:
            ordered = sorted(self._entries.items(), key=lambda item: item[1]["updated_at"])
            for k, _ in ordered[: len(self._entries) - MAX_ENTRIES]:
                self._entries.pop(k, None)

    def init(
        self,
        upload_id: str,
        filename: str = "",
        *,
        tenant_id: str | None = None,
        total_bytes: int = 0,
    ) -> None:
        if not upload_id:
            return
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            self._entries[upload_id] = {
                "upload_id": upload_id,
                "tenant_id": tenant_id,
                "filename": filename,
                "stage": "receiving",
                "stage_label": STAGE_LABELS["receiving"],
                "received_bytes": 0,
                "total_bytes": max(0, int(total_bytes)),
                "tos_consumed_bytes": 0,
                "tos_total_bytes": 0,
                "tos_percent": 0,
                "error": None,
                "updated_at": now,
            }

    def update(
        self,
        upload_id: str | None,
        *,
        stage: UploadStage | None = None,
        stage_label: str | None = None,
        filename: str | None = None,
        received_bytes: int | None = None,
        total_bytes: int | None = None,
        tos_consumed_bytes: int | None = None,
        tos_total_bytes: int | None = None,
        error: str | None = None,
    ) -> None:
        if not upload_id:
            return
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(upload_id)
            if not entry:
                entry = {
                    "upload_id": upload_id,
                    "tenant_id": None,
                    "filename": filename or "",
                    "stage": "receiving",
                    "stage_label": STAGE_LABELS["receiving"],
                    "received_bytes": 0,
                    "total_bytes": 0,
                    "tos_consumed_bytes": 0,
                    "tos_total_bytes": 0,
                    "tos_percent": 0,
                    "error": None,
                    "updated_at": now,
                }
                self._entries[upload_id] = entry

            if filename is not None:
                entry["filename"] = filename
            if stage is not None:
                entry["stage"] = stage
                entry["stage_label"] = stage_label or STAGE_LABELS[stage]
            elif stage_label is not None:
                entry["stage_label"] = stage_label
            if received_bytes is not None:
                entry["received_bytes"] = max(0, int(received_bytes))
            if total_bytes is not None:
                entry["total_bytes"] = max(0, int(total_bytes))
            if tos_consumed_bytes is not None:
                entry["tos_consumed_bytes"] = max(0, int(tos_consumed_bytes))
            if tos_total_bytes is not None:
                entry["tos_total_bytes"] = max(0, int(tos_total_bytes))
            if entry["tos_total_bytes"] > 0:
                pct = int(round((entry["tos_consumed_bytes"] / entry["tos_total_bytes"]) * 100))
                entry["tos_percent"] = max(0, min(100, pct))
            if stage == "done" and entry["tos_total_bytes"] > 0:
                entry["tos_consumed_bytes"] = entry["tos_total_bytes"]
                entry["tos_percent"] = 100
            if error is not None:
                entry["error"] = error
            entry["updated_at"] = now

    def get(self, upload_id: str, *, tenant_id: str | None = None) -> dict[str, Any]:
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            entry = self._entries.get(upload_id)
            if not entry:
                return {
                    "upload_id": upload_id,
                    "found": False,
                    "filename": "",
                    "stage": "receiving",
                    "stage_label": STAGE_LABELS["receiving"],
                    "received_bytes": 0,
                    "total_bytes": 0,
                    "tos_consumed_bytes": 0,
                    "tos_total_bytes": 0,
                    "tos_percent": 0,
                    "error": None,
                }
            if tenant_id is not None and entry.get("tenant_id") and entry["tenant_id"] != tenant_id:
                return {
                    "upload_id": upload_id,
                    "found": False,
                    "filename": "",
                    "stage": "receiving",
                    "stage_label": STAGE_LABELS["receiving"],
                    "received_bytes": 0,
                    "total_bytes": 0,
                    "tos_consumed_bytes": 0,
                    "tos_total_bytes": 0,
                    "tos_percent": 0,
                    "error": None,
                }
            return {
                "upload_id": entry["upload_id"],
                "found": True,
                "filename": entry["filename"],
                "stage": entry["stage"],
                "stage_label": entry["stage_label"],
                "received_bytes": entry["received_bytes"],
                "total_bytes": entry["total_bytes"],
                "tos_consumed_bytes": entry["tos_consumed_bytes"],
                "tos_total_bytes": entry["tos_total_bytes"],
                "tos_percent": entry["tos_percent"],
                "error": entry["error"],
            }


upload_progress_tracker = UploadProgressTracker()

DIRECT_SESSION_TTL_SECONDS = 4 * 3600.0
DIRECT_SESSION_MAX_ENTRIES = 1000


class DirectUploadSessionStore:
    """Thread-safe store binding direct-to-TOS upload sessions to server-authorized object keys."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, dict[str, Any]] = {}

    def _prune_locked(self, now: float) -> None:
        expired = [k for k, v in self._sessions.items() if now - v["created_at"] > DIRECT_SESSION_TTL_SECONDS]
        for k in expired:
            self._sessions.pop(k, None)
        if len(self._sessions) > DIRECT_SESSION_MAX_ENTRIES:
            ordered = sorted(self._sessions.items(), key=lambda item: item[1]["created_at"])
            for k, _ in ordered[: len(self._sessions) - DIRECT_SESSION_MAX_ENTRIES]:
                self._sessions.pop(k, None)

    def create(self, session_id: str, data: dict[str, Any]) -> dict[str, Any]:
        now = time.monotonic()
        entry = {**data, "session_id": session_id, "created_at": now}
        with self._lock:
            self._prune_locked(now)
            self._sessions[session_id] = entry
        return dict(entry)

    def get(self, session_id: str, *, tenant_id: str | None = None) -> dict[str, Any] | None:
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            entry = self._sessions.get(session_id)
            if not entry:
                return None
            if tenant_id is not None and entry.get("tenant_id") and entry["tenant_id"] != tenant_id:
                return None
            return dict(entry)

    def pop(self, session_id: str, *, tenant_id: str | None = None) -> dict[str, Any] | None:
        now = time.monotonic()
        with self._lock:
            self._prune_locked(now)
            entry = self._sessions.get(session_id)
            if not entry:
                return None
            if tenant_id is not None and entry.get("tenant_id") and entry["tenant_id"] != tenant_id:
                return None
            return dict(self._sessions.pop(session_id))


direct_upload_sessions = DirectUploadSessionStore()
