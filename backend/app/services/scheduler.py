"""Background 10-concurrency scheduler and polling worker for Volcengine LAS tasks."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..config import get_runtime_config, get_settings
from ..constants import INPAINT_OPERATOR_ID, LAS_ERROR_HINTS
from ..db import SessionLocal
from ..models import BatchJob, BillingRecord, MediaAsset, OperatorTask, TaskLog
from .volc_las import LasApiError, las_client

logger = logging.getLogger(__name__)


def _now_hms() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _short_tag(filename: str) -> str:
    base = filename.split("_")[0].split(".")[0]
    return base[:8] if base else "TASK"


def append_log(db: Session, batch_id: str, tag: str, message: str, tone: str = "normal", task_id: str | None = None) -> None:
    db.add(
        TaskLog(
            batch_id=batch_id,
            task_id=task_id,
            timestamp_str=_now_hms(),
            tag=tag,
            message=message,
            tone=tone,
        )
    )


def recompute_batch_summary(db: Session, batch: BatchJob) -> None:
    tasks = db.query(OperatorTask).filter(OperatorTask.batch_id == batch.id).all()
    if not tasks:
        return
    done = [t for t in tasks if t.status == "COMPLETED"]
    running = [t for t in tasks if t.status == "RUNNING"]
    pending = [t for t in tasks if t.status == "PENDING"]
    failed = [t for t in tasks if t.status in ("FAILED", "TIMEOUT")]
    cancelled = [t for t in tasks if t.status == "CANCELLED"]

    batch.accrued_bill_min = round(sum(t.bill_minutes for t in done), 2)
    batch.accrued_cost = round(sum(t.cost_cny for t in done), 2)

    if running or pending:
        batch.status = "PAUSED" if batch.paused else "RUNNING"
    elif cancelled and len(cancelled) == len(tasks):
        batch.status = "CANCELLED"
    elif failed and not done:
        batch.status = "FAILED"
    elif failed:
        batch.status = "PARTIAL_FAILED"
    else:
        batch.status = "COMPLETED"


def finalize_task_completed(db: Session, task: OperatorTask, data: dict) -> None:
    now = datetime.now(timezone.utc)
    already_completed = task.status == "COMPLETED"
    task.status = "COMPLETED"
    task.progress = 100
    task.eta_label = datetime.now().strftime("%H:%M")
    task.finished_at = now
    task.business_code = "0"
    task.error_msg = ""

    if task.job_type == "inpaint":
        task.output_video_url = data.get("output_video_url") or task.output_video_url
        task.inpainted_video_path = data.get("inpainted_video_path") or task.inpainted_video_path
        task.subtitle_bbox = data.get("subtitle_bbox") or task.subtitle_bbox
        task.output_resolution = data.get("resolution") or task.output_resolution
        if data.get("output_fps"):
            task.output_fps = float(data["output_fps"])
        task.expires_at = now + timedelta(hours=24)
    else:
        cards = data.get("cards") or []
        if cards:
            task.output_video_url = cards[0].get("video_url") or task.output_video_url
        repaired = data.get("repaired_video") or {}
        if repaired:
            task.repaired_video_url = repaired.get("url")
        task.expires_at = now + timedelta(hours=72)

    task.result_json = json.dumps(data, ensure_ascii=False)
    task.bill_minutes = round(task.estimated_bill_min, 2)
    task.cost_cny = round(task.bill_minutes * task.unit_price, 2)

    if not already_completed:
        batch = db.query(BatchJob).filter(BatchJob.id == task.batch_id).first()
        code = batch.code if batch else task.batch_id
        op_label = (
            f"视频修复 · {task.scheme_label}"
            if task.job_type == "inpaint"
            else f"视频智能剪辑 · {task.scheme_label}"
        )
        db.add(
            BillingRecord(
                batch_id=task.batch_id,
                task_id=task.id,
                billed_at_str=datetime.now().strftime("%Y-%m-%d %H:%M"),
                batch_label=f"{code} · {task.filename}",
                operator_label=op_label,
                job_type=task.job_type,
                unit_price_str=f"¥{task.unit_price:.2f}/分",
                bill_minutes=task.bill_minutes,
                cost_cny=task.cost_cny,
            )
        )
        append_log(
            db,
            task.batch_id,
            _short_tag(task.filename),
            f"COMPLETED   {task.bill_minutes:.2f} min · ¥{task.cost_cny:.2f}",
            tone="mint",
            task_id=task.id,
        )


def finalize_task_failed(db: Session, task: OperatorTask, status: str, business_code: str, error_msg: str) -> None:
    task.status = status if status in ("FAILED", "TIMEOUT") else "FAILED"
    task.business_code = business_code or "Task.Failed"
    hint = LAS_ERROR_HINTS.get(task.business_code)
    task.error_msg = error_msg or hint or "算子执行失败"
    task.eta_label = "超时" if task.status == "TIMEOUT" else "失败"
    task.finished_at = datetime.now(timezone.utc)
    append_log(
        db,
        task.batch_id,
        _short_tag(task.filename),
        f"{task.status}  {task.business_code}: {task.error_msg}",
        tone="red",
        task_id=task.id,
    )


class TaskScheduler:
    """Periodically dispatches PENDING tasks (up to max_concurrency) and polls RUNNING tasks."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        settings = get_settings()
        if not settings.scheduler_enabled:
            return
        if self._task and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._loop(), name="cleanframe-scheduler")
        logger.info("CleanFrame scheduler started (poll=%.1fs)", settings.poll_interval_seconds)

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.tick_once()
            except Exception as exc:
                logger.exception("Scheduler tick error: %s", exc)
            interval = get_runtime_config().get("poll_interval_seconds", 3.0)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=float(interval))
            except asyncio.TimeoutError:
                continue

    async def tick_once(self) -> None:
        """Execute one scheduling + polling cycle. Callable synchronously in tests."""
        db = SessionLocal()
        try:
            cfg = get_runtime_config()
            max_conc = int(cfg.get("max_concurrency", 10))
            touched_batches: set[str] = set()

            # 1. Poll active RUNNING non-seed tasks (and non-paused seed tasks if user resumed)
            running_tasks = (
                db.query(OperatorTask)
                .join(BatchJob, OperatorTask.batch_id == BatchJob.id)
                .filter(OperatorTask.status == "RUNNING", OperatorTask.is_seed.is_(False), BatchJob.paused.is_(False))
                .all()
            )
            for task in running_tasks:
                await self._poll_single_task(db, task)
                touched_batches.add(task.batch_id)

            # 2. Dispatch PENDING non-seed tasks within concurrency budget
            active_count = db.query(OperatorTask).filter(OperatorTask.status == "RUNNING", OperatorTask.is_seed.is_(False)).count()
            slots = max(0, max_conc - active_count)
            if slots > 0:
                pending_tasks = (
                    db.query(OperatorTask)
                    .join(BatchJob, OperatorTask.batch_id == BatchJob.id)
                    .filter(OperatorTask.status == "PENDING", OperatorTask.is_seed.is_(False), BatchJob.paused.is_(False))
                    .order_by(OperatorTask.submitted_at.asc(), OperatorTask.sort_order.asc())
                    .limit(slots)
                    .all()
                )
                for task in pending_tasks:
                    await self._dispatch_single_task(db, task)
                    touched_batches.add(task.batch_id)

            for batch_id in touched_batches:
                batch = db.query(BatchJob).filter(BatchJob.id == batch_id).first()
                if batch:
                    recompute_batch_summary(db, batch)

            db.commit()
        finally:
            db.close()

    async def _dispatch_single_task(self, db: Session, task: OperatorTask) -> None:
        payload = json.loads(task.request_payload_json or "{}")
        tag = _short_tag(task.filename)
        try:
            resp = await las_client.submit_operator(
                operator_id=task.operator_id,
                operator_version=task.operator_version,
                data=payload,
            )
            meta = resp.get("metadata", {})
            task.remote_task_id = meta.get("task_id")
            task.status = "RUNNING"
            task.progress = 15 if task.execution_mode == "mock" else 5
            task.started_at = datetime.now(timezone.utc)
            task.eta_label = "处理中"
            append_log(
                db,
                task.batch_id,
                tag,
                f"PENDING → RUNNING  ({task.remote_task_id})",
                tone="normal",
                task_id=task.id,
            )
        except LasApiError as exc:
            finalize_task_failed(db, task, "FAILED", exc.business_code, str(exc))
        except Exception as exc:
            finalize_task_failed(db, task, "FAILED", "LAS.SubmitError", str(exc))

    async def _poll_single_task(self, db: Session, task: OperatorTask) -> None:
        tag = _short_tag(task.filename)
        if task.execution_mode == "mock":
            next_progress = min(100, task.progress + 35)
            task.progress = next_progress
            if next_progress < 100:
                append_log(
                    db,
                    task.batch_id,
                    "poll",
                    f"{task.remote_task_id or task.id} RUNNING · {next_progress}%",
                    tone="faint",
                    task_id=task.id,
                )
                return

            payload = json.loads(task.request_payload_json or "{}")
            asset = db.query(MediaAsset).filter(MediaAsset.id == task.asset_id).first() if task.asset_id else None
            local_path = asset.local_path if asset else None
            if task.job_type == "inpaint":
                data = las_client.generate_mock_inpaint_result(
                    task_id=task.id,
                    filename=task.filename,
                    source_local_path=local_path,
                    output_tos_path=payload.get("output_tos_path", "tos://cleanframe-demo/outputs/"),
                    width=asset.width if asset else 1920,
                    height=asset.height if asset else 1080,
                    out_fps=min(asset.fps if asset else 30.0, float(payload.get("maximum_output_fps", 30))),
                    codec=payload.get("output_codec", "h264"),
                    targets=payload.get("targets", ["watermark", "subtitle"]),
                )
            else:
                data = las_client.generate_mock_translate_result(
                    task_id=task.id,
                    filename=task.filename,
                    source_local_path=local_path,
                    output_tos_path=payload.get("output_tos_path", "tos://cleanframe-demo/outputs/"),
                    source_lang=payload.get("audio_language", "zh-CN"),
                    target_langs=payload.get("output_languages", ["en-US", "ja-JP", "ko-KR"]),
                    caption_formats=payload.get("caption_formats", [".srt", ".ass"]),
                    enable_inpaint=bool(payload.get("enable_video_inpaint", True)),
                    dubbing_mode=payload.get("dubbing_mode", "high_quality"),
                    fast_mode=bool(payload.get("enable_fast_mode", True)),
                    output_dubbing_audio=bool(payload.get("output_dubbing_audio", False)),
                    bill_minutes=task.estimated_bill_min,
                    total_cost=task.estimated_bill_min * task.unit_price,
                )
            finalize_task_completed(db, task, data)
            return

        # Live Volcengine LAS Poll
        if not task.remote_task_id:
            return
        try:
            resp = await las_client.poll_operator(
                operator_id=task.operator_id,
                operator_version=task.operator_version,
                task_id=task.remote_task_id,
            )
            meta = resp.get("metadata") or {}
            status = str(meta.get("task_status") or "RUNNING").upper()
            bcode = str(meta.get("business_code") or "0")
            emsg = str(meta.get("error_msg") or "")
            data = resp.get("data") or {}

            if status == "COMPLETED" and bcode == "0":
                finalize_task_completed(db, task, data)
            elif status in ("FAILED", "TIMEOUT"):
                finalize_task_failed(db, task, status, bcode, emsg)
            else:
                task.progress = min(92, max(task.progress + 8, 12))
                append_log(
                    db,
                    task.batch_id,
                    "poll",
                    f"{task.remote_task_id} {status}",
                    tone="faint",
                    task_id=task.id,
                )
        except LasApiError as exc:
            append_log(
                db,
                task.batch_id,
                tag,
                f"poll warning: {exc}",
                tone="amber",
                task_id=task.id,
            )


scheduler = TaskScheduler()
