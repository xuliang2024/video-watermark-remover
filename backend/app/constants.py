"""CleanFrame operator constants, languages, presets and error mappings."""

from __future__ import annotations

INPAINT_OPERATOR_ID = "las_video_inpaint_pro"
INPAINT_OPERATOR_VERSION = "v1"

TRANSLATE_OPERATOR_ID = "las_video_translate"
TRANSLATE_OPERATOR_VERSION = "v1"

SUPPORTED_REGIONS = ["cn-beijing", "cn-shanghai", "cn-guangzhou"]

SOURCE_LANGUAGES = [
    {"code": "zh-CN", "name": "中文（简体）"},
    {"code": "yue-CN", "name": "粤语"},
    {"code": "en-US", "name": "英语"},
    {"code": "ja-JP", "name": "日语"},
    {"code": "ko-KR", "name": "韩语"},
    {"code": "es-MX", "name": "西班牙语"},
    {"code": "fr-FR", "name": "法语"},
    {"code": "de-DE", "name": "德语"},
    {"code": "id-ID", "name": "印尼语"},
    {"code": "th-TH", "name": "泰语"},
    {"code": "vi-VN", "name": "越南语"},
    {"code": "pt-BR", "name": "葡萄牙语"},
    {"code": "ru-RU", "name": "俄语"},
    {"code": "ar-SA", "name": "阿拉伯语"},
    {"code": "it-IT", "name": "意大利语"},
    {"code": "tr-TR", "name": "土耳其语"},
    {"code": "ms-MY", "name": "马来语"},
    {"code": "fil-PH", "name": "菲律宾语"},
    {"code": "hi-IN", "name": "印地语"},
    {"code": "nl-NL", "name": "荷兰语"},
    {"code": "pl-PL", "name": "波兰语"},
    {"code": "sv-SE", "name": "瑞典语"},
    {"code": "no-NO", "name": "挪威语"},
    {"code": "da-DK", "name": "丹麦语"},
    {"code": "fi-FI", "name": "芬兰语"},
]

