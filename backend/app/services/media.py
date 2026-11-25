"""Local media file storage, ffprobe metadata extraction and thumbnail generation."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from ..config import get_settings


ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".flv", ".webm"}


def sanitize_filename(name: str) -> str:
    base = Path(name).name
    cleaned = re.sub(r"[^\w\u4e00-\u9fff.\-\s()]+", "_", base).strip()
    return cleaned or "video.mp4"


def _parse_fps(rate_str: str | None) -> float:
    if not rate_str:
        return 30.0
    try:
        if "/" in rate_str:
            num, den = rate_str.split("/", 1)
            den_f = float(den)
            if den_f == 0:
                return 30.0
            val = float(num) / den_f
            return round(val, 2) if val > 0 else 30.0
        val = float(rate_str)
        return round(val, 2) if val > 0 else 30.0
    except Exception:
        return 30.0


def _is_remote_url(source: Path | str) -> bool:
    return isinstance(source, str) and source.startswith(("http://", "https://"))


def probe_video_metadata(
    source: Path | str,
    size_bytes: int,
    client_hint: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run ffprobe to extract real resolution, fps, duration and frame count.
    Supports both local file paths and remote HTTP/HTTPS presigned URLs (HTTP Range seek, zero full download).
    """
    ffprobe = shutil.which("ffprobe")
    is_remote = _is_remote_url(source)
    can_probe = bool(ffprobe and (is_remote or Path(source).exists()))
    if can_probe and ffprobe:
        cmd = [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames",
            "-of",
            "json",
            str(source),
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30 if is_remote else 15)
            if res.returncode == 0 and res.stdout.strip():
                payload = json.loads(res.stdout)
                streams = payload.get("streams", [])
                vstream = next((s for s in streams if s.get("codec_type") == "video"), None)
                fmt = payload.get("format", {})
                if vstream:
                    width = int(vstream.get("width") or (client_hint or {}).get("width") or 1920)
                    height = int(vstream.get("height") or (client_hint or {}).get("height") or 1080)
                    fps = _parse_fps(vstream.get("avg_frame_rate") or vstream.get("r_frame_rate"))
                    duration = float(fmt.get("duration") or (client_hint or {}).get("duration_sec") or 0.0)
                    if duration <= 0:
                        duration = 30.0
                    nb_frames = vstream.get("nb_frames")
                    frames = int(nb_frames) if (nb_frames and str(nb_frames).isdigit()) else max(1, int(round(duration * fps)))
                    return {
                        "width": width,
                        "height": height,
                        "fps": fps,
                        "duration_sec": round(duration, 2),
                        "frames": frames,
                        "probed": True,
                    }
        except Exception:
            pass

    # Fallback: prefer browser-probed metadata hint if provided, else heuristic estimate
    hint = client_hint or {}
    hint_w = int(hint.get("width") or 0)
    hint_h = int(hint.get("height") or 0)
    hint_dur = float(hint.get("duration_sec") or 0.0)
    est_gb = max(0.01, size_bytes / (1024**3))
    est_sec = round(hint_dur, 2) if hint_dur > 0 else max(15.0, min(3600.0, round(est_gb * 380.0, 2)))
    width = hint_w if 16 <= hint_w <= 7680 else 1920
    height = hint_h if 16 <= hint_h <= 4320 else 1080
    return {
        "width": width,
        "height": height,
        "fps": 30.0,
        "duration_sec": est_sec,
        "frames": max(1, int(round(est_sec * 30.0))),
        "probed": bool(hint_w and hint_h and hint_dur > 0),
    }


def extract_thumbnail(source: Path | str, asset_id: str) -> str:
    """Use ffmpeg to capture a 16:9 poster frame from local file or remote presigned URL; falls back to sample frame."""
    settings = get_settings()
    ffmpeg = shutil.which("ffmpeg")
    out_path = settings.thumbnails_path / f"{asset_id}.jpg"
    is_remote = _is_remote_url(source)
    can_extract = bool(ffmpeg and (is_remote or Path(source).exists()))
    if can_extract and ffmpeg:
        cmd = [
            ffmpeg,
            "-y",
            "-ss",
            "00:00:00.5",
            "-i",
            str(source),
            "-vframes",
            "1",
            "-vf",
            "scale=640:-2",
            "-q:v",
            "3",
            str(out_path),
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30 if is_remote else 15)
            if res.returncode == 0 and out_path.exists() and out_path.stat().st_size > 0:
                return f"/media/thumbnails/{asset_id}.jpg"
        except Exception:
            pass
    return "/media/sample/frame_16x9.png"
