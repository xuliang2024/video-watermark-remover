"""Authoritative billing formulas, parameter validation and Volcengine LAS payload builders."""

from __future__ import annotations

import math
from typing import Any

from ..constants import OUTPUT_LANG_MAP
from ..schemas import (
    FileEstimateInput,
    InpaintConfig,
    SubtitleStyleConfig,
    TranslateConfig,
)


RESOLUTION_PIXELS = {
    "720p": 1280 * 720,
    "1080p": 1920 * 1080,
    "4k": 3840 * 2160,
}

TARGET_LABELS = {
    "watermark": "水印 · 角标 · Logo",
    "subtitle": "普通字幕",
    "scrolling_subtitle": "滚动字幕",
    "drama_info": "剧集信息",
}


class ParameterValidationError(ValueError):
    """Raised when operator parameters violate Volcengine LAS rules."""


def resolve_inpaint_detection_mode(cfg: InpaintConfig) -> str:
    """Map orthogonal UI controls (targets + locate_mode) to Volcengine LAS detection_mode."""
    if cfg.locate_mode == "precise":
        return "precise"
    if cfg.locate_mode == "fixed":
        return "standard_subtitle"

    tset = set(cfg.targets)
    if len(tset) >= 4 or "drama_info" in tset:
        return "standard_all"
    has_sub = "subtitle" in tset or "scrolling_subtitle" in tset
    has_wm = "watermark" in tset
    if has_sub and has_wm:
        return "standard_subtitle_watermark"
    if has_wm:
        return "standard_watermark"
    return "standard_subtitle"


def validate_inpaint_config(cfg: InpaintConfig) -> InpaintConfig:
    """Validate las_video_inpaint_pro parameter combinations per Volcengine docs."""
    if cfg.model_level == "lite" and cfg.locate_mode == "precise":
        raise ParameterValidationError("极速版 (lite) 不支持精准识别 (precise) 模式，请切换为专业版或标准检测")

    if cfg.locate_mode == "fixed":
        if not cfg.regions:
            raise ParameterValidationError("手动框选模式下至少需要配置 1 个固定修复区域 (fixed_bboxes)")
        for reg in cfg.regions:
            x1, y1, x2, y2 = reg.bbox
            if not all(isinstance(v, int) and 0 <= v <= 1000 for v in (x1, y1, x2, y2)):
                raise ParameterValidationError(f"区域 {reg.name} 坐标必须是 0~1000 的整数")
            if not (x1 < x2 and y1 < y2):
                raise ParameterValidationError(f"区域 {reg.name} 需满足 top_left_x < bottom_right_x 且 top_left_y < bottom_right_y")
            if not reg.until_end and reg.end_sec <= reg.start_sec:
                raise ParameterValidationError(f"区域 {reg.name} 结束时间必须大于起始时间")
    else:
        if not cfg.targets:
            raise ParameterValidationError("至少需要选择 1 个擦除目标")

    return cfg


def validate_translate_config(cfg: TranslateConfig) -> TranslateConfig:
    """Validate las_video_translate parameter combinations per Volcengine docs."""
    if not cfg.target_langs:
        raise ParameterValidationError("至少需要选择 1 个目标输出语种")
    if cfg.source_lang in cfg.target_langs:
        raise ParameterValidationError(f"目标输出语种不能包含源语言 ({cfg.source_lang})")
    unknown = [c for c in cfg.target_langs if c not in OUTPUT_LANG_MAP]
    if unknown:
        raise ParameterValidationError(f"不支持的目标语种代码: {', '.join(unknown)}")
    if cfg.fast_mode and cfg.dubbing_mode != "high_quality":
        raise ParameterValidationError("快速模式 (enable_fast_mode) 仅在高质量配音 (high_quality) 下可用")
    if not cfg.caption_formats:
        raise ParameterValidationError("至少需要选择 1 种字幕输出格式")
    return cfg


