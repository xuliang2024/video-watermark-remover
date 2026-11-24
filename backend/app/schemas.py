from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class RegionItem(BaseModel):
    id: str
    name: str
    short_name: str
    color: Literal["mint", "blue", "amber"] = "mint"
    bbox: list[int] = Field(..., min_length=4, max_length=4)
    start_sec: float = 0.0
    end_sec: float = 0.0
    until_end: bool = True


class InpaintConfig(BaseModel):
    name: str = "预设 · 剧集去水印"
    model_level: Literal["lite", "pro"] = "pro"
    targets: list[Literal["watermark", "subtitle", "scrolling_subtitle", "drama_info"]] = Field(
        default_factory=lambda: ["watermark", "subtitle"]
    )
    locate_mode: Literal["standard", "precise", "fixed"] = "precise"
    max_resolution: Literal["720p", "1080p", "4k"] = "4k"
    max_fps: int = Field(default=30, gt=0, le=120)
    video_mode: Literal["economy", "balanced", "high", "source"] = "balanced"
    codec: Literal["h264", "h265"] = "h264"
    output_bitrate: int | None = Field(default=None, gt=0)
    subtitle_protect: bool = False
    subtitle_persistent: bool = False
    return_subtitle_bbox: bool = True
    max_process_frames: int = -1
    regions: list[RegionItem] = Field(default_factory=list)


class SubtitleStyleConfig(BaseModel):
    font: str = "NotoSans"
    font_size: int = Field(default=60, ge=16, le=128)
    font_color: str = "#FFFFFF"
    bold: bool = False
    outline_color: str = "#000000"
    outline_width: float = Field(default=2.0, ge=0, le=10)
    bg_color: str = "#000000"
    bg_opacity: int = Field(default=0, ge=0, le=100)
    top_margin_ratio: int = Field(default=77, ge=10, le=95)
    width_ratio: int = Field(default=88, ge=30, le=100)
    line_spacing: int = Field(default=0, ge=-10, le=40)


class TranslateConfig(BaseModel):
    source_lang: str = "zh-CN"
    target_langs: list[str] = Field(default_factory=lambda: ["en-US", "ja-JP", "ko-KR"])
    dubbing_mode: Literal["emotion", "timbre", "high_quality"] = "high_quality"
    fast_mode: bool = True
    dynamic_duration: bool = True
    burn_subtitles: bool = True
    caption_formats: list[Literal[".srt", ".ass", ".vtt", ".txt", ".xml"]] = Field(
        default_factory=lambda: [".srt", ".ass"]
    )
    enable_inpaint: bool = True
    output_dubbing_audio: bool = False
    subtitle_style: SubtitleStyleConfig | None = None
    inpaint_config: InpaintConfig | None = None


class FileEstimateInput(BaseModel):
    id: str | None = None
    name: str
    width: int = 1920
    height: int = 1080
    fps: float = 30.0
    duration_sec: float = 60.0
    size_bytes: int = 0


class InpaintEstimateRequest(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)
    files: list[FileEstimateInput] = Field(default_factory=list)
    config: InpaintConfig


class TranslateEstimateRequest(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)
    files: list[FileEstimateInput] = Field(default_factory=list)
    config: TranslateConfig


class CreateInpaintBatchRequest(BaseModel):
    name: str | None = None
    asset_ids: list[str] = Field(..., min_length=1)
    config: InpaintConfig


class CreateTranslateBatchRequest(BaseModel):
    name: str | None = None
    asset_ids: list[str] = Field(..., min_length=1)
    config: TranslateConfig


class RegionTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    regions: list[RegionItem] = Field(..., min_length=1)


class SystemConfigUpdate(BaseModel):
    execution_mode: Literal["auto", "live", "mock"] | None = None
    las_api_key: str | None = None
    las_region: Literal["cn-beijing", "cn-shanghai", "cn-guangzhou"] | None = None
    las_base_url: str | None = None
    tos_bucket: str | None = None
    tos_endpoint: str | None = None


class LasCallbackMetadata(BaseModel):
    task_id: str
    task_status: str
    business_code: str = "0"
    error_msg: str = ""


class LasCallbackPayload(BaseModel):
    metadata: LasCallbackMetadata
    data: dict[str, Any] | None = None
