from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "净影 CleanFrame API"
    app_version: str = "1.0.0"

    # Execution mode: auto | live | mock
    execution_mode: Literal["auto", "live", "mock"] = Field(
        default="auto", alias="CLEANFRAME_EXECUTION_MODE"
    )

    # Volcengine LAS config
    las_api_key: str = Field(default="", alias="LAS_API_KEY")
    las_region: str = Field(default="cn-beijing", alias="LAS_REGION")
    las_base_url: str = Field(default="", alias="LAS_BASE_URL")
    las_callback_url: str = Field(default="", alias="LAS_CALLBACK_URL")

    # Volcengine TOS config
    tos_bucket: str = Field(default="", alias="TOS_BUCKET")
    tos_region: str = Field(default="cn-beijing", alias="TOS_REGION")
    tos_endpoint: str = Field(default="tos-cn-beijing.volces.com", alias="TOS_ENDPOINT")
    tos_input_prefix: str = Field(default="cleanframe/inputs", alias="TOS_INPUT_PREFIX")
    tos_output_prefix: str = Field(default="cleanframe/outputs", alias="TOS_OUTPUT_PREFIX")
    volc_access_key_id: str = Field(default="", alias="VOLC_ACCESS_KEY_ID")
    volc_access_key_secret: str = Field(default="", alias="VOLC_ACCESS_KEY_SECRET")

    # Scheduler & limits
    max_concurrency: int = Field(default=10, alias="CLEANFRAME_MAX_CONCURRENCY")
    poll_interval_seconds: float = Field(default=3.0, alias="CLEANFRAME_POLL_INTERVAL")
    monthly_quota_minutes: float = Field(default=3000.0, alias="CLEANFRAME_MONTHLY_QUOTA_MIN")
    scheduler_enabled: bool = Field(default=True, alias="CLEANFRAME_SCHEDULER_ENABLED")

    # Storage & DB
    database_url: str = Field(
        default=f"sqlite:///{(BACKEND_ROOT / 'storage' / 'cleanframe.db').as_posix()}",
        alias="CLEANFRAME_DATABASE_URL",
    )
    storage_dir: str = Field(
        default=str(BACKEND_ROOT / "storage"),
        alias="CLEANFRAME_STORAGE_DIR",
    )
    public_base_url: str = Field(
        default="http://127.0.0.1:8000",
        alias="CLEANFRAME_PUBLIC_BASE_URL",
    )

    @property
    def resolved_las_base_url(self) -> str:
        if self.las_base_url.strip():
            return self.las_base_url.strip().rstrip("/")
        return f"https://operator.las.{self.las_region}.volces.com/api/v1"

    @property
    def storage_path(self) -> Path:
        p = Path(self.storage_dir)
        if not p.is_absolute():
            p = (BACKEND_ROOT / p).resolve()
        return p

    @property
    def uploads_path(self) -> Path:
        return self.storage_path / "uploads"

    @property
    def outputs_path(self) -> Path:
        return self.storage_path / "outputs"

    @property
    def thumbnails_path(self) -> Path:
        return self.storage_path / "thumbnails"

    @property
    def sample_frame_path(self) -> Path:
        candidates = [
            PROJECT_ROOT / "assets" / "frame_16x9.png",
            PROJECT_ROOT / "web" / "assets" / "frame_16x9.png",
        ]
        for c in candidates:
            if c.exists():
                return c
        return candidates[0]

    @property
    def has_las_credentials(self) -> bool:
        return bool(self.las_api_key.strip())

    @property
    def has_tos_credentials(self) -> bool:
        return bool(
            self.tos_bucket.strip()
            and self.volc_access_key_id.strip()
            and self.volc_access_key_secret.strip()
        )

    @property
    def effective_mode(self) -> Literal["live", "mock"]:
        if self.execution_mode == "mock":
            return "mock"
        if self.execution_mode == "live":
            return "live"
        if self.has_las_credentials and self.tos_bucket.strip():
            return "live"
        return "mock"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.uploads_path.mkdir(parents=True, exist_ok=True)
    settings.outputs_path.mkdir(parents=True, exist_ok=True)
    settings.thumbnails_path.mkdir(parents=True, exist_ok=True)
    return settings


# Mutable runtime overrides for testing / live configuration updates in UI
_runtime_overrides: dict[str, str] = {}


def get_runtime_config() -> dict:
    s = get_settings()
    las_api_key = _runtime_overrides.get("las_api_key", s.las_api_key)
    las_region = _runtime_overrides.get("las_region", s.las_region)
    las_base_url = _runtime_overrides.get("las_base_url", s.las_base_url)
    tos_bucket = _runtime_overrides.get("tos_bucket", s.tos_bucket)
    tos_endpoint = _runtime_overrides.get("tos_endpoint", s.tos_endpoint)
    execution_mode = _runtime_overrides.get("execution_mode", s.execution_mode)

    resolved_base = (
        las_base_url.strip().rstrip("/")
        if las_base_url.strip()
        else f"https://operator.las.{las_region}.volces.com/api/v1"
    )
    has_las = bool(las_api_key.strip())
    has_tos = bool(
        tos_bucket.strip()
        and (s.volc_access_key_id.strip() or os.getenv("VOLC_ACCESS_KEY_ID"))
        and (s.volc_access_key_secret.strip() or os.getenv("VOLC_ACCESS_KEY_SECRET"))
    )
    if execution_mode == "mock":
        effective = "mock"
    elif execution_mode == "live":
        effective = "live"
    else:
        effective = "live" if (has_las and bool(tos_bucket.strip())) else "mock"

    return {
        "execution_mode": execution_mode,
        "effective_mode": effective,
        "las_api_key": las_api_key,
        "has_las_api_key": has_las,
        "las_region": las_region,
        "las_base_url": resolved_base,
        "tos_bucket": tos_bucket,
        "tos_endpoint": tos_endpoint,
        "tos_region": s.tos_region,
        "has_tos_credentials": has_tos,
        "max_concurrency": s.max_concurrency,
        "poll_interval_seconds": s.poll_interval_seconds,
        "callback_url": s.las_callback_url,
    }


def update_runtime_config(updates: dict[str, str | None]) -> dict:
    for key in (
        "execution_mode",
        "las_api_key",
        "las_region",
        "las_base_url",
        "tos_bucket",
        "tos_endpoint",
    ):
        if key in updates and updates[key] is not None:
            _runtime_overrides[key] = str(updates[key]).strip()
    return get_runtime_config()
