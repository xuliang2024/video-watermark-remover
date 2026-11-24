"""Seed initial workspace data matching the CleanFrame design specification."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .constants import (
    DEFAULT_REGIONS,
    DEFAULT_SUBTITLE_STYLE,
    INPAINT_OPERATOR_ID,
    INPAINT_OPERATOR_VERSION,
    TRANSLATE_OPERATOR_ID,
    TRANSLATE_OPERATOR_VERSION,
)
from .models import (
    BatchJob,
    BillingRecord,
    MediaAsset,
    OperatorTask,
    RegionTemplate,
    SubtitleStylePreset,
    TaskLog,
)


SAMPLE_THUMB = "/media/sample/frame_16x9.png"


def seed_initial_data(db: Session) -> None:
    if db.query(SubtitleStylePreset).filter_by(id="default").first() is None:
        db.add(
            SubtitleStylePreset(
                id="default",
                name="短剧出海默认烧录样式",
                config_json=json.dumps(DEFAULT_SUBTITLE_STYLE, ensure_ascii=False),
            )
        )

    if db.query(RegionTemplate).count() == 0:
        db.add(
            RegionTemplate(
                id="tpl-default-drama",
                name="剧集标准三区域（角标+字幕+剧集）",
                regions_json=json.dumps(DEFAULT_REGIONS, ensure_ascii=False),
                is_active=True,
            )
        )

    if db.query(MediaAsset).count() == 0:
        sample_inpaint_assets = [
            MediaAsset(
                id="inf-1",
                filename="S01E01_雨夜来客.mp4",
                purpose="inpaint",
                thumbnail_url=SAMPLE_THUMB,
                width=1920,
                height=1080,
                fps=29.97,
                duration_sec=504,
                frames=15105,
                size_bytes=int(1.24 * 1024**3),
                detected_lang="中文（简体）",
                detected_lang_code="zh-CN",
                is_sample=True,
            ),
            MediaAsset(
                id="inf-2",
                filename="S01E02_灯下无声.mp4",
                purpose="inpaint",
                thumbnail_url=SAMPLE_THUMB,
                width=1920,
                height=1080,
                fps=29.97,
                duration_sec=492,
                frames=14745,
                size_bytes=int(1.18 * 1024**3),
                detected_lang="中文（简体）",
                detected_lang_code="zh-CN",
                is_sample=True,
            ),
            MediaAsset(
                id="inf-3",
                filename="EP03_旧信.mp4",
                purpose="inpaint",
                thumbnail_url=SAMPLE_THUMB,
                width=3840,
                height=2160,
                fps=25.00,
                duration_sec=546,
                frames=13650,
                size_bytes=int(3.86 * 1024**3),
                detected_lang="中文（简体）",
                detected_lang_code="zh-CN",
                is_sample=True,
            ),
            MediaAsset(
                id="inf-4",
                filename="BTS_花絮_0412.mp4",
                purpose="inpaint",
                thumbnail_url=SAMPLE_THUMB,
                width=2560,
                height=1440,
                fps=59.94,
                duration_sec=182,
                frames=10909,
                size_bytes=int(0.94 * 1024**3),
                detected_lang="中文（简体）",
                detected_lang_code="zh-CN",
                is_sample=True,
            ),
        ]
        sample_translate_assets = [
            MediaAsset(
                id="trf-1",
                filename="S01E01_雨夜来客.mp4",
                purpose="translate",
                thumbnail_url=SAMPLE_THUMB,
                width=1920,
                height=1080,
                fps=29.97,
                duration_sec=504,
                frames=15105,
                size_bytes=int(1.24 * 1024**3),
                detected_lang="中文（简体）",
                detected_lang_code="zh-CN",
                is_sample=True,
            ),
            MediaAsset(
                id="trf-2",
                filename="预告_30s_竖版.mp4",
                purpose="translate",
                thumbnail_url=SAMPLE_THUMB,
                width=1080,
                height=1920,
                fps=30.00,
                duration_sec=42,
                frames=1260,
                size_bytes=int(0.29 * 1024**3),
                detected_lang="中文（简体）",
                detected_lang_code="zh-CN",
                is_sample=True,
            ),
        ]
        db.add_all(sample_inpaint_assets + sample_translate_assets)

    if db.query(BatchJob).count() == 0:
        now = datetime.now(timezone.utc)
        expires_24h = now + timedelta(hours=24)
        expires_72h = now + timedelta(hours=72)

        # Seed main monitoring batch B-0412
        batch_b0412 = BatchJob(
            id="batch-b0412",
            code="B-0412",
            name="S01 全季去水印 · 批次 B-0412",
            job_type="inpaint",
            operator_id=INPAINT_OPERATOR_ID,
            operator_version=INPAINT_OPERATOR_VERSION,
            region="cn-beijing",
            status="RUNNING",
            paused=False,
            execution_mode="mock",
            config_json=json.dumps(
                {
                    "model_level": "pro",
                    "locate_mode": "precise",
                    "targets": ["watermark", "subtitle"],
                    "max_resolution": "4k",
                    "max_fps": 30,
                    "video_mode": "balanced",
                    "codec": "h264",
                },
                ensure_ascii=False,
            ),
            estimated_bill_min=40.86,
            estimated_cost=122.60,
            accrued_bill_min=16.60,
            accrued_cost=49.80,
            unit_price=3.0,
            created_at=now - timedelta(minutes=28),
        )
        db.add(batch_b0412)

        # Seed translate batch B-0410
        batch_b0410 = BatchJob(
            id="batch-b0410",
            code="B-0410",
            name="S01E01 多语出海交付 · 批次 B-0410",
            job_type="translate",
            operator_id=TRANSLATE_OPERATOR_ID,
            operator_version=TRANSLATE_OPERATOR_VERSION,
            region="cn-beijing",
            status="COMPLETED",
            paused=False,
            execution_mode="mock",
            config_json=json.dumps(
                {
                    "source_lang": "zh-CN",
                    "target_langs": ["en-US", "ja-JP", "ko-KR"],
                    "dubbing_mode": "high_quality",
                    "fast_mode": True,
                    "dynamic_duration": True,
                    "burn_subtitles": True,
                    "caption_formats": [".srt", ".ass"],
                    "enable_inpaint": True,
                    "output_dubbing_audio": False,
                },
                ensure_ascii=False,
            ),
            estimated_bill_min=25.20,
            estimated_cost=126.00,
            accrued_bill_min=25.20,
            accrued_cost=126.00,
            unit_price=4.0,
            created_at=now - timedelta(hours=2),
        )
        db.add(batch_b0410)

        translate_result_payload = {
            "source_lang": "中文（简体）",
            "source_lang_code": "zh-CN",
            "target_langs": ["en-US", "ja-JP", "ko-KR"],
            "dubbing_mode": "high_quality",
            "fast_mode": True,
            "enable_inpaint": True,
            "elapsed_label": "38 分 12 秒",
            "total_files": 10,
            "bill_minutes": 25.2,
            "total_cost": 126.0,
            "inpaint_extra_cost": 25.2,
            "repaired_video": {
                "task_id": "repair-task-8f2a",
                "resolution": "1920×1080",
                "duration": "8:24",
                "size_mb": 82.1,
                "url": "/media/sample/frame_16x9.png",
            },
            "cards": [
                {
                    "code": "en-US",
                    "label": "en-US · 英语",
                    "font_class": "lang-en",
                    "size": "MP4 · 86.4 MB",
                    "captions": "SRT + ASS",
                    "video_url": "/media/sample/frame_16x9.png",
                },
                {
                    "code": "ja-JP",
                    "label": "ja-JP · 日语",
                    "font_class": "lang-ja",
                    "size": "MP4 · 84.1 MB",
                    "captions": "SRT + ASS",
                    "video_url": "/media/sample/frame_16x9.png",
                },
                {
                    "code": "ko-KR",
                    "label": "ko-KR · 韩语",
                    "font_class": "lang-ko",
                    "size": "MP4 · 88.9 MB",
                    "captions": "SRT + ASS",
                    "video_url": "/media/sample/frame_16x9.png",
                },
            ],
            "caption_lines": [
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
            ],
        }

        seed_tasks = [
            OperatorTask(
                id="task-20261113-01a8",
                batch_id="batch-b0412",
                asset_id="inf-1",
                sort_order=1,
                filename="S01E01_雨夜来客.mp4",
                file_meta="1920×1080 · 29.97fps · 8:24",
                thumbnail_url=SAMPLE_THUMB,
                job_type="inpaint",
                operator_id=INPAINT_OPERATOR_ID,
                operator_version=INPAINT_OPERATOR_VERSION,
                scheme_label="专业版 · 精准识别",
                sub_scheme_label="水印 · 普通字幕",
                status="COMPLETED",
                progress=100,
                eta_label="14:41",
                remote_task_id="las-task-20261113-01a8",
                execution_mode="mock",
                output_video_url="/media/sample/frame_16x9.png",
                inpainted_video_path="tos://cleanframe-beijing/outputs/B-0412/S01E01_clean.mp4",
                subtitle_bbox="154,886,1766,1004",
                output_resolution="1920x1080",
                output_fps=29.97,
                estimated_bill_min=8.40,
                bill_minutes=8.40,
                unit_price=3.0,
                cost_cny=25.20,
                result_json=json.dumps(
                    {
                        "elapsed_label": "4 分 46 秒",
                        "file_size_mb": 86.4,
                        "codec": "h264",
                        "detected_summary": "字幕 1 · 角标 2 · 剧集信息 0",
                    },
                    ensure_ascii=False,
                ),
                is_seed=True,
                submitted_at=now - timedelta(minutes=28),
                finished_at=now - timedelta(minutes=19),
                expires_at=expires_24h,
            ),
            OperatorTask(
                id="task-20261113-02c4",
                batch_id="batch-b0412",
                asset_id="inf-2",
                sort_order=2,
                filename="S01E02_灯下无声.mp4",
                file_meta="1920×1080 · 29.97fps · 8:12",
                thumbnail_url=SAMPLE_THUMB,
                job_type="inpaint",
                operator_id=INPAINT_OPERATOR_ID,
                operator_version=INPAINT_OPERATOR_VERSION,
                scheme_label="专业版 · 精准识别",
                sub_scheme_label="仅普通字幕",
                status="COMPLETED",
                progress=100,
                eta_label="14:38",
                remote_task_id="las-task-20261113-02c4",
                execution_mode="mock",
                output_video_url="/media/sample/frame_16x9.png",
                inpainted_video_path="tos://cleanframe-beijing/outputs/B-0412/S01E02_clean.mp4",
                output_resolution="1920x1080",
                output_fps=29.97,
                estimated_bill_min=8.20,
                bill_minutes=8.20,
                unit_price=3.0,
                cost_cny=24.60,
                result_json=json.dumps(
                    {
                        "elapsed_label": "4 分 32 秒",
                        "file_size_mb": 83.2,
                        "codec": "h264",
                        "detected_summary": "字幕 1 · 角标 0 · 剧集信息 0",
                    },
                    ensure_ascii=False,
                ),
                is_seed=True,
                submitted_at=now - timedelta(minutes=34),
                finished_at=now - timedelta(minutes=22),
                expires_at=expires_24h,
            ),
            OperatorTask(
                id="task-20261113-03f1",
                batch_id="batch-b0412",
                asset_id="inf-3",
                sort_order=3,
                filename="EP03_旧信.mp4",
                file_meta="3840×2160 · 25.00fps · 9:06",
                thumbnail_url=SAMPLE_THUMB,
                job_type="inpaint",
                operator_id=INPAINT_OPERATOR_ID,
                operator_version=INPAINT_OPERATOR_VERSION,
                scheme_label="专业版 · 精准识别",
                sub_scheme_label="水印 · 角标 · Logo",
                status="RUNNING",
                progress=62,
                eta_label="预计 15:24",
                remote_task_id="las-task-20261113-03f1",
                execution_mode="mock",
                estimated_bill_min=18.20,
                bill_minutes=0.0,
                unit_price=3.0,
                cost_cny=0.0,
                is_seed=True,
                submitted_at=now - timedelta(minutes=19),
            ),
            OperatorTask(
                id="task-20261113-04d9",
                batch_id="batch-b0412",
                asset_id=None,
                sort_order=4,
                filename="S02E01_潮汐.mp4",
                file_meta="1920×1080 · 30.00fps · 7:48",
                thumbnail_url=SAMPLE_THUMB,
                job_type="inpaint",
                operator_id=INPAINT_OPERATOR_ID,
                operator_version=INPAINT_OPERATOR_VERSION,
                scheme_label="极速版 · 标准检测",
                sub_scheme_label="字幕 + 水印",
                status="FAILED",
                progress=0,
                eta_label="需重试",
                remote_task_id="las-task-20261113-04d9",
                execution_mode="mock",
                estimated_bill_min=7.80,
                unit_price=0.5,
                business_code="Video.VLMFailed",
                error_msg="Video.VLMFailed：检测服务瞬时超时，建议重试",
                is_seed=True,
                submitted_at=now - timedelta(minutes=52),
            ),
            OperatorTask(
                id="task-20261113-05b2",
                batch_id="batch-b0412",
                asset_id="inf-4",
                sort_order=5,
                filename="BTS_花絮_0412.mp4",
                file_meta="2560×1440 · 59.94fps · 3:02",
                thumbnail_url=SAMPLE_THUMB,
                job_type="inpaint",
                operator_id=INPAINT_OPERATOR_ID,
                operator_version=INPAINT_OPERATOR_VERSION,
                scheme_label="专业版 · 全文字擦除",
                sub_scheme_label="全部画面文字",
                status="PENDING",
                progress=0,
                eta_label="预计 15:41",
                remote_task_id=None,
                execution_mode="mock",
                estimated_bill_min=6.06,
                unit_price=1.5,
                is_seed=True,
                submitted_at=now - timedelta(minutes=18),
            ),
            OperatorTask(
                id="task-20261113-06e7",
                batch_id="batch-b0410",
                asset_id="trf-1",
                sort_order=1,
                filename="S01E01_雨夜来客.mp4",
                file_meta="1920×1080 · 29.97fps · 8:24",
                thumbnail_url=SAMPLE_THUMB,
                job_type="translate",
                operator_id=TRANSLATE_OPERATOR_ID,
                operator_version=TRANSLATE_OPERATOR_VERSION,
                scheme_label="翻译 · 高质量配音",
                sub_scheme_label="en-US · ja-JP · ko-KR",
                status="COMPLETED",
                progress=100,
                eta_label="11:56",
                remote_task_id="las-task-20261113-06e7",
                execution_mode="mock",
                output_video_url="/media/sample/frame_16x9.png",
                repaired_video_url="/media/sample/frame_16x9.png",
                output_resolution="1920x1080",
                output_fps=29.97,
                estimated_bill_min=25.20,
                bill_minutes=25.20,
                unit_price=4.0,
                cost_cny=126.00,
                result_json=json.dumps(translate_result_payload, ensure_ascii=False),
                is_seed=True,
                submitted_at=now - timedelta(hours=2),
                finished_at=now - timedelta(hours=1, minutes=20),
                expires_at=expires_72h,
            ),
        ]
        db.add_all(seed_tasks)

        seed_logs = [
            ("14:32:04", "submit", "6 tasks accepted (las_video_inpaint_pro v1 · cn-beijing)", "dim"),
            ("14:32:11", "S01E01", "PENDING → RUNNING", "normal"),
            ("14:38:52", "S01E01", "COMPLETED   8.40 min · ¥25.20", "mint"),
            ("14:38:53", "S01E02", "PENDING → RUNNING", "normal"),
            ("14:41:06", "S01E02", "COMPLETED   8.20 min · ¥24.60", "mint"),
            ("14:41:07", "EP03", "PENDING → RUNNING", "normal"),
            ("14:48:20", "EP03", "info: 4K output, res coeff 2.0", "amber"),
            ("14:52:31", "EP03", "progress 62%", "normal"),
            ("14:52:34", "poll", "las-task-20261113-03f1 RUNNING", "faint"),
            ("14:52:37", "queue", "1 task waiting · concurrency 1/10", "faint"),
        ]
        for ts, tag, msg, tone in seed_logs:
            db.add(TaskLog(batch_id="batch-b0412", timestamp_str=ts, tag=tag, message=msg, tone=tone))

    if db.query(BillingRecord).count() == 0:
        seed_bills = [
            ("2026-11-13 14:41", "B-0412 · S01E01_雨夜来客.mp4", "视频修复 · 专业版精准", "inpaint", "¥3.00/分", 8.40, 25.20),
            ("2026-11-13 14:38", "B-0412 · S01E02_灯下无声.mp4", "视频修复 · 专业版精准", "inpaint", "¥3.00/分", 8.20, 24.60),
            ("2026-11-13 13:20", "B-0411 · EP03_旧信.mp4 (4K ×2)", "视频修复 · 专业版精准", "inpaint", "¥3.00/分", 18.20, 54.60),
            ("2026-11-13 11:56", "B-0410 · 预告片_竖版_15s.mp4 (3语种)", "视频智能剪辑 · 高质量配音", "translate", "¥4.00/分", 0.75, 3.00),
            ("2026-11-12 20:14", "B-0408 · S01 全季翻译交付 (3语种)", "视频智能剪辑 · 高质量配音", "translate", "¥4.00/分", 25.20, 100.80),
            ("2026-11-12 18:05", "B-0407 · S01 字幕清洗批次 (6集)", "视频修复 · 极速版", "inpaint", "¥0.50/分", 48.40, 24.20),
        ]
        for dt_s, batch_lbl, op_lbl, jtype, unit_s, mins, cost in seed_bills:
            db.add(
                BillingRecord(
                    billed_at_str=dt_s,
                    batch_label=batch_lbl,
                    operator_label=op_lbl,
                    job_type=jtype,
                    unit_price_str=unit_s,
                    bill_minutes=mins,
                    cost_cny=cost,
                )
            )

    db.commit()