def calc_inpaint_file(file: FileEstimateInput, cfg: InpaintConfig) -> dict[str, Any]:
    """
    Exact Volcengine las_video_inpaint_pro billing formula:
    total_cost = unit_price * (duration_min * fps_coeff * res_coeff)
    """
    duration_min = file.duration_sec / 60.0
    out_fps = min(float(file.fps), float(cfg.max_fps or 30))

    if out_fps <= 24.0:
        fps_coeff = 0.8
    elif out_fps <= 30.0:
        fps_coeff = 1.0
    else:
        fps_coeff = float(math.ceil(out_fps / 30.0))

    max_pixels = RESOLUTION_PIXELS.get(cfg.max_resolution, RESOLUTION_PIXELS["1080p"])
    eff_pixels = min(file.width * file.height, max_pixels)

    if cfg.model_level == "lite":
        res_coeff = 1.0 if eff_pixels <= RESOLUTION_PIXELS["1080p"] else 2.0
    else:
        if eff_pixels <= RESOLUTION_PIXELS["720p"]:
            res_coeff = 0.6
        elif eff_pixels <= RESOLUTION_PIXELS["1080p"]:
            res_coeff = 1.0
        else:
            res_coeff = 2.0

    if cfg.model_level == "lite":
        unit_price = 0.5
    else:
        unit_price = 3.0 if cfg.locate_mode == "precise" else 1.5

    bill_min = duration_min * fps_coeff * res_coeff
    cost = bill_min * unit_price

    return {
        "file_id": file.id,
        "name": file.name,
        "duration_sec": file.duration_sec,
        "out_fps": round(out_fps, 2),
        "fps_coeff": fps_coeff,
        "res_coeff": res_coeff,
        "unit_price": unit_price,
        "bill_min": round(bill_min, 4),
        "cost": round(cost, 2),
        "high_fps_capped": file.fps > float(cfg.max_fps),
    }


def calc_inpaint_batch(files: list[FileEstimateInput], cfg: InpaintConfig) -> dict[str, Any]:
    items = [calc_inpaint_file(f, cfg) for f in files]
    total_sec = sum(f.duration_sec for f in files)
    total_bytes = sum(f.size_bytes for f in files)
    total_bill_min = sum(i["bill_min"] for i in items)
    total_cost = sum(i["bill_min"] * i["unit_price"] for i in items)
    high_fps_files = [
        {"name": f.name, "fps": f.fps, "capped_fps": cfg.max_fps}
        for f in files
        if f.fps > float(cfg.max_fps)
    ]

    return {
        "file_count": len(files),
        "total_duration_sec": round(total_sec, 2),
        "total_size_gb": round(total_bytes / (1024**3), 2),
        "total_bill_min": round(total_bill_min, 2),
        "total_cost": round(total_cost, 2),
        "unit_price": items[0]["unit_price"] if items else (0.5 if cfg.model_level == "lite" else (3.0 if cfg.locate_mode == "precise" else 1.5)),
        "detection_mode": resolve_inpaint_detection_mode(cfg),
        "high_fps_warnings": high_fps_files,
        "items": items,
    }


def calc_translate_batch(files: list[FileEstimateInput], cfg: TranslateConfig) -> dict[str, Any]:
    """
    Exact Volcengine las_video_translate billing formula:
    total_cost = unit_price * input_duration_min * target_lang_count
    """
    total_sec = sum(f.duration_sec for f in files)
    total_min = total_sec / 60.0
    total_bytes = sum(f.size_bytes for f in files)
    lang_count = len(cfg.target_langs)
    unit_price = 4.0 if cfg.dubbing_mode == "high_quality" else 1.5
    bill_min = total_min * lang_count
    cost = bill_min * unit_price
    task_count = len(files) * lang_count
    caption_count = task_count * len(cfg.caption_formats)
    audio_count = task_count if cfg.output_dubbing_audio else 0

    speed_factor = 4.0 if (cfg.dubbing_mode == "high_quality" and cfg.fast_mode) else 5.0
    waves = max(1, math.ceil(task_count / 10)) if task_count else 1
    est_minutes = max(1, round(total_min * speed_factor * waves)) if task_count else 0

    return {
        "file_count": len(files),
        "total_duration_sec": round(total_sec, 2),
        "total_duration_min": round(total_min, 2),
        "total_size_gb": round(total_bytes / (1024**3), 2),
        "lang_count": lang_count,
        "unit_price": unit_price,
        "total_bill_min": round(bill_min, 2),
        "total_cost": round(cost, 2),
        "task_count": task_count,
        "caption_count": caption_count,
        "audio_count": audio_count,
        "estimated_minutes": est_minutes,
        "waves": waves,
    }