OUTPUT_LANGUAGES = [
    {"code": "en-US", "name": "英语", "primary": True, "font": "NotoSans-Regular"},
    {"code": "ja-JP", "name": "日语", "primary": True, "font": "NotoSansJP-Regular"},
    {"code": "ko-KR", "name": "韩语", "primary": True, "font": "NotoSansKR-Regular"},
    {"code": "es-MX", "name": "西班牙语", "primary": True, "font": "NotoSans-Regular"},
    {"code": "id-ID", "name": "印尼语", "primary": True, "font": "NotoSans-Regular"},
    {"code": "pt-BR", "name": "葡萄牙语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "fr-FR", "name": "法语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "de-DE", "name": "德语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "th-TH", "name": "泰语", "primary": False, "font": "NotoSansThai-Regular"},
    {"code": "vi-VN", "name": "越南语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "ms-MY", "name": "马来语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "fil-PH", "name": "菲律宾语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "ar-SA", "name": "阿拉伯语", "primary": False, "font": "NotoSansArabic-Regular"},
    {"code": "ru-RU", "name": "俄语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "it-IT", "name": "意大利语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "tr-TR", "name": "土耳其语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "hi-IN", "name": "印地语", "primary": False, "font": "NotoSansDevanagari-Regular"},
    {"code": "nl-NL", "name": "荷兰语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "pl-PL", "name": "波兰语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "el-GR", "name": "希腊语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "sv-SE", "name": "瑞典语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "no-NO", "name": "挪威语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "da-DK", "name": "丹麦语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "fi-FI", "name": "芬兰语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "he-IL", "name": "希伯来语", "primary": False, "font": "NotoSansHebrew-Regular"},
    {"code": "km-KH", "name": "高棉语", "primary": False, "font": "NotoSansKhmer-Regular"},
    {"code": "lo-LA", "name": "老挝语", "primary": False, "font": "NotoSansLao-Regular"},
    {"code": "my-MM", "name": "缅甸语", "primary": False, "font": "NotoSansMyanmar-Regular"},
    {"code": "sw-KE", "name": "斯瓦希里语", "primary": False, "font": "NotoSans-Regular"},
    {"code": "yue-CN", "name": "粤语", "primary": False, "font": "NotoSansHK-Regular"},
    {"code": "zh-CN", "name": "中文（简体）", "primary": False, "font": "NotoSansSC-Regular"},
]

OUTPUT_LANG_MAP = {item["code"]: item for item in OUTPUT_LANGUAGES}

INPAINT_PRESETS = {
    "drama_watermark": {
        "key": "drama_watermark",
        "name": "预设 · 剧集去水印",
        "model_level": "pro",
        "targets": ["watermark", "subtitle"],
        "locate_mode": "precise",
        "max_resolution": "4k",
        "max_fps": 30,
        "video_mode": "balanced",
        "codec": "h264",
        "subtitle_protect": False,
        "subtitle_persistent": False,
    },
    "logo_only": {
        "key": "logo_only",
        "name": "预设 · 仅擦角标保字幕",
        "model_level": "pro",
        "targets": ["watermark"],
        "locate_mode": "precise",
        "max_resolution": "1080p",
        "max_fps": 30,
        "video_mode": "high",
        "codec": "h264",
        "subtitle_protect": True,
        "subtitle_persistent": False,
    },
    "fast_clean": {
        "key": "fast_clean",
        "name": "预设 · 极速清字幕",
        "model_level": "lite",
        "targets": ["subtitle", "scrolling_subtitle"],
        "locate_mode": "standard",
        "max_resolution": "1080p",
        "max_fps": 30,
        "video_mode": "balanced",
        "codec": "h264",
        "subtitle_protect": False,
        "subtitle_persistent": True,
    },
}

DEFAULT_SUBTITLE_STYLE = {
    "font": "NotoSans",
    "font_size": 60,
    "font_color": "#FFFFFF",
    "bold": False,
    "outline_color": "#000000",
    "outline_width": 2.0,
    "bg_color": "#000000",
    "bg_opacity": 0,
    "top_margin_ratio": 77,
    "width_ratio": 88,
    "line_spacing": 0,
}

DEFAULT_REGIONS = [
    {
        "id": "reg-1",
        "name": "区域 1 · 角标",
        "short_name": "区域 1 · 角标",
        "color": "mint",
        "bbox": [820, 60, 960, 180],
        "start_sec": 0.5,
        "end_sec": 62.0,
        "until_end": False,
    },
    {
        "id": "reg-2",
        "name": "区域 2 · 字幕",
        "short_name": "区域 2 · 字幕",
        "color": "blue",
        "bbox": [80, 820, 920, 930],
        "start_sec": 62.0,
        "end_sec": 504.0,
        "until_end": True,
    },
    {
        "id": "reg-3",
        "name": "区域 3 · 剧集信息",
        "short_name": "区域 3 · 剧集",
        "color": "amber",
        "bbox": [40, 80, 300, 160],
        "start_sec": 4.0,
        "end_sec": 40.0,
        "until_end": False,
    },
]

LAS_ERROR_HINTS = {
    "Url.Invalid": "视频地址无效或不可访问，请检查 URL、有效期和 TOS 读取权限",
    "Video.Invalid": "视频文件损坏或无法解码，请检查源文件后重试",
    "Video.FormatUnsupported": "容器或编码格式不受支持，建议转为 H.264 MP4 后重试",
    "Video.DownloadFailed": "算子下载源视频失败，请检查网络或 TOS 权限",
    "Video.DurationTooShort": "视频时长不足最小要求（修复 ≥1s / 翻译 ≥2s）",
    "Video.DurationExceeded": "视频超出时长上限（修复 ≤3h / 翻译 ≤4h）",
    "Video.FileTooLarge": "视频文件超过 10 GB 上限，请压缩或分段后提交",
    "Parameter.Invalid": "请求参数不合法，请检查检测模式、坐标区间或语种配置",
    "Video.Timeout": "算子处理超时，可降低输出帧率/分辨率或分段重试",
    "Video.VLMFailed": "精准检测服务瞬时超时，建议重试或切换标准检测模式",
    "Video.UploadFailed": "结果写入 TOS 失败，请检查输出目录写权限",
    "Authorization.Missing": "缺少 LAS API Key 鉴权头",
    "ApiKey.Invalid": "LAS API Key 无效，请核对控制台密钥",
    "TaskId.Invalid": "任务 ID 不存在或已超过 3 天有效期",
}
