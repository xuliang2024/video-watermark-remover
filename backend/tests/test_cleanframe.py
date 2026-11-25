from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Isolate test database & storage before importing app
_TMP_DIR = Path(tempfile.mkdtemp(prefix="cleanframe_test_"))
os.environ["CLEANFRAME_DATABASE_URL"] = f"sqlite:///{(_TMP_DIR / 'test.db').as_posix()}"
os.environ["CLEANFRAME_STORAGE_DIR"] = str(_TMP_DIR / "storage")
os.environ["CLEANFRAME_EXECUTION_MODE"] = "mock"
os.environ["CLEANFRAME_SCHEDULER_ENABLED"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from app.config import update_runtime_config  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas import FileEstimateInput, InpaintConfig, RegionItem, SubtitleStyleConfig, TranslateConfig  # noqa: E402
from app.services.billing import (  # noqa: E402
    ParameterValidationError,
    build_inpaint_las_data,
    build_translate_las_data,
    calc_inpaint_batch,
    calc_translate_batch,
    resolve_inpaint_detection_mode,
    validate_inpaint_config,
    validate_translate_config,
)
from app.services.scheduler import scheduler  # noqa: E402
from app.services.volc_las import VolcengineLasClient  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c
    shutil.rmtree(_TMP_DIR, ignore_errors=True)


def _generate_real_mp4(dest: Path) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg, "ffmpeg is required for real video integration test"
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=2:size=1280x720:rate=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        str(dest),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    assert res.returncode == 0, f"ffmpeg failed: {res.stderr}"
    return dest


# ============================================================
# 1. Billing Formula & Parameter Validation Unit Tests
# ============================================================


def test_inpaint_billing_matches_design_spec_exactly():
    files = [
        FileEstimateInput(id="1", name="S01E01.mp4", width=1920, height=1080, fps=29.97, duration_sec=504, size_bytes=1240000000),
        FileEstimateInput(id="2", name="S01E02.mp4", width=1920, height=1080, fps=29.97, duration_sec=492, size_bytes=1180000000),
        FileEstimateInput(id="3", name="EP03.mp4", width=3840, height=2160, fps=25.00, duration_sec=546, size_bytes=3860000000),
        FileEstimateInput(id="4", name="BTS.mp4", width=2560, height=1440, fps=59.94, duration_sec=182, size_bytes=940000000),
    ]
    cfg = InpaintConfig(
        model_level="pro",
        targets=["watermark", "subtitle"],
        locate_mode="precise",
        max_resolution="4k",
        max_fps=30,
    )
    res = calc_inpaint_batch(files, cfg)
    assert res["total_bill_min"] == pytest.approx(40.87, abs=0.02)
    assert res["total_cost"] == pytest.approx(122.60, abs=0.05)
    assert len(res["high_fps_warnings"]) == 1
    assert res["high_fps_warnings"][0]["name"] == "BTS.mp4"


def test_translate_billing_matches_design_spec_exactly():
    files = [
        FileEstimateInput(id="1", name="S01E01.mp4", width=1920, height=1080, fps=29.97, duration_sec=504),
        FileEstimateInput(id="2", name="promo.mp4", width=1080, height=1920, fps=30.0, duration_sec=42),
    ]
    cfg = TranslateConfig(
        source_lang="zh-CN",
        target_langs=["en-US", "ja-JP", "ko-KR"],
        dubbing_mode="high_quality",
        fast_mode=True,
        caption_formats=[".srt", ".ass"],
    )
    res = calc_translate_batch(files, cfg)
    assert res["task_count"] == 6
    assert res["caption_count"] == 12
    assert res["total_bill_min"] == pytest.approx(27.3, abs=0.01)
    assert res["total_cost"] == pytest.approx(109.20, abs=0.01)


def test_validation_rules_block_invalid_combinations():
    with pytest.raises(ParameterValidationError):
        validate_inpaint_config(InpaintConfig(model_level="lite", locate_mode="precise"))

    with pytest.raises(ParameterValidationError):
        validate_inpaint_config(
            InpaintConfig(
                locate_mode="fixed",
                regions=[RegionItem(id="r1", name="bad", short_name="bad", bbox=[500, 100, 400, 200])],
            )
        )

    with pytest.raises(ParameterValidationError):
        validate_translate_config(TranslateConfig(source_lang="zh-CN", target_langs=["zh-CN", "en-US"]))

    with pytest.raises(ParameterValidationError):
        validate_translate_config(TranslateConfig(dubbing_mode="emotion", fast_mode=True))


def test_las_payload_builders_and_detection_modes():
    assert resolve_inpaint_detection_mode(InpaintConfig(locate_mode="standard", targets=["subtitle"])) == "standard_subtitle"
    assert resolve_inpaint_detection_mode(InpaintConfig(locate_mode="standard", targets=["watermark"])) == "standard_watermark"
    assert resolve_inpaint_detection_mode(InpaintConfig(locate_mode="standard", targets=["watermark", "subtitle"])) == "standard_subtitle_watermark"
    assert resolve_inpaint_detection_mode(InpaintConfig(locate_mode="standard", targets=["watermark", "subtitle", "scrolling_subtitle", "drama_info"])) == "standard_all"

    fixed_cfg = InpaintConfig(
        locate_mode="fixed",
        subtitle_protect=True,
        regions=[
            RegionItem(id="r1", name="logo", short_name="logo", bbox=[820, 60, 960, 180], start_sec=0.5, end_sec=62.0, until_end=False),
            RegionItem(id="r2", name="sub", short_name="sub", bbox=[80, 820, 920, 930], start_sec=62.0, end_sec=504.0, until_end=True),
        ],
    )
    payload = build_inpaint_las_data("tos://bucket/in.mp4", "tos://bucket/out/", fixed_cfg)
    assert payload["fixed_bboxes"] == [[820, 60, 960, 180], [80, 820, 920, 930]]
    assert payload["fixed_bboxes_intervals"] == [[0.5, 62.0], [62.0, -1]]
    assert payload["subtitle_protect"] is False
    assert "targets" not in payload

    tr_payload = build_translate_las_data(
        "tos://bucket/in.mp4",
        "tos://bucket/out/",
        TranslateConfig(enable_inpaint=True, output_dubbing_audio=True),
        SubtitleStyleConfig(),
    )
    assert tr_payload["enable_video_inpaint"] is True
    assert tr_payload["output_dubbing_audio"] is True
    assert "video_inpaint_params" in tr_payload
    assert "subtitle_style" not in tr_payload
    assert tr_payload["subtitle_font_size"] == 60
    assert tr_payload["subtitle_font_by_language"] == ["NotoSans-Regular", "NotoSansJP-Regular", "NotoSansKR-Regular"]
    assert tr_payload["subtitle_background_color"] == "#00000000"


@pytest.mark.asyncio
async def test_volcengine_las_live_http_submit_and_poll():
    from app.services.volc_las import normalize_live_translate_result

    update_runtime_config(
        {
            "execution_mode": "live",
            "las_api_key": "las-test-secret-key",
            "las_region": "cn-beijing",
            "tos_bucket": "cleanframe-bucket",
        }
    )
    try:
        las = VolcengineLasClient()
        mock_ok = MagicMock()
        mock_ok.status_code = 200
        mock_ok.text = '{"metadata":{"task_id":"task-volc-live-001","task_status":"PENDING","business_code":"0","error_msg":""}}'
        mock_ok.json.return_value = {
            "metadata": {"task_id": "task-volc-live-001", "task_status": "PENDING", "business_code": "0", "error_msg": ""}
        }

        # 1) las_video_inpaint_pro does NOT send callback (not supported upstream)
        with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=mock_ok)) as mocked_post:
            res = await las.submit_operator(
                "las_video_inpaint_pro",
                "v1",
                {"video_url": "tos://cleanframe-bucket/a.mp4", "output_tos_path": "tos://cleanframe-bucket/out/"},
                callback_url="https://api.example.com/api/webhooks/las-callback",
            )
            assert res["metadata"]["task_id"] == "task-volc-live-001"
            call_args = mocked_post.call_args
            assert call_args.args[0] == "https://operator.las.cn-beijing.volces.com/api/v1/submit"
            assert call_args.kwargs["headers"]["Authorization"] == "Bearer las-test-secret-key"
            assert call_args.kwargs["json"]["operator_id"] == "las_video_inpaint_pro"
            assert "callback" not in call_args.kwargs["json"]

        # 2) las_video_translate sends callback, and auto-retries without callback if account lacks callback whitelist
        mock_cb_err = MagicMock()
        mock_cb_err.status_code = 400
        mock_cb_err.text = '{"metadata":{"task_status":"FAILED","business_code":"Parameter.Invalid","error_msg":"callback is not enabled for this operator/account"}}'
        mock_cb_err.json.return_value = {
            "metadata": {
                "task_status": "FAILED",
                "business_code": "Parameter.Invalid",
                "error_msg": "callback is not enabled for this operator/account",
            }
        }
        with patch("httpx.AsyncClient.post", new=AsyncMock(side_effect=[mock_cb_err, mock_ok])) as mocked_post2:
            res2 = await las.submit_operator(
                "las_video_translate",
                "v1",
                {"video_url": "tos://cleanframe-bucket/a.mp4", "output_tos_path": "tos://cleanframe-bucket/out/"},
                callback_url="https://api.example.com/api/webhooks/las-callback",
            )
            assert res2["metadata"]["task_id"] == "task-volc-live-001"
            assert mocked_post2.call_count == 2
            assert "callback" in mocked_post2.call_args_list[0].kwargs["json"]
            assert "callback" not in mocked_post2.call_args_list[1].kwargs["json"]

        # 3) Verify live translate Poll response normalization
        norm = normalize_live_translate_result(
            {
                "video_duration": 12.05,
                "translated_videos": [
                    {
                        "language": "en-US",
                        "type": "translated_video",
                        "tos_path": "tos://cleanframe-bucket/out/ep1_en-US.mp4",
                        "presigned_url": "https://example.com/ep1_en-US.mp4",
                    }
                ],
                "translated_captions": [
                    {
                        "language": "en-US",
                        "type": "translated_caption",
                        "format": ".srt",
                        "tos_path": "tos://cleanframe-bucket/out/ep1_en-US.srt",
                        "presigned_url": "",
                    }
                ],
                "repaired_videos": [
                    {
                        "task_id": "repair-123",
                        "type": "repaired_video",
                        "format": "mp4",
                        "tos_path": "tos://cleanframe-bucket/out/repaired.mp4",
                        "presigned_url": "https://example.com/repaired.mp4",
                        "video_duration": 12.05,
                    }
                ],
            },
            {"audio_language": "zh-CN", "output_languages": ["en-US"], "enable_video_inpaint": True},
            filename="ep1.mp4",
        )
        assert len(norm["cards"]) == 1
        assert norm["cards"][0]["video_url"] == "https://example.com/ep1_en-US.mp4"
        assert norm["repaired_video"]["task_id"] == "repair-123"
    finally:
        update_runtime_config({"execution_mode": "mock", "las_api_key": "", "tos_bucket": ""})


