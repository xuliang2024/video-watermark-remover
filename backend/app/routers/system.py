"""System status, Volcengine LAS/TOS environment settings, onboarding and LAS callback webhook."""

from __future__ import annotations

import json

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..config import (
    get_runtime_config,
    persist_runtime_settings,
    render_env_file_content,
    reset_persisted_settings,
    update_runtime_config,
)
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
from ..schemas import LasCallbackPayload, SystemConfigUpdate, SystemOnboardingDismiss
from ..services.scheduler import (
    finalize_task_completed,
    finalize_task_failed,
    recompute_batch_summary,
    scheduler,
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


def _serialize_system_config() -> dict:
    cfg = get_runtime_config()
    return {
        "execution_mode": cfg["execution_mode"],
        "effective_mode": cfg["effective_mode"],
        "public_base_url": cfg["public_base_url"],
        "monthly_quota_minutes": cfg["monthly_quota_minutes"],
        "has_las_api_key": cfg["has_las_api_key"],
        "las_api_key_masked": _mask_key(cfg["las_api_key"]),
        "las_region": cfg["las_region"],
        "las_base_url": cfg["las_base_url"],
        "las_base_url_raw": cfg["las_base_url_raw"],
        "las_callback_url": cfg["las_callback_url"],
        "callback_url": cfg["las_callback_url"],
        "tos_bucket": cfg["tos_bucket"],
        "tos_region": cfg["tos_region"],
        "tos_endpoint": cfg["tos_endpoint"],
        "tos_input_prefix": cfg["tos_input_prefix"],
        "tos_output_prefix": cfg["tos_output_prefix"],
        "has_volc_ak": cfg["has_volc_ak"],
        "volc_access_key_id_masked": _mask_key(cfg["volc_access_key_id"]),
        "has_volc_sk": cfg["has_volc_sk"],
        "volc_access_key_secret_masked": _mask_key(cfg["volc_access_key_secret"]),
        "has_tos_credentials": cfg["has_tos_credentials"],
        "scheduler_enabled": cfg["scheduler_enabled"],
        "max_concurrency": cfg["max_concurrency"],
        "poll_interval_seconds": cfg["poll_interval_seconds"],
        "database_url": cfg["database_url"],
        "storage_dir": cfg["storage_dir"],
        "active_database_url": cfg["active_database_url"],
        "active_storage_dir": cfg["active_storage_dir"],
        "restart_required": cfg["restart_required"],
        "setup_completed": cfg["setup_completed"],
        "is_first_run": cfg["is_first_run"],
        "env_file_path": cfg["env_file_path"],
        "env_preview": render_env_file_content(cfg, mask_secrets=True),
        "supported_regions": SUPPORTED_REGIONS,
    }


@router.get("/api/health")
def health():
    cfg = get_runtime_config()
    return {
        "status": "ok",
        "service": "cleanframe-api",
        "effective_mode": cfg["effective_mode"],
        "las_region": cfg["las_region"],
        "is_first_run": cfg["is_first_run"],
    }


@router.get("/api/system/config")
def get_system_config():
    return _serialize_system_config()


@router.put("/api/system/config")
async def put_system_config(body: SystemConfigUpdate, db: Session = Depends(get_db)):
    dump = body.model_dump(exclude_unset=True)
    clear_keys = dump.pop("clear_keys", [])
    scheduler_changed = "scheduler_enabled" in dump and dump["scheduler_enabled"] is not None

    update_runtime_config(dump, clear_keys=clear_keys)
    cfg = persist_runtime_settings(db, mark_setup_completed=True, sync_env_file=True)

    if scheduler_changed:
        if cfg["scheduler_enabled"]:
            await scheduler.start(force=True)
        else:
            await scheduler.stop()

    return _serialize_system_config()


@router.post("/api/system/onboarding/dismiss")
def dismiss_first_run_onboarding(
    body: SystemOnboardingDismiss | None = Body(default=None),
    db: Session = Depends(get_db),
):
    if body and body.execution_mode:
        update_runtime_config({"execution_mode": body.execution_mode})
    persist_runtime_settings(db, mark_setup_completed=True, sync_env_file=True)
    return _serialize_system_config()


@router.post("/api/system/config/reset")
def reset_system_config(
    reopen_onboarding: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    reset_persisted_settings(db, reopen_onboarding=reopen_onboarding)
    return _serialize_system_config()


@router.post("/api/system/test-connection")
async def test_volcengine_connection(body: SystemConfigUpdate | None = Body(default=None)):
    draft = body.model_dump(exclude_unset=True) if body else None
    if draft:
        draft.pop("clear_keys", None)
    las_res = await las_client.test_connection(draft)
    tos_res = tos_service.test_bucket_access(draft)
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
    sys_cfg = _serialize_system_config()
    return {
        "system": sys_cfg,
        "source_languages": SOURCE_LANGUAGES,
        "output_languages": OUTPUT_LANGUAGES,
        "inpaint_presets": list(INPAINT_PRESETS.values()),
        "subtitle_style": subtitle_style,
        "region_templates": tpl_list,
        "default_regions": tpl_list[0]["regions"] if tpl_list else DEFAULT_REGIONS,
        "monthly_quota_minutes": sys_cfg["monthly_quota_minutes"],
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
