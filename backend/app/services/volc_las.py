"""Volcengine LAS (Lake AI Service) asynchronous operator client + realistic mock simulator."""

from __future__ import annotations

import logging
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

from ..config import get_runtime_config, get_settings
from ..constants import (
    INPAINT_OPERATOR_ID,
    INPAINT_OPERATOR_VERSION,
    LAS_ERROR_HINTS,
    OUTPUT_LANG_MAP,
    SOURCE_LANGUAGES,
    TRANSLATE_OPERATOR_ID,
    TRANSLATE_OPERATOR_VERSION,
)
from .tos_client import tos_service

logger = logging.getLogger(__name__)


class LasApiError(RuntimeError):
    def __init__(self, message: str, business_code: str = "LAS.RequestError", status_code: int = 502):
        super().__init__(message)
        self.business_code = business_code
        self.status_code = status_code


def _is_valid_callback_url(url: str) -> bool:
    u = (url or "").strip()
    if not u.startswith("https://"):
        return False
    lower = u.lower()
    if "localhost" in lower or "127.0.0.1" in lower or "@" in u.split("//", 1)[-1].split("/", 1)[0]:
        return False
    return True


def build_subtitle_content(fmt: str, lang_code: str, lines: list[dict[str, str]]) -> str:
    key_map = {"zh-CN": "zh", "en-US": "en", "ja-JP": "ja", "ko-KR": "ko"}
    lang_key = key_map.get(lang_code, "en")

    def line_text(item: dict[str, str]) -> str:
        return item.get(lang_key) or item.get("en") or item.get("zh") or ""

    if fmt == ".srt":
        blocks = []
        for idx, item in enumerate(lines, start=1):
            start = item.get("time", "00:00:05")
            end_sec = int(start.split(":")[-1]) + 3
            end = f"{start[:6]}{min(59, end_sec):02d}"
            blocks.append(f"{idx}\n{start},000 --> {end},400\n{line_text(item)}\n")
        return "\n".join(blocks)

    if fmt == ".vtt":
        blocks = ["WEBVTT\n"]
        for item in lines:
            start = item.get("time", "00:00:05")
            end_sec = int(start.split(":")[-1]) + 3
            end = f"{start[:6]}{min(59, end_sec):02d}"
            blocks.append(f"{start}.000 --> {end}.400\n{line_text(item)}\n")
        return "\n".join(blocks)

    if fmt == ".ass":
        font = OUTPUT_LANG_MAP.get(lang_code, {}).get("font", "NotoSans-Regular")
        header = (
            "[Script Info]\nTitle: CleanFrame Export\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n"
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, Outline, Alignment, MarginV\n"
            f"Style: Default,{font},60,&H00FFFFFF,&H00000000,0,2,2,120\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )
        events = []
        for item in lines:
            start = item.get("time", "00:00:05")
            end_sec = int(start.split(":")[-1]) + 3
            end = f"{start[:6]}{min(59, end_sec):02d}"
            events.append(f"Dialogue: 0,{start[1:]}.00,{end[1:]}.40,Default,,0,0,0,,{line_text(item)}")
        return header + "\n".join(events) + "\n"

    if fmt == ".xml":
        body = "".join(
            f'  <p begin="{item.get("time", "00:00:05")}">{line_text(item)}</p>\n'
            for item in lines
        )
        return f'<?xml version="1.0" encoding="UTF-8"?>\n<tt xml:lang="{lang_code}">\n<body><div>\n{body}</div></body>\n</tt>\n'

    return "\n".join(f"[{item.get('time', '00:00:05')}] {line_text(item)}" for item in lines) + "\n"


class VolcengineLasClient:
    """Async REST client for Volcengine LAS `las_video_inpaint_pro` and `las_video_translate`."""

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    async def submit_operator(
        self,
        operator_id: str,
        operator_version: str,
        data: dict[str, Any],
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        cfg = get_runtime_config()
        if cfg["effective_mode"] != "live":
            return self._mock_submit(operator_id, data)

        api_key = cfg["las_api_key"]
        if not api_key:
            raise LasApiError("未配置 LAS_API_KEY，无法在 Live 模式提交任务", "Authorization.Missing", 401)

        body: dict[str, Any] = {
            "operator_id": operator_id,
            "operator_version": operator_version,
            "data": data,
        }
        # Volcengine LAS currently only supports `callback` on whitelisted operators (not las_video_inpaint_pro).
        cb = callback_url or cfg.get("callback_url") or ""
        if operator_id == TRANSLATE_OPERATOR_ID and _is_valid_callback_url(cb):
            body["callback"] = {"url": cb}

        url = f"{cfg['las_base_url']}/submit"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers=self._headers(api_key), json=body)
            # Auto-fallback without callback if operator/account has not enabled webhook callbacks
            if "callback" in body and (resp.status_code >= 400 or "callback" in resp.text.lower()):
                try:
                    probe_meta = (resp.json() or {}).get("metadata") or {}
                    probe_err = str(probe_meta.get("error_msg") or resp.text).lower()
                except Exception:
                    probe_err = resp.text.lower()
                if resp.status_code >= 400 and "callback" in probe_err:
                    logger.info("LAS callback not enabled for %s, retrying submit without callback", operator_id)
                    body_no_cb = {k: v for k, v in body.items() if k != "callback"}
                    resp = await client.post(url, headers=self._headers(api_key), json=body_no_cb)

        if resp.status_code >= 400:
            detail = resp.text[:400]
            try:
                err_json = resp.json()
                meta = err_json.get("metadata") or err_json
                bcode = str(meta.get("business_code") or meta.get("code") or f"HTTP.{resp.status_code}")
                emsg = str(meta.get("error_msg") or meta.get("message") or detail)
            except Exception:
                bcode = f"HTTP.{resp.status_code}"
                emsg = detail
            hint = LAS_ERROR_HINTS.get(bcode)
            full_msg = f"{emsg}（{hint}）" if (emsg and hint and emsg != hint) else (emsg or hint or detail)
            raise LasApiError(f"{bcode}: {full_msg}", bcode, resp.status_code)

        payload = resp.json()
        meta = payload.get("metadata") or {}
        bcode = str(meta.get("business_code") or "0")
        tstatus = str(meta.get("task_status") or "").upper()
        if tstatus == "FAILED" or (bcode not in ("", "0", "None") and not meta.get("task_id")):
            emsg = str(meta.get("error_msg") or payload)
            hint = LAS_ERROR_HINTS.get(bcode)
            full_msg = f"{emsg}（{hint}）" if (emsg and hint and emsg != hint) else (emsg or hint)
            raise LasApiError(f"{bcode}: {full_msg}", bcode, 400)
        if not meta.get("task_id"):
            raise LasApiError(f"LAS Submit 未返回 task_id: {payload}", "LAS.InvalidResponse", 502)
        return payload

    async def poll_operator(
        self,
        operator_id: str,
        operator_version: str,
        task_id: str,
    ) -> dict[str, Any]:
        cfg = get_runtime_config()
        if cfg["effective_mode"] != "live":
            raise RuntimeError("Mock tasks are polled via simulator helper")

        api_key = cfg["las_api_key"]
        url = f"{cfg['las_base_url']}/poll"
        body = {
            "operator_id": operator_id,
            "operator_version": operator_version,
            "task_id": task_id,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers=self._headers(api_key), json=body)

        if resp.status_code >= 400:
            raise LasApiError(f"LAS Poll HTTP {resp.status_code}: {resp.text[:300]}", f"HTTP.{resp.status_code}", resp.status_code)

        return resp.json()

    async def test_connection(self, draft_overrides: dict[str, Any] | None = None) -> dict[str, Any]:
        """Verify LAS API Key & endpoint reachability via a lightweight Poll probe."""
        cfg = get_runtime_config(draft_overrides)
        if not cfg["has_las_api_key"]:
            return {
                "configured": False,
                "ok": False,
                "mode": cfg["effective_mode"],
                "endpoint": cfg["las_base_url"],
                "message": "尚未配置必填项 LAS_API_KEY，请填写火山引擎 LAS API Key",
            }

        url = f"{cfg['las_base_url']}/poll"
        body = {
            "operator_id": INPAINT_OPERATOR_ID,
            "operator_version": INPAINT_OPERATOR_VERSION,
            "task_id": "task-connectivity-probe-0000",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, headers=self._headers(cfg["las_api_key"]), json=body)
            if resp.status_code == 401:
                return {
                    "configured": True,
                    "ok": False,
                    "mode": cfg["effective_mode"],
                    "endpoint": cfg["las_base_url"],
                    "message": "LAS 鉴权失败 (401 ApiKey.Invalid)，请核对 LAS_API_KEY",
                }
            # 200 with TaskId.Invalid confirms valid auth and reachable endpoint
            return {
                "configured": True,
                "ok": resp.status_code < 500,
                "status_code": resp.status_code,
                "mode": cfg["effective_mode"],
                "endpoint": cfg["las_base_url"],
                "message": f"火山引擎 LAS 接口连通正常 (HTTP {resp.status_code})",
            }
        except Exception as exc:
            return {
                "configured": True,
                "ok": False,
                "mode": cfg["effective_mode"],
                "endpoint": cfg["las_base_url"],
                "message": f"连接火山引擎 LAS 失败: {exc}",
            }

    @staticmethod
    def _mock_submit(operator_id: str, data: dict[str, Any]) -> dict[str, Any]:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        return {
            "metadata": {
                "task_id": f"task-{ts}-{uuid4().hex[:6]}",
                "task_status": "PENDING",
                "business_code": "0",
                "error_msg": "",
            },
            "_mock": True,
            "_operator_id": operator_id,
        }

    @staticmethod
    def generate_mock_inpaint_result(
        task_id: str,
        filename: str,
        source_local_path: str | None,
        output_tos_path: str,
        width: int,
        height: int,
        out_fps: float,
        codec: str,
        targets: list[str],
    ) -> dict[str, Any]:
        """Produce realistic local artifact + LAS Poll data structure in mock mode."""
        settings = get_settings()
        out_dir = settings.outputs_path / task_id
        out_dir.mkdir(parents=True, exist_ok=True)

        stem = Path(filename).stem
        out_video_url = "/media/sample/frame_16x9.png"
        file_size_mb = 84.2

        if source_local_path and Path(source_local_path).exists():
            src = Path(source_local_path)
            dst = out_dir / f"{stem}_clean{src.suffix or '.mp4'}"
            shutil.copy2(src, dst)
            out_video_url = f"/media/outputs/{task_id}/{dst.name}"
            file_size_mb = round(max(0.1, dst.stat().st_size / (1024 * 1024)), 2)

        sub_count = 1 if ("subtitle" in targets or "scrolling_subtitle" in targets) else 0
        wm_count = 2 if "watermark" in targets else 0
        drama_count = 1 if "drama_info" in targets else 0

        return {
            "inpainted_video_path": f"{output_tos_path.rstrip('/')}/{stem}_clean.mp4",
            "output_video_url": out_video_url,
            "subtitle_bbox": "154,886,1766,1004" if sub_count else None,
            "resolution": f"{width}x{height}",
            "output_fps": round(out_fps, 2),
            "codec": codec,
            "file_size_mb": file_size_mb,
            "elapsed_label": "0 分 12 秒（仿真）",
            "detected_summary": f"字幕 {sub_count} · 角标 {wm_count} · 剧集信息 {drama_count}",
        }

    @staticmethod
    def generate_mock_translate_result(
        task_id: str,
        filename: str,
        source_local_path: str | None,
        output_tos_path: str,
        source_lang: str,
        target_langs: list[str],
        caption_formats: list[str],
        enable_inpaint: bool,
        dubbing_mode: str,
        fast_mode: bool,
        output_dubbing_audio: bool,
        bill_minutes: float,
        total_cost: float,
    ) -> dict[str, Any]:
        settings = get_settings()
        out_dir = settings.outputs_path / task_id
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = Path(filename).stem

        caption_lines = [
            {
                "time": "00:00:12",
                "zh": "我已经等了三年。",
                "en": "I've waited three years.",
                "ja": "もう三年も待ったのよ。",
                "ko": "벌써 삼 년이나 기다렸어요.",
            },
            {
                "time": "00:00:16",
                "zh": "你还要我等到什么时候？",
                "en": "How much longer do you want me to wait?",
                "ja": "いつまで待てばいいの？",
                "ko": "언제까지 기다리라는 거예요?",
            },
            {
                "time": "00:01:02",
                "zh": "我不会再等你了。",
                "en": "I won't wait for you anymore.",
                "ja": "もう、あなたを待たない。",
                "ko": "더는 당신을 기다리지 않을게요.",
            },
        ]

        cards = []
        caption_files = []
        font_cls_map = {"en-US": "lang-en", "ja-JP": "lang-ja", "ko-KR": "lang-ko"}

        base_video_url = "/media/sample/frame_16x9.png"
        if source_local_path and Path(source_local_path).exists():
            src = Path(source_local_path)
            dst_repaired = out_dir / f"{stem}_repaired{src.suffix or '.mp4'}"
            shutil.copy2(src, dst_repaired)
            base_video_url = f"/media/outputs/{task_id}/{dst_repaired.name}"

        for lang in target_langs:
            lang_info = OUTPUT_LANG_MAP.get(lang, {"code": lang, "name": lang})
            video_url = base_video_url
            size_mb = 86.4
            if source_local_path and Path(source_local_path).exists():
                src = Path(source_local_path)
                dst_lang = out_dir / f"{stem}_{lang}{src.suffix or '.mp4'}"
                shutil.copy2(src, dst_lang)
                video_url = f"/media/outputs/{task_id}/{dst_lang.name}"
                size_mb = round(max(0.1, dst_lang.stat().st_size / (1024 * 1024)), 2)

            lang_caps = []
            for fmt in caption_formats:
                cap_name = f"{stem}_{lang}{fmt}"
                cap_path = out_dir / cap_name
                cap_path.write_text(build_subtitle_content(fmt, lang, caption_lines), encoding="utf-8")
                cap_url = f"/media/outputs/{task_id}/{cap_name}"
                caption_files.append({"lang": lang, "format": fmt, "filename": cap_name, "url": cap_url, "path": str(cap_path)})
                lang_caps.append(fmt.lstrip(".").upper())

            cards.append(
                {
                    "code": lang,
                    "label": f"{lang} · {lang_info['name']}",
                    "font_class": font_cls_map.get(lang, "lang-en"),
                    "size": f"MP4 · {size_mb} MB",
                    "captions": " + ".join(lang_caps),
                    "video_url": video_url,
                    "tos_path": f"{output_tos_path.rstrip('/')}/{stem}_{lang}.mp4",
                }
            )

        total_files = len(target_langs) + len(caption_files) + (len(target_langs) if output_dubbing_audio else 0) + (1 if enable_inpaint else 0)

        return {
            "source_lang": source_lang,
            "source_lang_code": source_lang,
            "target_langs": target_langs,
            "dubbing_mode": dubbing_mode,
            "fast_mode": fast_mode,
            "enable_inpaint": enable_inpaint,
            "elapsed_label": "0 分 15 秒（仿真）",
            "total_files": total_files,
            "bill_minutes": round(bill_minutes, 2),
            "total_cost": round(total_cost, 2),
            "inpaint_extra_cost": round(bill_minutes / max(1, len(target_langs)) * 3.0, 2) if enable_inpaint else 0.0,
            "repaired_video": {
                "task_id": f"repair-{task_id[-6:]}",
                "resolution": "1920×1080",
                "duration": "已同步",
                "size_mb": 82.1,
                "url": base_video_url,
            }
            if enable_inpaint
            else None,
            "cards": cards,
            "caption_files": caption_files,
            "caption_lines": caption_lines,
        }


SOURCE_LANG_NAME_MAP = {item["code"]: item["name"] for item in SOURCE_LANGUAGES}


def format_elapsed_seconds(seconds: int | float | None, *, compact: bool = False) -> str:
    if seconds is None:
        return "—"
    sec = max(0, int(round(seconds)))
    if sec < 60:
        return f"{sec}秒" if compact else f"{sec} 秒"
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}小时{m:02d}分{s:02d}秒" if compact else f"{h} 小时 {m:02d} 分 {s:02d} 秒"
    return f"{m}分{s:02d}秒" if compact else f"{m} 分 {s:02d} 秒"


