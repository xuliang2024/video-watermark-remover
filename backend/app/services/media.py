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


def probe_video_metadata(file_path: Path, size_bytes: int) -> dict[str, Any]:
    """Run ffprobe to extract real resolution, fps, duration and frame count."""
    ffprobe = shutil.which("ffprobe")
    if ffprobe and file_path.exists():
        cmd = [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames",
            "-of",
            "json",
            str(file_path),
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if res.returncode == 0 and res.stdout.strip():
                payload = json.loads(res.stdout)
                streams = payload.get("streams", [])
                vstream = next((s for s in streams if s.get("codec_type") == "video"), None)
                fmt = payload.get("format", {})
                if vstream:
                    width = int(vstream.get("width") or 1920)
                    height = int(vstream.get("height") or 1080)
                    fps = _parse_fps(vstream.get("avg_frame_rate") or vstream.get("r_frame_rate"))
                    duration = float(fmt.get("duration") or 0.0)
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

    # Fallback heuristic for lightweight test uploads without real media streams
    est_gb = max(0.01, size_bytes / (1024**3))
    est_sec = max(15.0, min(3600.0, round(est_gb * 380.0, 2)))
    return {
        "width": 1920,
        "height": 1080,
        "fps": 30.0,
        "duration_sec": est_sec,
        "frames": int(round(est_sec * 30.0)),
        "probed": False,
    }


def extract_thumbnail(file_path: Path, asset_id: str) -> str:
    """Use ffmpeg to capture a 16:9 poster frame; falls back to default sample frame."""
    settings = get_settings()
    ffmpeg = shutil.which("ffmpeg")
    out_path = settings.thumbnails_path / f"{asset_id}.jpg"
    if ffmpeg and file_path.exists():
        cmd = [
            ffmpeg,
            "-y",
            "-ss",
            "00:00:00.5",
            "-i",
            str(file_path),
            "-vframes",
            "1",
            "-vf",
            "scale=640:-2",
            "-q:v",
            "3",
            str(out_path),
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if res.returncode == 0 and out_path.exists() and out_path.stat().st_size > 0:
                return f"/media/thumbnails/{asset_id}.jpg"
        except Exception:
            pass
    return "/media/sample/frame_16x9.png"