def build_inpaint_las_data(
    video_url: str,
    output_tos_path: str,
    cfg: InpaintConfig,
) -> dict[str, Any]:
    """Construct exact `data` body for Volcengine `las_video_inpaint_pro` v1 Submit API."""
    detection_mode = resolve_inpaint_detection_mode(cfg)
    has_sub_target = "subtitle" in cfg.targets or "scrolling_subtitle" in cfg.targets
    protect_effective = (
        cfg.subtitle_protect
        and cfg.locate_mode != "fixed"
        and not has_sub_target
        and "watermark" in cfg.targets
    )

    data: dict[str, Any] = {
        "video_url": video_url,
        "output_tos_path": output_tos_path,
        "model_level": cfg.model_level,
        "detection_mode": detection_mode,
        "return_subtitle_bbox": cfg.return_subtitle_bbox,
        "maximum_output_fps": cfg.max_fps,
        "maximum_resolution": cfg.max_resolution,
        "output_video_mode": cfg.video_mode,
        "output_codec": cfg.codec,
        "subtitle_protect": protect_effective,
        "subtitle_persistent": cfg.subtitle_persistent,
    }

    if cfg.max_process_frames != -1:
        data["max_process_frames"] = cfg.max_process_frames
    if cfg.output_bitrate:
        data["output_bitrate"] = cfg.output_bitrate

    if cfg.locate_mode == "fixed" and cfg.regions:
        data["fixed_bboxes"] = [reg.bbox for reg in cfg.regions]
        data["fixed_bboxes_intervals"] = [
            [round(reg.start_sec, 2), -1 if reg.until_end else round(reg.end_sec, 2)]
            for reg in cfg.regions
        ]
    elif detection_mode == "precise":
        data["targets"] = list(cfg.targets)

    return data


def _hex_with_opacity(hex_color: str, opacity_pct: float | int) -> str:
    """Convert #RRGGBB + opacity (0~100) into #RRGGBBAA per Volcengine LAS spec."""
    c = (hex_color or "#000000").strip()
    if not c.startswith("#"):
        c = f"#{c}"
    rgb = c[1:7] if len(c) >= 7 else "000000"
    alpha = max(0, min(255, int(round((float(opacity_pct) / 100.0) * 255.0))))
    return f"#{rgb.upper()}{alpha:02X}"


_SCRIPT_LOCKED_LANGS = {
    "zh-CN",
    "yue-CN",
    "ja-JP",
    "ko-KR",
    "th-TH",
    "ar-SA",
    "hi-IN",
    "he-IL",
    "km-KH",
    "lo-LA",
    "my-MM",
}
_LATIN_COMPATIBLE_FONTS = {"NotoSans-Regular", "FiraGO-Regular"}


def _resolve_font_for_language(lang_code: str, preferred_font: str) -> str:
    """Ensure every target language receives a valid font ID accepted by Volcengine LAS."""
    default_font = OUTPUT_LANG_MAP.get(lang_code, {}).get("font", "NotoSans-Regular")
    pref = (preferred_font or "").strip()
    if not pref or pref in ("NotoSans", "default"):
        return default_font
    if lang_code in _SCRIPT_LOCKED_LANGS:
        return default_font
    if pref in _LATIN_COMPATIBLE_FONTS or (lang_code == "en-US" and pref == "AtkinsonHyperlegible-Regular"):
        return pref
    return default_font


