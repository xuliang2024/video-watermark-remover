"""Volcengine LAS (Lake AI Service) asynchronous operator client + realistic mock simulator."""

from __future__ import annotations

import logging
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
    TRANSLATE_OPERATOR_ID,
    TRANSLATE_OPERATOR_VERSION,
)

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
        cb = callback_url or cfg.get("callback_url") or ""
        if _is_valid_callback_url(cb):
            body["callback"] = {"url": cb}

        url = f"{cfg['las_base_url']}/submit"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, headers=self._headers(api_key), json=body)

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
            raise LasApiError(f"{bcode}: {hint or emsg}", bcode, resp.status_code)

        payload = resp.json()
        meta = payload.get("metadata") or {}
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

    async def test_connection(self) -> dict[str, Any]:
        """Verify LAS API Key & endpoint reachability via a lightweight Poll probe."""
        cfg = get_runtime_config()
        if not cfg["has_las_api_key"]:
            return {
                "configured": False,
                "ok": False,
                "mode": cfg["effective_mode"],
                "endpoint": cfg["las_base_url"],
                "message": "尚未配置 LAS_API_KEY，当前运行在本地仿真演示模式 (mock)",
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


las_client = VolcengineLasClient()
