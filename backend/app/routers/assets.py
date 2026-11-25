"""Media asset upload, ffprobe inspection, listing and deletion."""

from __future__ import annotations

import asyncio
import math
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
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
    save_thumbnail_data_url,
)
from ..services.tos_client import tos_service
from ..services.upload_progress import direct_upload_sessions, upload_progress_tracker

router = APIRouter(prefix="/api/assets", tags=["assets"])

MAX_UPLOAD_BYTES = 10 * 1024**3
MULTIPART_THRESHOLD_BYTES = 16 * 1024 * 1024  # <= 16 MiB single presigned PUT; > 16 MiB multipart
DEFAULT_PART_SIZE_BYTES = 16 * 1024 * 1024
MAX_TOS_PARTS = 9000


class DirectUploadInitRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    size_bytes: int = Field(..., ge=1, le=MAX_UPLOAD_BYTES)
    content_type: str = Field(default="video/mp4", max_length=128)
    purpose: Literal["inpaint", "translate"] = "inpaint"


class DirectUploadSignPartsRequest(BaseModel):
    session_id: str = Field(..., min_length=4, max_length=80)
    part_numbers: list[int] = Field(..., min_length=1, max_length=200)


class DirectUploadPartItem(BaseModel):
    part_number: int = Field(..., ge=1, le=10000)
    etag: str = Field(..., min_length=1, max_length=256)


class ClientVideoMetaHint(BaseModel):
    width: int | None = None
    height: int | None = None
    duration_sec: float | None = None
    thumbnail_data_url: str | None = None


class DirectUploadCompleteRequest(BaseModel):
    session_id: str = Field(..., min_length=4, max_length=80)
    parts: list[DirectUploadPartItem] = Field(default_factory=list)
    client_meta: ClientVideoMetaHint | None = None


class DirectUploadAbortRequest(BaseModel):
    session_id: str = Field(..., min_length=4, max_length=80)


def _compute_part_plan(size_bytes: int) -> tuple[int, int]:
    part_size = DEFAULT_PART_SIZE_BYTES
    part_count = max(1, math.ceil(size_bytes / part_size))
    if part_count > MAX_TOS_PARTS:
        raw_part = math.ceil(size_bytes / MAX_TOS_PARTS)
        step = 4 * 1024 * 1024
        part_size = math.ceil(raw_part / step) * step
        part_count = math.ceil(size_bytes / part_size)
    return part_size, part_count


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


@router.get("/upload-progress/{upload_id}")
def get_upload_progress(upload_id: str):
    return upload_progress_tracker.get(upload_id)


@router.post("/direct-upload/init")
async def init_direct_upload(body: DirectUploadInitRequest):
    orig_name = sanitize_filename(body.filename)
    ext = Path(orig_name).suffix.lower() or ".mp4"
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"文件 {orig_name} 格式不支持，仅支持 {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    if not tos_service.is_configured():
        return {"mode": "proxy"}

    asset_id = new_id("inf" if body.purpose == "inpaint" else "trf")
    object_key = tos_service.build_input_object_key(asset_id, orig_name)
    tos_uri = tos_service.build_tos_uri(object_key)
    if not tos_uri:
        return {"mode": "proxy"}

    session_id = new_id("dus")

    if body.size_bytes <= MULTIPART_THRESHOLD_BYTES:
        upload_url = await asyncio.to_thread(tos_service.presign_put_object, object_key, expires=7200)
        if not upload_url:
            raise HTTPException(status_code=502, detail="云端对象存储签名失败，请稍后重试")
        direct_upload_sessions.create(
            session_id,
            {
                "asset_id": asset_id,
                "filename": orig_name,
                "purpose": body.purpose,
                "object_key": object_key,
                "tos_uri": tos_uri,
                "size_bytes": body.size_bytes,
                "mode": "single_put",
                "tos_upload_id": None,
                "part_size": body.size_bytes,
                "part_count": 1,
            },
        )
        return {
            "mode": "single_put",
            "session_id": session_id,
            "asset_id": asset_id,
            "part_size": body.size_bytes,
            "part_count": 1,
            "upload_url": upload_url,
            "parts": [],
        }

    part_size, part_count = _compute_part_plan(body.size_bytes)
    tos_upload_id = await asyncio.to_thread(
        tos_service.create_multipart_upload,
        object_key,
        content_type=body.content_type or "video/mp4",
    )
    if not tos_upload_id:
        raise HTTPException(status_code=502, detail="初始化云端分片上传失败，请稍后重试")

    def _sign_all_parts() -> list[dict]:
        signed: list[dict] = []
        for pnum in range(1, part_count + 1):
            u = tos_service.presign_upload_part(object_key, tos_upload_id, pnum, expires=7200)
            if not u:
                raise RuntimeError(f"failed to presign part {pnum}")
            signed.append({"part_number": pnum, "url": u})
        return signed

    try:
        parts = await asyncio.to_thread(_sign_all_parts)
    except Exception:
        await asyncio.to_thread(tos_service.abort_multipart_upload, object_key, tos_upload_id)
        raise HTTPException(status_code=502, detail="生成云端分片签名失败，请稍后重试")

    direct_upload_sessions.create(
        session_id,
        {
            "asset_id": asset_id,
            "filename": orig_name,
            "purpose": body.purpose,
            "object_key": object_key,
            "tos_uri": tos_uri,
            "size_bytes": body.size_bytes,
            "mode": "multipart",
            "tos_upload_id": tos_upload_id,
            "part_size": part_size,
            "part_count": part_count,
        },
    )
    return {
        "mode": "multipart",
        "session_id": session_id,
        "asset_id": asset_id,
        "part_size": part_size,
        "part_count": part_count,
        "upload_url": None,
        "parts": parts,
    }


