"""Volcengine TOS integration for video upload and presigned URLs."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from ..config import get_runtime_config

logger = logging.getLogger(__name__)


class TosStorageService:
    """Uploads local media assets to Volcengine TOS when credentials are configured."""

    def _get_client(self, draft_overrides: dict[str, Any] | None = None):
        cfg = get_runtime_config(draft_overrides)
        ak = cfg["volc_access_key_id"]
        sk = cfg["volc_access_key_secret"]
        bucket = cfg["tos_bucket"]
        endpoint = cfg["tos_endpoint"]
        region = cfg["tos_region"]
        if not (ak and sk and bucket):
            return None, None
        try:
            import tos  # type: ignore

            client = tos.TosClientV2(ak, sk, endpoint, region)
            return client, bucket
        except Exception as exc:
            logger.warning("Unable to initialize TOS client: %s", exc)
            return None, None

    def upload_input_video(self, local_path: Path, asset_id: str, filename: str) -> tuple[str | None, str]:
        """
        Returns (tos_uri, accessible_video_url).
        In local/mock mode without TOS bucket, returns (None, local_media_url).
        """
        cfg = get_runtime_config()
        local_url = f"{cfg['public_base_url'].rstrip('/')}/media/uploads/{local_path.name}"
        client, bucket = self._get_client()
        if not client or not bucket:
            return None, local_url

        prefix = cfg["tos_input_prefix"].strip("/")
        object_key = f"{prefix}/{asset_id}/{filename}"
        try:
            client.put_object_from_file(bucket, object_key, str(local_path))
            tos_uri = f"tos://{bucket}/{object_key}"
            return tos_uri, tos_uri
        except Exception as exc:
            logger.error("TOS upload failed for %s: %s", filename, exc)
            return None, local_url

    def build_output_tos_path(self, batch_code: str, task_id: str) -> str:
        cfg = get_runtime_config()
        bucket = cfg["tos_bucket"] or "cleanframe-demo"
        prefix = cfg["tos_output_prefix"].strip("/")
        return f"tos://{bucket}/{prefix}/{batch_code}/{task_id}/"

    def test_bucket_access(self, draft_overrides: dict[str, Any] | None = None) -> dict:
        client, bucket = self._get_client(draft_overrides)
        if not client or not bucket:
            return {
                "configured": False,
                "ok": False,
                "message": "未配置完整 TOS 参数（需填写 TOS_BUCKET + VOLC_ACCESS_KEY_ID + VOLC_ACCESS_KEY_SECRET）",
            }
        try:
            client.head_bucket(bucket)
            return {
                "configured": True,
                "ok": True,
                "bucket": bucket,
                "message": f"TOS 桶 {bucket} 连接与鉴权正常",
            }
        except Exception as exc:
            return {
                "configured": True,
                "ok": False,
                "bucket": bucket,
                "message": f"TOS 校验失败: {exc}",
            }


tos_service = TosStorageService()