def build_translate_las_data(
    video_url: str,
    output_tos_path: str,
    cfg: TranslateConfig,
    subtitle_style: SubtitleStyleConfig,
) -> dict[str, Any]:
    """Construct exact `data` body for Volcengine `las_video_translate` v1 Submit API."""
    target_langs = list(cfg.target_langs)
    data: dict[str, Any] = {
        "video_url": video_url,
        "audio_language": cfg.source_lang,
        "output_languages": target_langs,
        "output_tos_path": output_tos_path,
        "dubbing_mode": cfg.dubbing_mode,
        "enable_fast_mode": cfg.fast_mode if cfg.dubbing_mode == "high_quality" else False,
        "enable_dynamic_duration": cfg.dynamic_duration,
        "burn_translated_subtitles": cfg.burn_subtitles,
        "caption_formats": list(cfg.caption_formats),
        "output_dubbing_audio": cfg.output_dubbing_audio,
        "enable_video_inpaint": cfg.enable_inpaint,
    }

    if cfg.burn_subtitles:
        data["subtitle_font_by_language"] = [
            _resolve_font_for_language(lang, subtitle_style.font) for lang in target_langs
        ]
        data["subtitle_font_size"] = max(8, min(128, int(round(subtitle_style.font_size))))
        data["subtitle_font_color"] = subtitle_style.font_color
        data["subtitle_bold"] = bool(subtitle_style.bold)
        data["subtitle_outline_color"] = subtitle_style.outline_color
        data["subtitle_outline_width"] = max(0.0, min(16.0, round(float(subtitle_style.outline_width), 2)))
        data["subtitle_background_color"] = _hex_with_opacity(subtitle_style.bg_color, subtitle_style.bg_opacity)
        data["subtitle_line_spacing"] = max(0.0, min(64.0, round(float(subtitle_style.line_spacing), 2)))
        data["subtitle_width_ratio"] = max(0.1, min(1.0, round(subtitle_style.width_ratio / 100.0, 2)))
        data["subtitle_top_margin_ratio"] = max(0.0, min(0.95, round(subtitle_style.top_margin_ratio / 100.0, 2)))

    if cfg.enable_inpaint:
        inpaint_cfg = cfg.inpaint_config or InpaintConfig()
        det_mode = resolve_inpaint_detection_mode(inpaint_cfg)
        v_params: dict[str, Any] = {
            "model_level": inpaint_cfg.model_level,
            "detection_mode": det_mode,
            "return_subtitle_bbox": True,
            "maximum_output_fps": inpaint_cfg.max_fps,
            "maximum_resolution": inpaint_cfg.max_resolution,
            "output_video_mode": inpaint_cfg.video_mode,
        }
        if inpaint_cfg.locate_mode == "fixed" and inpaint_cfg.regions:
            v_params["fixed_bboxes"] = [reg.bbox for reg in inpaint_cfg.regions]
        elif det_mode == "precise":
            v_params["targets"] = list(inpaint_cfg.targets)
        data["video_inpaint_params"] = v_params

    return data


def build_scheme_labels(cfg: InpaintConfig) -> tuple[str, str]:
    model_str = "极速版" if cfg.model_level == "lite" else "专业版"
    if cfg.locate_mode == "fixed":
        locate_str = "手动框选"
        sub_str = f"{len(cfg.regions)} 个固定区域"
    elif cfg.locate_mode == "precise":
        locate_str = "精准识别"
        sub_str = " · ".join(TARGET_LABELS.get(t, t) for t in cfg.targets)
    else:
        det = resolve_inpaint_detection_mode(cfg)
        locate_str = "全文字擦除" if det == "standard_all" else "标准检测"
        sub_str = "全部画面文字" if det == "standard_all" else " · ".join(TARGET_LABELS.get(t, t) for t in cfg.targets)
    return f"{model_str} · {locate_str}", sub_str


def format_duration_mmss(sec: float) -> str:
    s = max(0, int(round(sec)))
    m, r = divmod(s, 60)
    return f"{m}:{r:02d}"