@router.post("/direct-upload/sign-parts")
async def sign_direct_upload_parts(body: DirectUploadSignPartsRequest):
    sess = direct_upload_sessions.get(body.session_id)
    if not sess or sess.get("mode") != "multipart" or not sess.get("tos_upload_id"):
        raise HTTPException(status_code=404, detail="上传会话不存在或已过期，请重新上传")

    max_part = int(sess["part_count"])
    valid_nums = sorted({int(n) for n in body.part_numbers if 1 <= int(n) <= max_part})
    if not valid_nums:
        raise HTTPException(status_code=400, detail="无效的分片编号")

    def _sign_requested() -> list[dict]:
        signed: list[dict] = []
        for pnum in valid_nums:
            u = tos_service.presign_upload_part(sess["object_key"], sess["tos_upload_id"], pnum, expires=7200)
            if not u:
                raise RuntimeError(f"failed to presign part {pnum}")
            signed.append({"part_number": pnum, "url": u})
        return signed

    try:
        parts = await asyncio.to_thread(_sign_requested)
    except Exception:
        raise HTTPException(status_code=502, detail="刷新分片签名失败，请稍后重试")
    return {"session_id": body.session_id, "parts": parts}


@router.post("/direct-upload/complete")
async def complete_direct_upload(
    body: DirectUploadCompleteRequest,
    db: Session = Depends(get_db),
):
    sess = direct_upload_sessions.get(body.session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="上传会话不存在或已完成")

    object_key = sess["object_key"]
    tos_uri = sess["tos_uri"]

    if sess["mode"] == "multipart":
        expected_parts = int(sess["part_count"])
        if len(body.parts) != expected_parts:
            raise HTTPException(
                status_code=400,
                detail=f"分片数量不完整（收到 {len(body.parts)}/{expected_parts} 片）",
            )
        part_payload = [{"part_number": p.part_number, "etag": p.etag} for p in body.parts]
        ok = await asyncio.to_thread(
            tos_service.complete_multipart_upload,
            object_key,
            sess["tos_upload_id"],
            part_payload,
        )
        if not ok:
            raise HTTPException(status_code=502, detail="云端分片合并失败，请重试")

    actual_size = await asyncio.to_thread(tos_service.head_tos_uri, tos_uri)
    if actual_size is None or actual_size <= 0:
        raise HTTPException(status_code=400, detail="云端未检测到已上传的视频文件，请重新上传")

    signed_get_url = await asyncio.to_thread(tos_service.presign_tos_uri, tos_uri, expires=600)
    client_hint = body.client_meta.model_dump(exclude_none=True) if body.client_meta else None
    saved_client_thumb = save_thumbnail_data_url(
        body.client_meta.thumbnail_data_url if body.client_meta else None,
        sess["asset_id"],
    )

    if signed_get_url:
        if saved_client_thumb:
            meta = await asyncio.to_thread(probe_video_metadata, signed_get_url, actual_size, client_hint)
            thumb_url = saved_client_thumb
        else:
            meta, thumb_url = await asyncio.gather(
                asyncio.to_thread(probe_video_metadata, signed_get_url, actual_size, client_hint),
                asyncio.to_thread(extract_thumbnail, signed_get_url, sess["asset_id"]),
            )
    else:
        meta = probe_video_metadata("", actual_size, client_hint)
        thumb_url = saved_client_thumb or "/media/sample/frame_16x9.png"

    direct_upload_sessions.pop(body.session_id)

    asset = MediaAsset(
        id=sess["asset_id"],
        filename=sess["filename"],
        purpose=sess["purpose"],
        local_path=None,
        tos_uri=tos_uri,
        video_url=tos_uri,
        thumbnail_url=thumb_url,
        width=meta["width"],
        height=meta["height"],
        fps=meta["fps"],
        duration_sec=meta["duration_sec"],
        frames=meta["frames"],
        size_bytes=actual_size,
        detected_lang="中文（简体）",
        detected_lang_code="zh-CN",
        is_sample=False,
    )
    db.add(asset)
    db.commit()
    return {"items": [serialize_asset(asset)]}


