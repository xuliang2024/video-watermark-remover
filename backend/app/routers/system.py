"""System status, Volcengine LAS/TOS config, bootstrap metadata and LAS callback webhook."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import get_runtime_config, get_settings, update_runtime_config
from ..constants import (
    DEFAULT_REGIONS,
    DEFAULT_SUBTITLE_STYLE,
    INPAINT_PRESETS,
    OUTPUT_LANGUAGES,
    SOURCE_LANGUAGES,
    SUPPORTED_REGIONS,
)
from ..db import get_db
from ..models import BatchJob, OperatorTask, RegionTemplate, SubtitleStylePreset
from ..schemas import LasCallbackPayload, SystemConfigUpdate
from ..services.scheduler import (
    finalize_task_completed,
    finalize_task_failed,
    recompute_batch_summary,
)
from ..services.tos_client import tos_service
from ..services.volc_las import las_client

router = APIRouter(tags=["system"])


def _mask_key(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 8:
        return "*" * len(val)
    return f"{val[:4]}****{val[-4:]}"


@router.get("/api/health")
def health():
    cfg = get_runtime_config()
    return {
        "status": "ok",
        "service": "cleanframe-api",
        "effective_mode": cfg["effective_mode"],
        "las_region": cfg["las_region"],
    }


@router.get("/api/system/config")
def get_system_config():
    cfg = get_runtime_config()
    return {
        "execution_mode": cfg["execution_mode"],
        "effective_mode": cfg["effective_mode"],
        "has_las_api_key": cfg["has_las_api_key"],
        "las_api_key_masked": _mask_key(cfg["las_api_key"]),
        "las_region": cfg["las_region"],
        "las_base_url": cfg["las_base_url"],
        "tos_bucket": cfg["tos_bucket"],
        "tos_endpoint": cfg["tos_endpoint"],
        "tos_region": cfg["tos_region"],
        "has_tos_credentials": cfg["has_tos_credentials"],
        "max_concurrency": cfg["max_concurrency"],
        "poll_interval_seconds": cfg["poll_interval_seconds"],
        "callback_url": cfg["callback_url"],
        "supported_regions": SUPPORTED_REGIONS,
    }


@router.put("/api/system/config")
def put_system_config(body: SystemConfigUpdate):
    update_runtime_config(body.model_dump(exclude_unset=True))
    return get_system_config()


@router.post("/api/system/test-connection")
async def test_volcengine_connection():
    las_res = await las_client.test_connection()
    tos_res = tos_service.test_bucket_access()
    return {
        "las": las_res,
        "tos": tos_res,
        "ready_for_live": bool(las_res.get("ok") and tos_res.get("ok")),
    }


@router.get("/api/system/bootstrap")
def get_bootstrap_data(db: Session = Depends(get_db)):
    style_row = db.query(SubtitleStylePreset).filter_by(id="default").first()
    subtitle_style = (
        json.loads(style_row.config_json) if style_row else dict(DEFAULT_SUBTITLE_STYLE)
    )
    templates = db.query(RegionTemplate).order_by(RegionTemplate.updated_at.desc()).all()
    tpl_list = [
        {
            "id": t.id,
            "name": t.name,
            "regions": json.loads(t.regions_json),
            "is_active": t.is_active,
        }
        for t in templates
    ]
    return {
        "system": get_system_config(),
        "source_languages": SOURCE_LANGUAGES,
        "output_languages": OUTPUT_LANGUAGES,
        "inpaint_presets": list(INPAINT_PRESETS.values()),
        "subtitle_style": subtitle_style,
        "region_templates": tpl_list,
        "default_regions": tpl_list[0]["regions"] if tpl_list else DEFAULT_REGIONS,
        "monthly_quota_minutes": get_settings().monthly_quota_minutes,
    }


@router.post("/api/webhooks/las-callback")
def handle_las_callback(payload: LasCallbackPayload, db: Session = Depends(get_db)):
    """Idempotent Volcengine LAS asynchronous callback receiver."""
    remote_id = payload.metadata.task_id
    if not remote_id:
        raise HTTPException(status_code=400, detail="metadata.task_id is required")

    task = db.query(OperatorTask).filter(OperatorTask.remote_task_id == remote_id).first()
    if not task:
        return {"received": True, "matched": False, "task_id": remote_id}

    # Idempotency guard: already terminal
    if task.status in ("COMPLETED", "FAILED", "TIMEOUT", "CANCELLED"):
        return {"received": True, "matched": True, "idempotent_skip": True, "status": task.status}

    status = payload.metadata.task_status.upper()
    if status == "COMPLETED" and payload.metadata.business_code == "0":
        finalize_task_completed(db, task, payload.data or {})
    elif status in ("FAILED", "TIMEOUT"):
        finalize_task_failed(
            db,
            task,
            status,
            payload.metadata.business_code,
            payload.metadata.error_msg,
        )
    elif status == "RUNNING":
        task.status = "RUNNING"
        task.progress = max(task.progress, 20)

    batch = db.query(BatchJob).filter(BatchJob.id == task.batch_id).first()
    if batch:
        recompute_batch_summary(db, batch)
    db.commit()
    return {"received": True, "matched": True, "status": task.status}
