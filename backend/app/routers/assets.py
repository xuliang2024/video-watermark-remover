"""Media asset upload, ffprobe inspection, listing and deletion."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import MediaAsset, new_id
from ..seed import SAMPLE_THUMB
from ..services.media import (
    ALLOWED_EXTENSIONS,
    extract_thumbnail,
    probe_video_metadata,
    sanitize_filename,
)
from ..services.tos_client import tos_service

router = APIRouter(prefix="/api/assets", tags=["assets"])


def serialize_asset(a: MediaAsset) -> dict:
    return {
        "id": a.id,
        "name": a.filename,
        "purpose": a.purpose,
        "thumbnail_url": a.thumbnail_url,
        "video_url": a.video_url,
        "tos_uri": a.tos_uri,
        "width": a.width,
        "height": a.height,
        "resolution": f"{a.width}×{a.height}",
        "fps": round(float(a.fps), 2),
        "duration_sec": round(float(a.duration_sec), 2),
        "frames": a.frames,
        "size_bytes": a.size_bytes,
        "size_gb": round(a.size_bytes / (1024**3), 2) if a.size_bytes else 0.01,
        "detected_lang": a.detected_lang,
        "detected_lang_code": a.detected_lang_code,
        "is_sample": a.is_sample,
    }


@router.get("")
def list_assets(
    purpose: Literal["inpaint", "translate", "all"] = Query(default="all"),
    db: Session = Depends(get_db),
):
    q = db.query(MediaAsset)
    if purpose != "all":
        q = q.filter(MediaAsset.purpose == purpose)
    rows = q.order_by(MediaAsset.created_at.asc()).all()
    return {"items": [serialize_asset(a) for a in rows]}


@router.post("/upload")
async def upload_assets(
    files: list[UploadFile] = File(...),
    purpose: Literal["inpaint", "translate"] = Query(default="inpaint"),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="请至少选择一个视频文件")
    if len(files) > 200:
        raise HTTPException(status_code=400, detail="单次最多上传 200 个文件")

    settings = get_settings()
    created: list[MediaAsset] = []

    for upload in files:
        orig_name = sanitize_filename(upload.filename or "video.mp4")
        ext = Path(orig_name).suffix.lower() or ".mp4"
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"文件 {orig_name} 格式不支持，仅支持 {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        asset_id = new_id("inf" if purpose == "inpaint" else "trf")
        disk_name = f"{asset_id}_{orig_name}"
        disk_path = settings.uploads_path / disk_name

        content = await upload.read()
        size_bytes = len(content)
        if size_bytes == 0:
            raise HTTPException(status_code=400, detail=f"文件 {orig_name} 为空文件")
        if size_bytes > 10 * 1024**3:
            raise HTTPException(status_code=400, detail=f"文件 {orig_name} 超过 10 GB 上限")

        disk_path.write_bytes(content)
        meta = probe_video_metadata(disk_path, size_bytes)
        thumb_url = extract_thumbnail(disk_path, asset_id)
        tos_uri, video_url = tos_service.upload_input_video(disk_path, asset_id, orig_name)

        asset = MediaAsset(
            id=asset_id,
            filename=orig_name,
            purpose=purpose,
            local_path=str(disk_path),
            tos_uri=tos_uri,
            video_url=video_url,
            thumbnail_url=thumb_url,
            width=meta["width"],
            height=meta["height"],
            fps=meta["fps"],
            duration_sec=meta["duration_sec"],
            frames=meta["frames"],
            size_bytes=size_bytes,
            detected_lang="中文（简体）",
            detected_lang_code="zh-CN",
            is_sample=False,
        )
        db.add(asset)
        created.append(asset)

    db.commit()
    return {"items": [serialize_asset(a) for a in created]}


@router.delete("/{asset_id}")
def delete_asset(asset_id: str, db: Session = Depends(get_db)):
    asset = db.query(MediaAsset).filter(MediaAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="素材不存在")
    db.delete(asset)
    db.commit()
    return {"deleted": True, "id": asset_id}


@router.post("/clear")
def clear_assets(
    purpose: Literal["inpaint", "translate"] = Query(...),
    db: Session = Depends(get_db),
):
    db.query(MediaAsset).filter(MediaAsset.purpose == purpose).delete()
    db.commit()
    return {"cleared": True, "purpose": purpose}


@router.post("/restore-samples")
def restore_sample_assets(
    purpose: Literal["inpaint", "translate"] = Query(...),
    db: Session = Depends(get_db),
):
    db.query(MediaAsset).filter(MediaAsset.purpose == purpose, MediaAsset.is_sample.is_(True)).delete()
    if purpose == "inpaint":
        samples = [
            MediaAsset(id="inf-1", filename="S01E01_雨夜来客.mp4", purpose="inpaint", thumbnail_url=SAMPLE_THUMB, width=1920, height=1080, fps=29.97, duration_sec=504, frames=15105, size_bytes=int(1.24 * 1024**3), is_sample=True),
            MediaAsset(id="inf-2", filename="S01E02_灯下无声.mp4", purpose="inpaint", thumbnail_url=SAMPLE_THUMB, width=1920, height=1080, fps=29.97, duration_sec=492, frames=14745, size_bytes=int(1.18 * 1024**3), is_sample=True),
            MediaAsset(id="inf-3", filename="EP03_旧信.mp4", purpose="inpaint", thumbnail_url=SAMPLE_THUMB, width=3840, height=2160, fps=25.00, duration_sec=546, frames=13650, size_bytes=int(3.86 * 1024**3), is_sample=True),
            MediaAsset(id="inf-4", filename="BTS_花絮_0412.mp4", purpose="inpaint", thumbnail_url=SAMPLE_THUMB, width=2560, height=1440, fps=59.94, duration_sec=182, frames=10909, size_bytes=int(0.94 * 1024**3), is_sample=True),
        ]
    else:
        samples = [
            MediaAsset(id="trf-1", filename="S01E01_雨夜来客.mp4", purpose="translate", thumbnail_url=SAMPLE_THUMB, width=1920, height=1080, fps=29.97, duration_sec=504, frames=15105, size_bytes=int(1.24 * 1024**3), is_sample=True),
            MediaAsset(id="trf-2", filename="预告_30s_竖版.mp4", purpose="translate", thumbnail_url=SAMPLE_THUMB, width=1080, height=1920, fps=30.00, duration_sec=42, frames=1260, size_bytes=int(0.29 * 1024**3), is_sample=True),
        ]
    db.add_all(samples)
    db.commit()
    rows = db.query(MediaAsset).filter(MediaAsset.purpose == purpose).order_by(MediaAsset.created_at.asc()).all()
    return {"items": [serialize_asset(a) for a in rows]}
