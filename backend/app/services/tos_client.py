"""Volcengine TOS integration for video upload and presigned URLs."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Callable
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

    def is_configured(self, draft_overrides: dict[str, Any] | None = None) -> bool:
        if os.getenv("PYTEST_CURRENT_TEST") and not draft_overrides:
            return False
        cfg = get_runtime_config(draft_overrides)
        return bool(cfg["volc_access_key_id"] and cfg["volc_access_key_secret"] and cfg["tos_bucket"])

    def build_input_object_key(self, asset_id: str, filename: str) -> str:
        cfg = get_runtime_config()
        prefix = cfg["tos_input_prefix"].strip("/")
        return f"{prefix}/{asset_id}/{filename}"

    def build_tos_uri(self, object_key: str) -> str | None:
        cfg = get_runtime_config()
        bucket = cfg["tos_bucket"]
        if not bucket:
            return None
        return f"tos://{bucket}/{object_key.lstrip('/')}"

    def presign_put_object(self, object_key: str, *, expires: int = 7200) -> str | None:
        client, bucket = self._get_client()
        if not client or not bucket:
            return None
        try:
            import tos  # type: ignore

            out = client.pre_signed_url(
                tos.HttpMethodType.Http_Method_Put,
                bucket=bucket,
                key=object_key,
                expires=expires,
            )
            return out.signed_url
        except Exception as exc:
            logger.error("Failed to presign PUT for %s: %s", object_key, exc)
            return None

    def create_multipart_upload(self, object_key: str, *, content_type: str | None = None) -> str | None:
        client, bucket = self._get_client()
        if not client or not bucket:
            return None
        try:
            kwargs: dict[str, Any] = {}
            if content_type:
                kwargs["content_type"] = content_type
            out = client.create_multipart_upload(bucket, object_key, **kwargs)
            return out.upload_id
        except Exception as exc:
            logger.error("Failed to create multipart upload for %s: %s", object_key, exc)
            return None

    def presign_upload_part(
        self,
        object_key: str,
        upload_id: str,
        part_number: int,
        *,
        expires: int = 7200,
    ) -> str | None:
        client, bucket = self._get_client()
        if not client or not bucket:
            return None
        try:
            import tos  # type: ignore

            out = client.pre_signed_url(
                tos.HttpMethodType.Http_Method_Put,
                bucket=bucket,
                key=object_key,
                expires=expires,
                query={"partNumber": str(part_number), "uploadId": upload_id},
            )
            return out.signed_url
        except Exception as exc:
            logger.error("Failed to presign part %s for %s: %s", part_number, object_key, exc)
            return None

    def complete_multipart_upload(
        self,
        object_key: str,
        upload_id: str,
        parts: list[dict[str, Any]],
    ) -> bool:
        client, bucket = self._get_client()
        if not client or not bucket:
            return False
        try:
            import tos  # type: ignore

            sorted_parts = sorted(parts, key=lambda p: int(p["part_number"]))
            uploaded = [
                tos.models2.UploadedPart(part_number=int(p["part_number"]), etag=str(p["etag"]).strip())
                for p in sorted_parts
            ]
            client.complete_multipart_upload(bucket, object_key, upload_id, parts=uploaded)
            return True
        except Exception as exc:
            logger.error("Failed to complete multipart upload for %s: %s", object_key, exc)
            return False

    def abort_multipart_upload(self, object_key: str, upload_id: str) -> bool:
        client, bucket = self._get_client()
        if not client or not bucket:
            return False
        try:
            client.abort_multipart_upload(bucket, object_key, upload_id)
            return True
        except Exception as exc:
            logger.warning("Failed to abort multipart upload for %s: %s", object_key, exc)
            return False

    def upload_input_video(
        self,
        local_path: Path,
        asset_id: str,
        filename: str,
        on_progress: Callable[[int, int], None] | None = None,
    ) -> tuple[str | None, str]:
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
        file_size = local_path.stat().st_size if local_path.exists() else 0

        def _listener(consumed_bytes: int, total_bytes: int, _rw_once: int, _transfer_type: Any) -> None:
            if not on_progress:
                return
            try:
                effective_total = int(total_bytes) if total_bytes and total_bytes > 0 else file_size
                on_progress(max(0, int(consumed_bytes or 0)), max(0, effective_total))
            except Exception:
                pass

        try:
            kwargs: dict[str, Any] = {}
            if on_progress:
                on_progress(0, file_size)
                kwargs["data_transfer_listener"] = _listener
            client.put_object_from_file(bucket, object_key, str(local_path), **kwargs)
            if on_progress and file_size > 0:
                on_progress(file_size, file_size)
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