# ============================================================
# 2. Full-Stack API & Real Video E2E Tests
# ============================================================


def test_bootstrap_and_overview(client: TestClient):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

    boot = client.get("/api/system/bootstrap").json()
    assert len(boot["output_languages"]) == 31
    assert len(boot["source_languages"]) == 25
    assert len(boot["inpaint_presets"]) == 3

    ov = client.get("/api/dashboard/overview").json()
    assert len(ov["tasks"]) >= 6


@pytest.mark.asyncio
async def test_real_video_upload_inpaint_translate_and_downloads(client: TestClient):
    mp4_path = _generate_real_mp4(_TMP_DIR / "sample_real_720p.mp4")

    # 1) Upload real mp4 -> verify ffprobe extraction + thumbnail
    with mp4_path.open("rb") as fh:
        up = client.post(
            "/api/assets/upload?purpose=inpaint",
            files={"files": ("test_drama_ep01.mp4", fh, "video/mp4")},
        )
    assert up.status_code == 200, up.text
    asset = up.json()["items"][0]
    assert asset["width"] == 1280
    assert asset["height"] == 720
    assert asset["fps"] == pytest.approx(30.0, abs=0.5)
    assert asset["duration_sec"] == pytest.approx(2.0, abs=0.3)
    assert asset["thumbnail_url"].startswith("/media/thumbnails/")

    # 2) Submit inpaint batch & drive scheduler to completion
    bill_before = len(client.get("/api/billing/summary").json()["records"])
    batch_res = client.post(
        "/api/batches/inpaint",
        json={
            "name": "E2E 实测修复批次",
            "asset_ids": [asset["id"]],
            "config": {
                "model_level": "pro",
                "targets": ["watermark", "subtitle"],
                "locate_mode": "precise",
                "max_resolution": "1080p",
                "max_fps": 30,
                "video_mode": "balanced",
                "codec": "h264",
            },
        },
    )
    assert batch_res.status_code == 200, batch_res.text
    batch_id = batch_res.json()["batch_id"]

    # Tick scheduler: 1 dispatch + 3 progress ticks -> COMPLETED
    for _ in range(5):
        await scheduler.tick_once()

    detail = client.get(f"/api/batches/{batch_id}").json()
    assert detail["counts"]["completed"] == 1
    assert detail["status"] == "COMPLETED"
    task_id = detail["queue"][0]["id"]

    # Verify downloadable output video
    dl = client.get(f"/api/tasks/{task_id}/download")
    assert dl.status_code == 200
    assert len(dl.content) > 1000

    # Verify billing record appended
    bill_after = len(client.get("/api/billing/summary").json()["records"])
    assert bill_after == bill_before + 1

    # 3) Submit translate batch using uploaded video & verify ZIP captions
    tr_batch = client.post(
        "/api/batches/translate",
        json={
            "asset_ids": [asset["id"]],
            "config": {
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
        },
    )
    assert tr_batch.status_code == 200, tr_batch.text
    tr_batch_id = tr_batch.json()["batch_id"]

    for _ in range(5):
        await scheduler.tick_once()

    tr_detail = client.get(f"/api/batches/{tr_batch_id}").json()
    assert tr_detail["counts"]["completed"] == 1
    tr_task_id = tr_detail["queue"][0]["id"]

    zip_resp = client.get(f"/api/tasks/{tr_task_id}/download-captions")
    assert zip_resp.status_code == 200
    with zipfile.ZipFile(io.BytesIO(zip_resp.content)) as zf:
        names = zf.namelist()
        assert len(names) == 6  # 3 langs x 2 formats (.srt, .ass)
        assert any(n.endswith("_en-US.srt") for n in names)
        assert any(n.endswith("_ja-JP.ass") for n in names)


def test_templates_subtitle_style_and_webhook_idempotency(client: TestClient):
    # Region template save
    tpl = client.post(
        "/api/templates/regions",
        json={
            "name": "测试台标模板",
            "regions": [
                {"id": "r1", "name": "台标", "short_name": "台标", "color": "mint", "bbox": [800, 50, 950, 150], "start_sec": 0, "end_sec": 60, "until_end": False}
            ],
        },
    )
    assert tpl.status_code == 200
    tpl_id = tpl.json()["id"]
    assert client.delete(f"/api/templates/regions/{tpl_id}").status_code == 200

    # Subtitle style save & reset
    st = client.put("/api/settings/subtitle-style", json={"font": "FiraGO", "font_size": 72, "font_color": "#FDE047"})
    assert st.status_code == 200
    assert st.json()["font_size"] == 72
    reset = client.post("/api/settings/subtitle-style/reset")
    assert reset.json()["font_size"] == 60

    # Webhook idempotency on seeded RUNNING task
    cb1 = client.post(
        "/api/webhooks/las-callback",
        json={
            "metadata": {"task_id": "las-task-20261113-03f1", "task_status": "COMPLETED", "business_code": "0", "error_msg": ""},
            "data": {"output_video_url": "/media/sample/frame_16x9.png", "resolution": "3840x2160", "output_fps": 25.0},
        },
    )
    assert cb1.status_code == 200
    assert cb1.json()["status"] == "COMPLETED"

    cb2 = client.post(
        "/api/webhooks/las-callback",
        json={
            "metadata": {"task_id": "las-task-20261113-03f1", "task_status": "COMPLETED", "business_code": "0", "error_msg": ""},
            "data": {},
        },
    )
    assert cb2.status_code == 200
    assert cb2.json().get("idempotent_skip") is True

    # CSV exports
    assert client.get("/api/tasks/export").status_code == 200
    assert client.get("/api/billing/export").status_code == 200


def test_system_env_settings_persistence_and_first_run_onboarding(client: TestClient):
    # Reset to clean first-run state
    r0 = client.post("/api/system/config/reset?reopen_onboarding=true")
    assert r0.status_code == 200
    cfg0 = r0.json()
    assert cfg0["is_first_run"] is True
    assert cfg0["setup_completed"] is False

    # Save full environment variables via System Settings page API
    save_res = client.put(
        "/api/system/config",
        json={
            "execution_mode": "auto",
            "public_base_url": "https://cleanframe.example.com",
            "monthly_quota_minutes": 6000.0,
            "las_api_key": "las-secret-987654321",
            "las_region": "cn-shanghai",
            "las_callback_url": "https://cleanframe.example.com/api/webhooks/las-callback",
            "tos_bucket": "cleanframe-sh-prod",
            "tos_region": "cn-shanghai",
            "tos_endpoint": "tos-cn-shanghai.volces.com",
            "tos_input_prefix": "prod/inputs",
            "tos_output_prefix": "prod/outputs",
            "volc_access_key_id": "AKLT1234567890ABCDEF",
            "volc_access_key_secret": "SK_SUPER_SECRET_VALUE_9999",
            "max_concurrency": 16,
            "poll_interval_seconds": 4.5,
        },
    )
    assert save_res.status_code == 200
    saved = save_res.json()
    assert saved["is_first_run"] is False
    assert saved["setup_completed"] is True
    assert saved["effective_mode"] == "live"
    assert saved["has_las_api_key"] is True
    assert saved["has_tos_credentials"] is True
    assert saved["las_api_key_masked"] == "las-****4321"
    assert saved["volc_access_key_id_masked"] == "AKLT****CDEF"
    assert saved["max_concurrency"] == 16
    assert saved["monthly_quota_minutes"] == 6000.0
    assert "LAS_API_KEY=las-****4321" in saved["env_preview"]
    assert "SK_SUPER_SECRET_VALUE_9999" not in saved["env_preview"]
    assert "# ── 必填配置" in saved["env_preview"]
    assert "# ── 可选配置" in saved["env_preview"]
    assert "CLEANFRAME_EXECUTION_MODE=" not in saved["env_preview"]

    # Verify .env file persisted to isolated test storage path (including internal execution_mode)
    env_file = Path(saved["env_file_path"])
    assert env_file.exists()
    raw_env = env_file.read_text(encoding="utf-8")
    assert "LAS_API_KEY=las-secret-987654321" in raw_env
    assert "VOLC_ACCESS_KEY_ID=AKLT1234567890ABCDEF" in raw_env
    assert "CLEANFRAME_MAX_CONCURRENCY=16" in raw_env
    assert "CLEANFRAME_EXECUTION_MODE=" in raw_env

    # Leaving secret fields empty on subsequent save must preserve existing secrets & DB/storage paths
    orig_db = saved["database_url"]
    orig_storage = saved["storage_dir"]
    partial = client.put(
        "/api/system/config",
        json={"execution_mode": "live", "las_api_key": "", "volc_access_key_id": "", "max_concurrency": 12},
    ).json()
    assert partial["has_las_api_key"] is True
    assert partial["has_tos_credentials"] is True
    assert partial["max_concurrency"] == 12
    assert partial["database_url"] == orig_db
    assert partial["storage_dir"] == orig_storage

    # Explicit clear_keys removes targeted secret
    cleared = client.put(
        "/api/system/config",
        json={"clear_keys": ["las_api_key"], "execution_mode": "auto"},
    ).json()
    assert cleared["has_las_api_key"] is False
    assert cleared["effective_mode"] == "mock"

    # Reopen onboarding & dismiss with live mode (online-only settings flow)
    reopened = client.post("/api/system/config/reset?reopen_onboarding=true").json()
    assert reopened["is_first_run"] is True
    dismissed = client.post("/api/system/onboarding/dismiss", json={"execution_mode": "live"}).json()
    assert dismissed["is_first_run"] is False
    assert dismissed["setup_completed"] is True
    assert dismissed["execution_mode"] == "live"


def test_upload_progress_tracking_and_tos_callback(client: TestClient):
    uid = "up-test-progress-001"
    # Before upload exists, endpoint returns non-error receiving placeholder
    before = client.get(f"/api/assets/upload-progress/{uid}")
    assert before.status_code == 200
    assert before.json()["found"] is False
    assert before.json()["stage"] == "receiving"

    # Simulate TOS cloud sync invoking on_progress callback during upload
    def _fake_tos_upload(local_path, asset_id, filename, on_progress=None):
        size = local_path.stat().st_size
        if on_progress:
            on_progress(size // 2, size)
            on_progress(size, size)
        return f"tos://mock-bucket/inputs/{asset_id}/{filename}", f"tos://mock-bucket/inputs/{asset_id}/{filename}"

    mp4_path = _generate_real_mp4(_TMP_DIR / "progress_sample.mp4")
    with patch("app.routers.assets.tos_service.is_configured", return_value=True), patch(
        "app.routers.assets.tos_service.upload_input_video", side_effect=_fake_tos_upload
    ):
        with mp4_path.open("rb") as fh:
            resp = client.post(
                f"/api/assets/upload?purpose=inpaint&upload_id={uid}",
                files=[("files", ("progress_sample.mp4", fh, "video/mp4"))],
            )
    assert resp.status_code == 200, resp.text
    asset = resp.json()["items"][0]
    assert asset["name"] == "progress_sample.mp4"

    after = client.get(f"/api/assets/upload-progress/{uid}")
    assert after.status_code == 200
    prog = after.json()
    assert prog["found"] is True
    assert prog["stage"] == "done"
    assert prog["received_bytes"] == mp4_path.stat().st_size
    assert prog["tos_percent"] == 100
    assert prog["tos_consumed_bytes"] == mp4_path.stat().st_size

    # Unsupported extension records error state cleanly
    bad_uid = "up-test-progress-bad"
    bad_resp = client.post(
        f"/api/assets/upload?purpose=inpaint&upload_id={bad_uid}",
        files=[("files", ("readme.txt", io.BytesIO(b"hello"), "text/plain"))],
    )
    assert bad_resp.status_code == 400
    bad_prog = client.get(f"/api/assets/upload-progress/{bad_uid}").json()
    assert bad_prog["found"] is True
    assert bad_prog["stage"] == "error"
    assert bad_prog["error"]


def test_direct_tos_upload_single_multipart_and_fallback(client: TestClient):
    # 1) Without TOS configured, init returns proxy fallback mode
    fb = client.post(
        "/api/assets/direct-upload/init",
        json={"filename": "demo.mp4", "size_bytes": 1024 * 1024, "purpose": "inpaint"},
    )
    assert fb.status_code == 200
    assert fb.json()["mode"] == "proxy"

    # 2) Single PUT flow (<= 16 MiB)
    with patch("app.routers.assets.tos_service.is_configured", return_value=True), patch(
        "app.routers.assets.tos_service.build_tos_uri", side_effect=lambda k: f"tos://mock-bucket/{k}"
    ), patch(
        "app.routers.assets.tos_service.presign_put_object", return_value="https://mock-tos.local/single-put"
    ), patch(
        "app.routers.assets.tos_service.head_tos_uri", return_value=4 * 1024 * 1024
    ), patch(
        "app.routers.assets.tos_service.presign_tos_uri", return_value=None
    ):
        init_s = client.post(
            "/api/assets/direct-upload/init",
            json={"filename": "短片_01.mp4", "size_bytes": 4 * 1024 * 1024, "purpose": "inpaint"},
        )
        assert init_s.status_code == 200, init_s.text
        s_data = init_s.json()
        assert s_data["mode"] == "single_put"
        assert s_data["upload_url"] == "https://mock-tos.local/single-put"

        comp_s = client.post(
            "/api/assets/direct-upload/complete",
            json={
                "session_id": s_data["session_id"],
                "parts": [],
                "client_meta": {"width": 1080, "height": 1920, "duration_sec": 62.5},
            },
        )
        assert comp_s.status_code == 200, comp_s.text
        item = comp_s.json()["items"][0]
        assert item["name"] == "短片_01.mp4"
        assert item["width"] == 1080 and item["height"] == 1920
        assert item["duration_sec"] == pytest.approx(62.5, abs=0.1)
        assert item["tos_uri"].startswith("tos://mock-bucket/")

    # 3) Multipart flow (> 16 MiB, e.g., 40 MiB -> 3 parts) + sign-parts + complete + abort
    complete_calls = []
    abort_calls = []

    def _fake_complete(object_key, upload_id, parts):
        complete_calls.append((object_key, upload_id, parts))
        return True

    def _fake_abort(object_key, upload_id):
        abort_calls.append((object_key, upload_id))
        return True

    with patch("app.routers.assets.tos_service.is_configured", return_value=True), patch(
        "app.routers.assets.tos_service.build_tos_uri", side_effect=lambda k: f"tos://mock-bucket/{k}"
    ), patch(
        "app.routers.assets.tos_service.create_multipart_upload", return_value="tos-mp-upload-123"
    ), patch(
        "app.routers.assets.tos_service.presign_upload_part",
        side_effect=lambda key, uid, pnum, expires=7200: f"https://mock-tos.local/part/{pnum}?uid={uid}",
    ), patch(
        "app.routers.assets.tos_service.complete_multipart_upload", side_effect=_fake_complete
    ), patch(
        "app.routers.assets.tos_service.abort_multipart_upload", side_effect=_fake_abort
    ), patch(
        "app.routers.assets.tos_service.head_tos_uri", return_value=40 * 1024 * 1024
    ), patch(
        "app.routers.assets.tos_service.presign_tos_uri", return_value=None
    ):
        init_m = client.post(
            "/api/assets/direct-upload/init",
            json={"filename": "母猪师尊 EP01.mp4", "size_bytes": 40 * 1024 * 1024, "purpose": "inpaint"},
        )
        assert init_m.status_code == 200, init_m.text
        m_data = init_m.json()
        assert m_data["mode"] == "multipart"
        assert m_data["part_count"] == 3
        assert len(m_data["parts"]) == 3

        # Refresh part 2 signature
        re_sign = client.post(
            "/api/assets/direct-upload/sign-parts",
            json={"session_id": m_data["session_id"], "part_numbers": [2]},
        )
        assert re_sign.status_code == 200
        assert re_sign.json()["parts"][0]["part_number"] == 2

        # Complete with 3 ETags
        comp_m = client.post(
            "/api/assets/direct-upload/complete",
            json={
                "session_id": m_data["session_id"],
                "parts": [
                    {"part_number": 1, "etag": '"etag-1"'},
                    {"part_number": 2, "etag": '"etag-2"'},
                    {"part_number": 3, "etag": '"etag-3"'},
                ],
                "client_meta": {"width": 1920, "height": 1080, "duration_sec": 300.0},
            },
        )
        assert comp_m.status_code == 200, comp_m.text
        assert len(complete_calls) == 1
        assert comp_m.json()["items"][0]["name"] == "母猪师尊 EP01.mp4"

        # Test abort cleans up cloud multipart upload
        init_ab = client.post(
            "/api/assets/direct-upload/init",
            json={"filename": "aborted.mp4", "size_bytes": 40 * 1024 * 1024, "purpose": "translate"},
        ).json()
        ab = client.post("/api/assets/direct-upload/abort", json={"session_id": init_ab["session_id"]})
        assert ab.status_code == 200
        assert ab.json()["aborted"] is True
        assert len(abort_calls) == 1


def test_task_processing_duration_serialization_and_retry_reset(client: TestClient):
    from datetime import datetime, timedelta, timezone
    from app.services.volc_las import format_elapsed_seconds, _format_elapsed

    assert format_elapsed_seconds(None, compact=True) == "—"
    assert format_elapsed_seconds(42, compact=True) == "42秒"
    assert format_elapsed_seconds(330, compact=True) == "5分30秒"
    assert format_elapsed_seconds(3774, compact=True) == "1小时02分54秒"

    t0 = datetime(2026, 11, 25, 10, 30, 41, tzinfo=timezone.utc)
    t1 = t0 + timedelta(seconds=3774)
    assert _format_elapsed(t0, t1) == "1 小时 02 分 54 秒"

    ov = client.get("/api/dashboard/overview")
    assert ov.status_code == 200
    tasks = {t["id"]: t for t in ov.json()["tasks"]}

    # Completed seed task: 4m46s
    done_task = tasks["task-20261113-01a8"]
    assert done_task["elapsed_seconds"] == 286
    assert done_task["processing_duration"] == "4分46秒"
    assert done_task["started_at"] and done_task["finished_at"]

    # Running seed task: live elapsed seconds >= 700
    running_task = tasks["task-20261113-03f1"]
    assert running_task["elapsed_seconds"] >= 700
    assert "分" in running_task["processing_duration"]

    # Pending seed task: no processing duration yet
    pending_task = tasks["task-20261113-05b2"]
    assert pending_task["elapsed_seconds"] is None
    assert pending_task["processing_duration"] == "—"

    # Failed seed task ran for 2m14s before failing, then retry resets timestamps
    failed_task = tasks["task-20261113-04d9"]
    assert failed_task["elapsed_seconds"] == 134
    assert failed_task["processing_duration"] == "2分14秒"

    retried = client.post("/api/tasks/task-20261113-04d9/retry")
    assert retried.status_code == 200
    r_data = retried.json()
    assert r_data["raw_status"] == "PENDING"
    assert r_data["elapsed_seconds"] is None
    assert r_data["processing_duration"] == "—"
    assert r_data["started_at"] is None
    assert r_data["finished_at"] is None

    # CSV export includes processing_duration column
    csv_resp = client.get("/api/tasks/export")
    assert csv_resp.status_code == 200
    header_line = csv_resp.text.lstrip("\ufeff").splitlines()[0]
    assert "processing_duration" in header_line
    assert "4分46秒" in csv_resp.text




