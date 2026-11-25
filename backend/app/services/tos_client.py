"""Volcengine TOS integration for video upload and presigned URLs."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any
from urllib.parse import quote

from ..config import get_runtime_config

logger = logging.getLogger(__name__)


def parse_tos_uri(tos_uri: str | None) -> tuple[str, str] | None:
    """Parse `tos://bucket/key` into `(bucket, key)`."""
    if not tos_uri or not tos_uri.startswith("tos://"):
        return None
    rest = tos_uri[len("tos://") :]
    if "/" not in rest:
        return None
    bucket, key = rest.split("/", 1)
    if not bucket or not key:
        return None
    return bucket, key


class TosStorageService:
    """Uploads local media assets to Volcengine TOS when credentials are configured."""

    def _get_client(self, draft_overrides: dict[str, Any] | None = None):
        if os.getenv("PYTEST_CURRENT_TEST") and not draft_overrides:
            return None, None
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

    def presign_tos_uri(
        self,
        tos_uri: str | None,
        *,
        expires: int = 7200,
        download_filename: str | None = None,
    ) -> str | None:
        parsed = parse_tos_uri(tos_uri)
        if not parsed:
            return None
        client, _ = self._get_client()
        if not client:
            return None
        bucket, key = parsed
        try:
            import tos  # type: ignore

            query = None
            if download_filename:
                safe_ascii = download_filename.encode("ascii", "ignore").decode("ascii") or "download.mp4"
                encoded = quote(download_filename, safe="")
                query = {
                    "response-content-disposition": f"attachment; filename=\"{safe_ascii}\"; filename*=UTF-8''{encoded}"
                }
            out = client.pre_signed_url(
                tos.HttpMethodType.Http_Method_Get,
                bucket=bucket,
                key=key,
                expires=expires,
                query=query,
            )
            return out.signed_url
        except Exception as exc:
            logger.warning("Failed to presign %s: %s", tos_uri, exc)
            return None

    def head_tos_uri(self, tos_uri: str | None) -> int | None:
        parsed = parse_tos_uri(tos_uri)
        if not parsed:
            return None
        client, _ = self._get_client()
        if not client:
            return None
        bucket, key = parsed
        try:
            head = client.head_object(bucket=bucket, key=key)
            return int(head.content_length)
        except Exception:
            return None

    def read_tos_text(self, tos_uri: str | None, *, max_bytes: int = 524288) -> str | None:
        parsed = parse_tos_uri(tos_uri)
        if not parsed:
            return None
        client, _ = self._get_client()
        if not client:
            return None
        bucket, key = parsed
        try:
            obj = client.get_object(bucket=bucket, key=key)
            raw = obj.read(max_bytes)
            return raw.decode("utf-8-sig", errors="replace")
        except Exception as exc:
            logger.warning("Failed to read text from %s: %s", tos_uri, exc)
            return None

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