@router.post("/direct-upload/abort")
async def abort_direct_upload(body: DirectUploadAbortRequest):
    sess = direct_upload_sessions.pop(body.session_id)
    if not sess:
        return {"aborted": False}
    if sess.get("mode") == "multipart" and sess.get("tos_upload_id"):
        await asyncio.to_thread(tos_service.abort_multipart_upload, sess["object_key"], sess["tos_upload_id"])
    return {"aborted": True}


@router.post("/upload")
async def upload_assets(
    files: list[UploadFile] = File(...),
    purpose: Literal["inpaint", "translate"] = Query(default="inpaint"),
    upload_id: str | None = Query(default=None, max_length=80),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(status_code=400, detail="请至少选择一个视频文件")
    if len(files) > 200:
        raise HTTPException(status_code=400, detail="单次最多上传 200 个文件")

    settings = get_settings()
    created: list[MediaAsset] = []
    if upload_id:
        first_name = sanitize_filename(files[0].filename or "video.mp4")
        upload_progress_tracker.init(upload_id, filename=first_name)

    try:
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

            max_bytes = 10 * 1024**3
            chunk_size = 1024 * 1024  # 1 MiB streaming chunks to avoid loading large videos into RAM
            size_bytes = 0
            if upload_id:
                upload_progress_tracker.update(upload_id, filename=orig_name, stage="receiving", received_bytes=0)

            try:
                with disk_path.open("wb") as out_f:
                    while True:
                        chunk = await upload.read(chunk_size)
                        if not chunk:
                            break
                        size_bytes += len(chunk)
                        if size_bytes > max_bytes:
                            raise HTTPException(status_code=400, detail=f"文件 {orig_name} 超过 10 GB 上限")
                        out_f.write(chunk)
                        if upload_id:
                            upload_progress_tracker.update(upload_id, received_bytes=size_bytes)
                if size_bytes == 0:
                    raise HTTPException(status_code=400, detail=f"文件 {orig_name} 为空文件")
            except Exception:
                if disk_path.exists():
                    disk_path.unlink(missing_ok=True)
                raise
            finally:
                await upload.close()

            if upload_id:
                upload_progress_tracker.update(
                    upload_id,
                    stage="probing",
                    received_bytes=size_bytes,
                    total_bytes=size_bytes,
                )

            meta = await asyncio.to_thread(probe_video_metadata, disk_path, size_bytes)
            thumb_url = await asyncio.to_thread(extract_thumbnail, disk_path, asset_id)

            def _on_tos_progress(consumed: int, total: int) -> None:
                if upload_id:
                    upload_progress_tracker.update(
                        upload_id,
                        stage="cloud_sync",
                        tos_consumed_bytes=consumed,
                        tos_total_bytes=total or size_bytes,
                    )

            if upload_id and tos_service.is_configured():
                upload_progress_tracker.update(
                    upload_id,
                    stage="cloud_sync",
                    tos_consumed_bytes=0,
                    tos_total_bytes=size_bytes,
                )

            tos_uri, video_url = await asyncio.to_thread(
                tos_service.upload_input_video,
                disk_path,
                asset_id,
                orig_name,
                _on_tos_progress if upload_id else None,
            )

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
        if upload_id:
            upload_progress_tracker.update(upload_id, stage="done")
        return {"items": [serialize_asset(a) for a in created]}
    except HTTPException as exc:
        if upload_id:
            upload_progress_tracker.update(upload_id, stage="error", error=str(exc.detail))
        raise
    except Exception as exc:
        if upload_id:
            upload_progress_tracker.update(upload_id, stage="error", error=str(exc))
        raise


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
