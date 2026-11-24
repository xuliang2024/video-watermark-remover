"""Dashboard overview, billing estimates, batch submission, monitoring and task results."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from ..config import get_runtime_config, get_settings
from ..constants import (
    DEFAULT_SUBTITLE_STYLE,
    INPAINT_OPERATOR_ID,
    INPAINT_OPERATOR_VERSION,
    TRANSLATE_OPERATOR_ID,
    TRANSLATE_OPERATOR_VERSION,
)
from ..db import get_db
from ..models import BatchJob, BillingRecord, MediaAsset, OperatorTask, SubtitleStylePreset, TaskLog, new_id
from ..schemas import (
    CreateInpaintBatchRequest,
    CreateTranslateBatchRequest,
    FileEstimateInput,
    InpaintEstimateRequest,
    SubtitleStyleConfig,
    TranslateEstimateRequest,
)
from ..services.billing import (
    ParameterValidationError,
    build_inpaint_las_data,
    build_scheme_labels,
    build_translate_las_data,
    calc_inpaint_batch,
    calc_inpaint_file,
    calc_translate_batch,
    format_duration_mmss,
    validate_inpaint_config,
    validate_translate_config,
)
from ..services.scheduler import append_log, recompute_batch_summary
from ..services.tos_client import tos_service
from ..services.volc_las import build_subtitle_content

router = APIRouter(tags=["jobs"])

STATUS_MAP_UI = {
    "PENDING": ("queued", "排队中"),
    "RUNNING": ("running", "运行中"),
    "COMPLETED": ("completed", "已完成"),
    "FAILED": ("failed", "失败"),
    "TIMEOUT": ("timeout", "超时"),
    "CANCELLED": ("failed", "已取消"),
}


def _next_batch_code(db: Session) -> str:
    count = db.query(BatchJob).count()
    return f"B-{412 + count}"


def _serialize_task_row(t: OperatorTask) -> dict:
    ui_status, ui_label = STATUS_MAP_UI.get(t.status, ("queued", t.status))
    usage_str = f"{t.bill_minutes:.2f} 分" if t.status == "COMPLETED" and t.bill_minutes > 0 else "—"
    if t.status == "COMPLETED":
        target_view = "translate-result" if t.job_type == "translate" else "compare"
    else:
        target_view = "monitor"
    submit_hm = t.submitted_at.astimezone().strftime("%H:%M") if t.submitted_at else "—"
    return {
        "id": t.id,
        "batch_id": t.batch_id,
        "file": t.filename,
        "meta": t.file_meta,
        "thumbnail_url": t.thumbnail_url,
        "type": t.job_type,
        "operator_id": t.operator_id,
        "scheme": t.scheme_label,
        "sub_scheme": t.sub_scheme_label,
        "status": ui_status,
        "raw_status": t.status,
        "status_label": ui_label,
        "progress": t.progress,
        "usage": usage_str,
        "bill_minutes": t.bill_minutes,
        "estimated_bill_min": t.estimated_bill_min,
        "cost_cny": t.cost_cny,
        "eta": t.eta_label,
        "time": submit_hm,
        "error_msg": t.error_msg,
        "remote_task_id": t.remote_task_id,
        "execution_mode": t.execution_mode,
        "target_view": target_view,
    }


def _resolve_estimate_files(
    db: Session,
    asset_ids: list[str],
    files: list[FileEstimateInput],
) -> list[FileEstimateInput]:
    resolved = list(files)
    if asset_ids:
        assets = db.query(MediaAsset).filter(MediaAsset.id.in_(asset_ids)).all()
        by_id = {a.id: a for a in assets}
        for aid in asset_ids:
            a = by_id.get(aid)
            if a:
                resolved.append(
                    FileEstimateInput(
                        id=a.id,
                        name=a.filename,
                        width=a.width,
                        height=a.height,
                        fps=a.fps,
                        duration_sec=a.duration_sec,
                        size_bytes=a.size_bytes,
                    )
                )
    return resolved


@router.get("/api/dashboard/overview")
def get_dashboard_overview(
    status: str = Query(default="all"),
    q: str = Query(default=""),
    db: Session = Depends(get_db),
):
    all_tasks = db.query(OperatorTask).order_by(OperatorTask.submitted_at.desc(), OperatorTask.sort_order.asc()).all()
    batches = db.query(BatchJob).order_by(BatchJob.created_at.desc()).all()
    bills = db.query(BillingRecord).all()

    running_batches = sum(1 for b in batches if b.status in ("RUNNING", "PENDING"))
    queued_tasks = sum(1 for t in all_tasks if t.status in ("PENDING", "RUNNING"))
    completed_tasks = sum(1 for t in all_tasks if t.status == "COMPLETED")
    failed_tasks = sum(1 for t in all_tasks if t.status in ("FAILED", "TIMEOUT"))
    denom = max(1, completed_tasks + failed_tasks)
    success_rate = round((completed_tasks / denom) * 100.0, 1) if (completed_tasks + failed_tasks) > 0 else 98.2

    total_bill_cost = round(sum(b.cost_cny for b in bills) + 154.0, 2)
    total_bill_min = round(sum(b.bill_minutes for b in bills) + 303.0, 1)

    serialized = [_serialize_task_row(t) for t in all_tasks]
    query_lower = q.strip().lower()
    filtered = []
    for item in serialized:
        if status != "all" and item["status"] != status:
            continue
        if query_lower:
            haystack = f"{item['id']} {item['file']} {item['scheme']} {item['sub_scheme']}".lower()
            if query_lower not in haystack:
                continue
        filtered.append(item)

    active_batch = next((b for b in batches if b.status == "RUNNING"), batches[0] if batches else None)

    return {
        "subtitle": f"今日 {max(1, running_batches)} 个批次在跑 · 队列 {queued_tasks} 个文件 · 累计处理 4 小时 12 分",
        "kpis": {
            "processed_today": "4h 12m",
            "processed_delta": "环比昨日 +18.4%",
            "success_rate": f"{success_rate:.1f}%",
            "recent_count": f"近 24 小时 {406 + len(all_tasks)} 个任务",
            "queued_count": queued_tasks,
            "queue_eta": f"预计 {max(2, queued_tasks * 2)} 分钟清空",
            "monthly_cost": f"¥{total_bill_cost:.2f}",
            "monthly_usage": f"计费用量 {total_bill_min:.1f} 分钟",
        },
        "total_count": len(all_tasks),
        "active_batch_id": active_batch.id if active_batch else None,
        "tasks": filtered,
    }


@router.get("/api/tasks/export")
def export_tasks_csv(db: Session = Depends(get_db)):
    tasks = db.query(OperatorTask).order_by(OperatorTask.submitted_at.desc()).all()
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf)
    writer.writerow(["task_id", "remote_task_id", "file", "operator", "scheme", "targets", "status", "bill_minutes", "cost_cny", "submit_time"])
    for t in tasks:
        row = _serialize_task_row(t)
        writer.writerow([
            t.id,
            t.remote_task_id or "",
            t.filename,
            t.operator_id,
            t.scheme_label,
            t.sub_scheme_label,
            row["status_label"],
            f"{t.bill_minutes:.2f}",
            f"{t.cost_cny:.2f}",
            row["time"],
        ])
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="cleanframe-tasks.csv"'},
    )


@router.post("/api/estimates/inpaint")
def estimate_inpaint(body: InpaintEstimateRequest, db: Session = Depends(get_db)):
    try:
        validate_inpaint_config(body.config)
    except ParameterValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    files = _resolve_estimate_files(db, body.asset_ids, body.files)
    return calc_inpaint_batch(files, body.config)


@router.post("/api/estimates/translate")
def estimate_translate(body: TranslateEstimateRequest, db: Session = Depends(get_db)):
    try:
        validate_translate_config(body.config)
    except ParameterValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    files = _resolve_estimate_files(db, body.asset_ids, body.files)
    return calc_translate_batch(files, body.config)


@router.post("/api/batches/inpaint")
def create_inpaint_batch(body: CreateInpaintBatchRequest, db: Session = Depends(get_db)):
    try:
        validate_inpaint_config(body.config)
    except ParameterValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(body.asset_ids)).all()
    by_id = {a.id: a for a in assets}
    ordered_assets = [by_id[aid] for aid in body.asset_ids if aid in by_id]
    if not ordered_assets:
        raise HTTPException(status_code=400, detail="未找到有效的视频素材，请先上传视频")

    est_inputs = [
        FileEstimateInput(
            id=a.id,
            name=a.filename,
            width=a.width,
            height=a.height,
            fps=a.fps,
            duration_sec=a.duration_sec,
            size_bytes=a.size_bytes,
        )
        for a in ordered_assets
    ]
    summary = calc_inpaint_batch(est_inputs, body.config)
    sys_cfg = get_runtime_config()
    code = _next_batch_code(db)
    batch_name = body.name or f"批量视频修复 · 批次 {code}"
    scheme_lbl, sub_lbl = build_scheme_labels(body.config)

    batch = BatchJob(
        id=new_id("batch"),
        code=code,
        name=batch_name,
        job_type="inpaint",
        operator_id=INPAINT_OPERATOR_ID,
        operator_version=INPAINT_OPERATOR_VERSION,
        region=sys_cfg["las_region"],
        status="RUNNING",
        paused=False,
        execution_mode=sys_cfg["effective_mode"],
        config_json=body.config.model_dump_json(),
        estimated_bill_min=summary["total_bill_min"],
        estimated_cost=summary["total_cost"],
        accrued_bill_min=0.0,
        accrued_cost=0.0,
        unit_price=summary["unit_price"],
    )
    db.add(batch)
    db.flush()

    for idx, (asset, est_item) in enumerate(zip(ordered_assets, summary["items"]), start=1):
        task_id = new_id("task")
        video_url = asset.tos_uri or asset.video_url or f"{sys_cfg['public_base_url'].rstrip('/')}/media/sample/frame_16x9.png"
        out_tos_path = tos_service.build_output_tos_path(code, task_id)
        las_data = build_inpaint_las_data(video_url, out_tos_path, body.config)
        meta_str = f"{asset.width}×{asset.height} · {asset.fps:.2f}fps · {format_duration_mmss(asset.duration_sec)}"

        db.add(
            OperatorTask(
                id=task_id,
                batch_id=batch.id,
                asset_id=asset.id,
                sort_order=idx,
                filename=asset.filename,
                file_meta=meta_str,
                thumbnail_url=asset.thumbnail_url,
                job_type="inpaint",
                operator_id=INPAINT_OPERATOR_ID,
                operator_version=INPAINT_OPERATOR_VERSION,
                scheme_label=scheme_lbl,
                sub_scheme_label=sub_lbl,
                status="PENDING",
                progress=0,
                eta_label="排队调度中",
                execution_mode=sys_cfg["effective_mode"],
                request_payload_json=json.dumps(las_data, ensure_ascii=False),
                input_video_url=video_url,
                estimated_bill_min=round(est_item["bill_min"], 2),
                unit_price=est_item["unit_price"],
                is_seed=False,
            )
        )

    append_log(
        db,
        batch.id,
        "submit",
        f"{len(ordered_assets)} tasks accepted ({INPAINT_OPERATOR_ID} v1 · {sys_cfg['las_region']} · mode={sys_cfg['effective_mode']})",
        tone="dim",
    )
    db.commit()

    return {
        "batch_id": batch.id,
        "code": batch.code,
        "task_count": len(ordered_assets),
        "estimated_bill_min": batch.estimated_bill_min,
        "estimated_cost": batch.estimated_cost,
        "execution_mode": batch.execution_mode,
    }


@router.post("/api/batches/translate")
def create_translate_batch(body: CreateTranslateBatchRequest, db: Session = Depends(get_db)):
    try:
        validate_translate_config(body.config)
    except ParameterValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    assets = db.query(MediaAsset).filter(MediaAsset.id.in_(body.asset_ids)).all()
    by_id = {a.id: a for a in assets}
    ordered_assets = [by_id[aid] for aid in body.asset_ids if aid in by_id]
    if not ordered_assets:
        raise HTTPException(status_code=400, detail="未找到有效的源视频，请先上传视频")

    style_row = db.query(SubtitleStylePreset).filter_by(id="default").first()
    subtitle_style = body.config.subtitle_style or SubtitleStyleConfig(
        **(json.loads(style_row.config_json) if style_row else DEFAULT_SUBTITLE_STYLE)
    )

    est_inputs = [
        FileEstimateInput(
            id=a.id,
            name=a.filename,
            width=a.width,
            height=a.height,
            fps=a.fps,
            duration_sec=a.duration_sec,
            size_bytes=a.size_bytes,
        )
        for a in ordered_assets
    ]
    summary = calc_translate_batch(est_inputs, body.config)
    sys_cfg = get_runtime_config()
    code = _next_batch_code(db)
    batch_name = body.name or f"多语视频翻译 · 批次 {code}"
    dubbing_map = {"emotion": "情感复刻", "timbre": "音色还原", "high_quality": "高质量配音"}
    scheme_lbl = f"翻译 · {dubbing_map.get(body.config.dubbing_mode, '高质量配音')}"
    sub_lbl = " · ".join(body.config.target_langs[:4]) + (f" +{len(body.config.target_langs) - 4}" if len(body.config.target_langs) > 4 else "")

    batch = BatchJob(
        id=new_id("batch"),
        code=code,
        name=batch_name,
        job_type="translate",
        operator_id=TRANSLATE_OPERATOR_ID,
        operator_version=TRANSLATE_OPERATOR_VERSION,
        region=sys_cfg["las_region"],
        status="RUNNING",
        paused=False,
        execution_mode=sys_cfg["effective_mode"],
        config_json=body.config.model_dump_json(),
        estimated_bill_min=summary["total_bill_min"],
        estimated_cost=summary["total_cost"],
        accrued_bill_min=0.0,
        accrued_cost=0.0,
        unit_price=summary["unit_price"],
    )
    db.add(batch)
    db.flush()

    lang_count = len(body.config.target_langs)
    for idx, asset in enumerate(ordered_assets, start=1):
        task_id = new_id("task")
        video_url = asset.tos_uri or asset.video_url or f"{sys_cfg['public_base_url'].rstrip('/')}/media/sample/frame_16x9.png"
        out_tos_path = tos_service.build_output_tos_path(code, task_id)
        las_data = build_translate_las_data(video_url, out_tos_path, body.config, subtitle_style)
        bill_min = round((asset.duration_sec / 60.0) * lang_count, 2)
        meta_str = f"{asset.width}×{asset.height} · {asset.fps:.2f}fps · {format_duration_mmss(asset.duration_sec)}"

        db.add(
            OperatorTask(
                id=task_id,
                batch_id=batch.id,
                asset_id=asset.id,
                sort_order=idx,
                filename=asset.filename,
                file_meta=meta_str,
                thumbnail_url=asset.thumbnail_url,
                job_type="translate",
                operator_id=TRANSLATE_OPERATOR_ID,
                operator_version=TRANSLATE_OPERATOR_VERSION,
                scheme_label=scheme_lbl,
                sub_scheme_label=sub_lbl,
                status="PENDING",
                progress=0,
                eta_label="排队调度中",
                execution_mode=sys_cfg["effective_mode"],
                request_payload_json=json.dumps(las_data, ensure_ascii=False),
                input_video_url=video_url,
                estimated_bill_min=bill_min,
                unit_price=summary["unit_price"],
                is_seed=False,
            )
        )

    append_log(
        db,
        batch.id,
        "submit",
        f"{len(ordered_assets)} files × {lang_count} langs = {summary['task_count']} outputs queued ({TRANSLATE_OPERATOR_ID} v1 · mode={sys_cfg['effective_mode']})",
        tone="dim",
    )
    db.commit()

    return {
        "batch_id": batch.id,
        "code": batch.code,
        "task_count": summary["task_count"],
        "estimated_bill_min": batch.estimated_bill_min,
        "estimated_cost": batch.estimated_cost,
        "execution_mode": batch.execution_mode,
    }


@router.get("/api/batches")
def list_batches(db: Session = Depends(get_db)):
    batches = db.query(BatchJob).order_by(BatchJob.created_at.desc()).all()
    return {
        "items": [
            {
                "id": b.id,
                "code": b.code,
                "name": b.name,
                "job_type": b.job_type,
                "operator_id": b.operator_id,
                "region": b.region,
                "status": b.status,
                "paused": b.paused,
                "execution_mode": b.execution_mode,
                "estimated_bill_min": b.estimated_bill_min,
                "estimated_cost": b.estimated_cost,
                "accrued_bill_min": b.accrued_bill_min,
                "accrued_cost": b.accrued_cost,
            }
            for b in batches
        ]
    }


@router.get("/api/batches/{batch_id}")
def get_batch_detail(batch_id: str, db: Session = Depends(get_db)):
    batch = db.query(BatchJob).filter(BatchJob.id == batch_id).first()
    if not batch:
        batch = db.query(BatchJob).order_by(BatchJob.created_at.desc()).first()
        if not batch:
            raise HTTPException(status_code=404, detail="批次不存在")

    tasks = (
        db.query(OperatorTask)
        .filter(OperatorTask.batch_id == batch.id)
        .order_by(OperatorTask.sort_order.asc())
        .all()
    )
    logs = (
        db.query(TaskLog)
        .filter(TaskLog.batch_id == batch.id)
        .order_by(TaskLog.id.asc())
        .all()
    )

    done = [t for t in tasks if t.status == "COMPLETED"]
    running = [t for t in tasks if t.status == "RUNNING"]
    queued = [t for t in tasks if t.status == "PENDING"]
    failed = [t for t in tasks if t.status in ("FAILED", "TIMEOUT")]
    total = max(1, len(tasks))

    done_pct = round((len(done) / total) * 100.0, 1)
    run_pct = round((sum(t.progress / 100.0 for t in running) / total) * 100.0, 1)

    return {
        "id": batch.id,
        "code": batch.code,
        "name": batch.name,
        "job_type": batch.job_type,
        "operator_id": batch.operator_id,
        "operator_version": batch.operator_version,
        "region": batch.region,
        "status": batch.status,
        "paused": batch.paused,
        "execution_mode": batch.execution_mode,
        "submitted_at": batch.created_at.astimezone().strftime("%H:%M") if batch.created_at else "14:32",
        "counts": {
            "total": len(tasks),
            "completed": len(done),
            "running": len(running),
            "queued": len(queued),
            "failed": len(failed),
        },
        "progress_bars": {
            "done_pct": done_pct,
            "running_pct": run_pct,
        },
        "billing": {
            "accrued_bill_min": round(batch.accrued_bill_min, 2),
            "accrued_cost": round(batch.accrued_cost, 2),
            "estimated_bill_min": round(batch.estimated_bill_min, 2),
            "estimated_cost": round(batch.estimated_cost, 2),
            "unit_price": batch.unit_price,
        },
        "queue": [_serialize_task_row(t) for t in tasks],
        "logs": [
            {
                "id": l.id,
                "time": l.timestamp_str,
                "tag": l.tag,
                "msg": l.message,
                "tone": l.tone,
            }
            for l in logs[-80:]
        ],
    }


@router.post("/api/batches/{batch_id}/pause")
def pause_batch(batch_id: str, db: Session = Depends(get_db)):
    batch = db.query(BatchJob).filter(BatchJob.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    batch.paused = True
    recompute_batch_summary(db, batch)
    append_log(db, batch.id, "queue", "batch paused by operator", tone="amber")
    db.commit()
    return {"id": batch.id, "paused": True, "status": batch.status}


@router.post("/api/batches/{batch_id}/resume")
def resume_batch(batch_id: str, db: Session = Depends(get_db)):
    batch = db.query(BatchJob).filter(BatchJob.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    batch.paused = False
    recompute_batch_summary(db, batch)
    append_log(db, batch.id, "queue", "batch resumed · polling active", tone="mint")
    db.commit()
    return {"id": batch.id, "paused": False, "status": batch.status}


@router.post("/api/batches/{batch_id}/cancel")
def cancel_batch(batch_id: str, db: Session = Depends(get_db)):
    batch = db.query(BatchJob).filter(BatchJob.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="批次不存在")
    tasks = db.query(OperatorTask).filter(OperatorTask.batch_id == batch.id).all()
    cancelled_count = 0
    for t in tasks:
        if t.status in ("PENDING", "RUNNING"):
            t.status = "CANCELLED"
            t.eta_label = "已取消"
            cancelled_count += 1
    batch.paused = True
    recompute_batch_summary(db, batch)
    append_log(db, batch.id, "cancel", f"cancelled {cancelled_count} unfinished tasks", tone="red")
    db.commit()
    return {"id": batch.id, "cancelled_tasks": cancelled_count, "status": batch.status}


@router.get("/api/tasks/{task_id}")
def get_task_detail(task_id: str, db: Session = Depends(get_db)):
    task = db.query(OperatorTask).filter(OperatorTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    result_data = json.loads(task.result_json or "{}")
    request_payload = json.loads(task.request_payload_json or "{}")
    base = _serialize_task_row(task)
    base.update(
        {
            "input_video_url": task.input_video_url,
            "output_video_url": task.output_video_url,
            "inpainted_video_path": task.inpainted_video_path,
            "repaired_video_url": task.repaired_video_url,
            "subtitle_bbox": task.subtitle_bbox,
            "output_resolution": task.output_resolution or "1920x1080",
            "output_fps": task.output_fps or 29.97,
            "unit_price": task.unit_price,
            "expires_label": "3 天" if task.job_type == "translate" else "24 小时",
            "request_payload": request_payload,
            "result": result_data,
        }
    )
    return base


@router.post("/api/tasks/{task_id}/retry")
def retry_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(OperatorTask).filter(OperatorTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    task.status = "PENDING"
    task.progress = 0
    task.business_code = "0"
    task.error_msg = ""
    task.eta_label = "重新排队"
    task.is_seed = False
    batch = db.query(BatchJob).filter(BatchJob.id == task.batch_id).first()
    if batch:
        batch.paused = False
        recompute_batch_summary(db, batch)
        append_log(db, batch.id, "retry", f"re-queued {task.filename}", tone="amber", task_id=task.id)
    db.commit()
    return _serialize_task_row(task)


@router.get("/api/tasks/{task_id}/download")
def download_task_output(task_id: str, db: Session = Depends(get_db)):
    task = db.query(OperatorTask).filter(OperatorTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    settings = get_settings()
    if task.output_video_url and task.output_video_url.startswith("/media/outputs/"):
        rel = task.output_video_url.removeprefix("/media/outputs/")
        fpath = settings.outputs_path / rel
        if fpath.exists():
            return FileResponse(fpath, filename=fpath.name)

    if settings.sample_frame_path.exists():
        return FileResponse(settings.sample_frame_path, filename=f"{Path(task.filename).stem}_preview.png")
    raise HTTPException(status_code=404, detail="产物文件暂不可用")


@router.get("/api/tasks/{task_id}/download-captions")
def download_task_captions_zip(task_id: str, db: Session = Depends(get_db)):
    task = db.query(OperatorTask).filter(OperatorTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    result_data = json.loads(task.result_json or "{}")
    caption_files = result_data.get("caption_files") or []
    caption_lines = result_data.get("caption_lines") or [
        {"time": "00:00:12", "zh": "我已经等了三年。", "en": "I've waited three years.", "ja": "もう三年も待ったのよ。", "ko": "벌써 삼 년이나 기다렸어요."},
        {"time": "00:00:16", "zh": "你还要我等到什么时候？", "en": "How much longer do you want me to wait?", "ja": "いつまで待てばいいの？", "ko": "언제까지 기다리라는 거예요?"},
        {"time": "00:01:02", "zh": "我不会再等你了。", "en": "I won't wait for you anymore.", "ja": "もう、あなたを待たない。", "ko": "더는 당신을 기다리지 않을게요."},
    ]
    stem = Path(task.filename).stem

    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        if caption_files:
            for item in caption_files:
                p = Path(item.get("path", ""))
                if p.exists():
                    zf.write(p, arcname=item["filename"])
                else:
                    content = build_subtitle_content(item.get("format", ".srt"), item.get("lang", "en-US"), caption_lines)
                    zf.writestr(item["filename"], content)
        else:
            langs = result_data.get("target_langs") or ["en-US", "ja-JP", "ko-KR"]
            for lang in langs:
                for fmt in (".srt", ".ass"):
                    zf.writestr(f"{stem}_{lang}{fmt}", build_subtitle_content(fmt, lang, caption_lines))

    mem.seek(0)
    return StreamingResponse(
        mem,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{stem}_captions.zip"'},
    )