def _format_elapsed(started_at: datetime | None, finished_at: datetime | None) -> str:
    if not started_at or not finished_at:
        return "已完成"
    s = started_at if started_at.tzinfo else started_at.replace(tzinfo=timezone.utc)
    f = finished_at if finished_at.tzinfo else finished_at.replace(tzinfo=timezone.utc)
    sec = max(1, int(round((f - s).total_seconds())))
    return format_elapsed_seconds(sec, compact=False)


def parse_srt_entries(srt_text: str, max_items: int = 10) -> list[dict[str, str]]:
    """Parse real Volcengine .srt content into [{time, text}, ...] preview rows."""
    if not srt_text:
        return []
    blocks = re.split(r"\r?\n\r?\n+", srt_text.strip())
    entries: list[dict[str, str]] = []
    for blk in blocks:
        lines = [ln.strip() for ln in blk.splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        time_idx = next((i for i, ln in enumerate(lines) if "-->" in ln), -1)
        if time_idx == -1 or time_idx + 1 >= len(lines):
            continue
        raw_start = lines[time_idx].split("-->", 1)[0].strip()
        # Normalize 00:00:03,420 -> 00:00:03
        hhmmss = raw_start.split(",")[0].split(".")[0]
        if len(hhmmss.split(":")) == 2:
            hhmmss = f"00:{hhmmss}"
        text_body = " ".join(lines[time_idx + 1 :]).strip()
        # Strip ASS inline override tags if any
        text_body = re.sub(r"\{\\[^}]*\}", "", text_body).strip()
        if text_body:
            entries.append({"time": hhmmss, "text": text_body})
        if len(entries) >= max_items:
            break
    return entries


def normalize_live_inpaint_result(
    raw_data: dict[str, Any],
    request_payload: dict[str, Any],
    *,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
) -> dict[str, Any]:
    """Enrich Volcengine las_video_inpaint_pro Poll `data` with size, codec and elapsed metadata."""
    data = dict(raw_data or {})
    if "cards" in data or data.get("_normalized"):
        return data

    tos_path = data.get("inpainted_video_path")
    size_bytes = tos_service.head_tos_uri(tos_path)
    if size_bytes:
        data["file_size_mb"] = round(max(0.05, size_bytes / (1024 * 1024)), 2)

    data.setdefault("codec", request_payload.get("output_codec") or "h264")
    data["elapsed_label"] = _format_elapsed(started_at, finished_at)

    bbox = data.get("subtitle_bbox")
    det_mode = request_payload.get("detection_mode") or "precise"
    if bbox:
        data["detected_summary"] = f"检出字幕区域 [{bbox}] · 模式 {det_mode}"
    else:
        targets = request_payload.get("targets") or []
        data["detected_summary"] = (
            f"已完成全帧擦除（{', '.join(targets)}）" if targets else f"已完成全帧擦除（{det_mode}）"
        )
    data["_normalized"] = True
    return data


def normalize_live_translate_result(
    raw_data: dict[str, Any],
    request_payload: dict[str, Any],
    *,
    filename: str = "video.mp4",
    resolution: str = "1920×1080",
    bill_minutes: float = 0.0,
    total_cost: float = 0.0,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
) -> dict[str, Any]:
    """Convert real Volcengine `las_video_translate` Poll `data` (`translated_videos`, `translated_captions`, `repaired_videos`) into UI-ready structure while preserving raw fields."""
    data = dict(raw_data or {})
    if "cards" in data and "translated_videos" not in data:
        return data

    stem = Path(filename).stem
    source_lang_code = str(request_payload.get("audio_language") or "zh-CN")
    source_lang_name = SOURCE_LANG_NAME_MAP.get(source_lang_code, source_lang_code)
    req_langs: list[str] = list(request_payload.get("output_languages") or [])

    raw_videos: list[dict[str, Any]] = list(data.get("translated_videos") or [])
    raw_captions: list[dict[str, Any]] = list(data.get("translated_captions") or [])
    raw_repaired: list[dict[str, Any]] = list(data.get("repaired_videos") or [])

    videos_by_lang: dict[str, dict[str, Any]] = {}
    audios_by_lang: dict[str, dict[str, Any]] = {}
    for item in raw_videos:
        lang = str(item.get("language") or "")
        if not lang:
            continue
        itype = str(item.get("type") or "translated_video")
        if itype == "translated_audio":
            audios_by_lang[lang] = item
        else:
            videos_by_lang[lang] = item
            if lang not in req_langs:
                req_langs.append(lang)

    captions_by_lang: dict[str, list[dict[str, Any]]] = {}
    caption_files: list[dict[str, Any]] = []
    for cap in raw_captions:
        lang = str(cap.get("language") or "")
        fmt = str(cap.get("format") or ".srt")
        if not fmt.startswith("."):
            fmt = f".{fmt}"
        t_path = cap.get("tos_path") or ""
        p_url = cap.get("presigned_url") or ""
        fname = Path(t_path).name if t_path else f"{stem}_{lang}{fmt}"
        entry = {
            "lang": lang,
            "format": fmt,
            "filename": fname,
            "tos_path": t_path,
            "url": p_url,
        }
        caption_files.append(entry)
        captions_by_lang.setdefault(lang, []).append(entry)

    font_cls_map = {"en-US": "lang-en", "ja-JP": "lang-ja", "ko-KR": "lang-ko"}
    cards: list[dict[str, Any]] = []
    parsed_by_lang: dict[str, list[dict[str, str]]] = {}

    for lang in req_langs:
        lang_info = OUTPUT_LANG_MAP.get(lang, {"code": lang, "name": lang})
        v_item = videos_by_lang.get(lang, {})
        a_item = audios_by_lang.get(lang, {})
        v_tos = v_item.get("tos_path") or ""
        v_url = v_item.get("presigned_url") or ""
        v_bytes = tos_service.head_tos_uri(v_tos)
        size_str = f"MP4 · {round(max(0.05, v_bytes / (1024 * 1024)), 2)} MB" if v_bytes else "MP4 · 云端成片"

        lang_caps = captions_by_lang.get(lang, [])
        cap_labels = [c["format"].lstrip(".").upper() for c in lang_caps]
        if a_item:
            cap_labels.append("WAV")

        # Parse real translated subtitle lines from .srt (fallback to first text caption)
        srt_item = next((c for c in lang_caps if c["format"] == ".srt"), lang_caps[0] if lang_caps else None)
        if srt_item:
            raw_txt = tos_service.read_tos_text(srt_item.get("tos_path"))
            if not raw_txt and srt_item.get("url"):
                try:
                    r = httpx.get(srt_item["url"], timeout=8.0)
                    if r.status_code == 200:
                        raw_txt = r.content.decode("utf-8-sig", errors="replace")
                except Exception:
                    raw_txt = None
            if raw_txt:
                parsed_by_lang[lang] = parse_srt_entries(raw_txt, max_items=10)

        cards.append(
            {
                "code": lang,
                "label": f"{lang} · {lang_info['name']}",
                "font_class": font_cls_map.get(lang, "lang-en"),
                "size": size_str,
                "captions": " + ".join(cap_labels) if cap_labels else "MP4",
                "video_url": v_url,
                "tos_path": v_tos,
                "audio_url": a_item.get("presigned_url") or "",
                "audio_tos_path": a_item.get("tos_path") or "",
            }
        )

    # Assemble aligned caption_lines from real SRT outputs
    short_key_map = {"zh-CN": "zh", "en-US": "en", "ja-JP": "ja", "ko-KR": "ko"}
    caption_lines: list[dict[str, Any]] = []
    max_len = max((len(v) for v in parsed_by_lang.values()), default=0)
    for i in range(max_len):
        primary_lang = req_langs[0] if req_langs else "en-US"
        p_entries = parsed_by_lang.get(primary_lang, [])
        t_code = p_entries[i]["time"] if i < len(p_entries) else f"00:00:{i * 3:02d}"
        by_lang: dict[str, str] = {}
        row: dict[str, Any] = {"time": t_code, "zh": f"原声片段 #{i + 1}", "en": "", "ja": "", "ko": ""}
        for lang, entries in parsed_by_lang.items():
            if i < len(entries):
                txt = entries[i]["text"]
                by_lang[lang] = txt
                sk = short_key_map.get(lang)
                if sk:
                    row[sk] = txt
        if not row["en"] and by_lang:
            row["en"] = next(iter(by_lang.values()))
        row["by_lang"] = by_lang
        caption_lines.append(row)

    repaired_obj = None
    if raw_repaired:
        rep0 = raw_repaired[0]
        rep_tos = rep0.get("tos_path") or ""
        rep_bytes = tos_service.head_tos_uri(rep_tos)
        rep_dur = float(rep0.get("video_duration") or data.get("video_duration") or 0.0)
        dm, ds = divmod(max(0, int(round(rep_dur))), 60)
        repaired_obj = {
            "task_id": rep0.get("task_id") or "",
            "resolution": resolution,
            "duration": f"{dm}:{ds:02d}" if rep_dur > 0 else "已同步",
            "size_mb": round(max(0.05, rep_bytes / (1024 * 1024)), 2) if rep_bytes else 0.0,
            "url": rep0.get("presigned_url") or "",
            "tos_path": rep_tos,
        }

    total_files = len(cards) + len(caption_files) + len(audios_by_lang) + (1 if repaired_obj else 0)
    enable_inpaint = bool(request_payload.get("enable_video_inpaint"))

    data.update(
        {
            "source_lang": source_lang_name,
            "source_lang_code": source_lang_code,
            "target_langs": req_langs,
            "dubbing_mode": request_payload.get("dubbing_mode") or "high_quality",
            "fast_mode": bool(request_payload.get("enable_fast_mode")),
            "enable_inpaint": enable_inpaint,
            "elapsed_label": _format_elapsed(started_at, finished_at),
            "total_files": max(1, total_files),
            "bill_minutes": round(bill_minutes, 2),
            "total_cost": round(total_cost, 2),
            "repaired_video": repaired_obj,
            "cards": cards,
            "caption_files": caption_files,
            "caption_lines": caption_lines,
            "_normalized": True,
        }
    )
    return data


las_client = VolcengineLasClient()
