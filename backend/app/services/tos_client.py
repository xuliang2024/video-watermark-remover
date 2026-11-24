"""Volcengine TOS integration for video upload and presigned URLs."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from ..config import get_runtime_config, get_settings

logger = logging.getLogger(__name__)


class TosStorageService:
    """Uploads local media assets to Volcengine TOS when credentials are configured."""

    def _get_client(self):
        cfg = get_runtime_config()
        settings = get_settings()
        ak = settings.volc_access_key_id or os.getenv("VOLC_ACCESS_KEY_ID", "")
        sk = settings.volc_access_key_secret or os.getenv("VOLC_ACCESS_KEY_SECRET", "")
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
        settings = get_settings()
        local_url = f"{settings.public_base_url.rstrip('/')}/media/uploads/{local_path.name}"
        client, bucket = self._get_client()
        if not client or not bucket:
            return None, local_url

        prefix = settings.tos_input_prefix.strip("/")
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
        settings = get_settings()
        bucket = cfg["tos_bucket"] or "cleanframe-demo"
        prefix = settings.tos_output_prefix.strip("/")
        return f"tos://{bucket}/{prefix}/{batch_code}/{task_id}/"

    def test_bucket_access(self) -> dict:
        client, bucket = self._get_client()
        if not client or not bucket:
            return {
                "configured": False,
                "ok": False,
                "message": "未配置 TOS_BUCKET 或 VOLC_ACCESS_KEY_ID / VOLC_ACCESS_KEY_SECRET",
            }
        try:
            client.head_bucket(bucket)
            return {
                "configured": True,
                "ok": True,
                "bucket": bucket,
                "message": f"TOS 桶 {bucket} 连接正常",
            }
        except Exception as exc:
            return {
                "configured": True,
                "ok": False,
                "bucket": bucket,
                "message": f"TOS 校验失败: {exc}",
            }


tos_service = TosStorageService()
