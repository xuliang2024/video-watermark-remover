from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


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


CONFIGURABLE_KEYS: tuple[str, ...] = (
    "execution_mode",
    "public_base_url",
    "monthly_quota_minutes",
    "las_api_key",
    "las_region",
    "las_base_url",
    "las_callback_url",
    "tos_bucket",
    "tos_region",
    "tos_endpoint",
    "tos_input_prefix",
    "tos_output_prefix",
    "volc_access_key_id",
    "volc_access_key_secret",
    "scheduler_enabled",
    "max_concurrency",
    "poll_interval_seconds",
    "database_url",
    "storage_dir",
)

SETUP_COMPLETED_DB_KEY = "_setup_completed"

# Mutable runtime overrides synchronized with DB & .env file
_runtime_overrides: dict[str, str] = {}
_setup_completed: bool = False


def _to_bool(val: str | bool, default: bool) -> bool:
    if isinstance(val, bool):
        return val
    v = str(val).strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    return default


def _to_int(val: str | int, default: int) -> int:
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return default


def _to_float(val: str | float, default: float) -> float:
    try:
        return float(str(val).strip())
    except (ValueError, TypeError):
        return default


def resolve_env_file_path() -> Path:
    custom = os.getenv("CLEANFRAME_ENV_FILE", "").strip()
    if custom:
        return Path(custom).expanduser().resolve()
    # Isolate .env writes during pytest runs so real workspace .env is never touched
    if os.getenv("PYTEST_CURRENT_TEST") or "cleanframe_test_" in get_settings().storage_dir:
        return get_settings().storage_path / ".env"
    return BACKEND_ROOT / ".env"


def get_runtime_config(draft_overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    s = get_settings()
    merged: dict[str, Any] = dict(_runtime_overrides)
    if draft_overrides:
        secret_keys = {"las_api_key", "volc_access_key_id", "volc_access_key_secret"}
        for k, v in draft_overrides.items():
            if v is None:
                continue
            if k in secret_keys and str(v).strip() == "":
                continue
            merged[k] = v

    execution_mode = str(merged.get("execution_mode", s.execution_mode)).strip() or "auto"
    public_base_url = str(merged.get("public_base_url", s.public_base_url)).strip() or "http://127.0.0.1:8000"
    monthly_quota_minutes = _to_float(merged.get("monthly_quota_minutes", s.monthly_quota_minutes), s.monthly_quota_minutes)

    las_api_key = str(merged.get("las_api_key", s.las_api_key)).strip()
    las_region = str(merged.get("las_region", s.las_region)).strip() or "cn-beijing"
    las_base_url_raw = str(merged.get("las_base_url", s.las_base_url)).strip()
    las_callback_url = str(merged.get("las_callback_url", s.las_callback_url)).strip()

    tos_bucket = str(merged.get("tos_bucket", s.tos_bucket)).strip()
    tos_region = str(merged.get("tos_region", s.tos_region)).strip() or las_region
    tos_endpoint = str(merged.get("tos_endpoint", s.tos_endpoint)).strip() or f"tos-{tos_region}.volces.com"
    tos_input_prefix = str(merged.get("tos_input_prefix", s.tos_input_prefix)).strip() or "cleanframe/inputs"
    tos_output_prefix = str(merged.get("tos_output_prefix", s.tos_output_prefix)).strip() or "cleanframe/outputs"

    default_ak = s.volc_access_key_id.strip() or os.getenv("VOLC_ACCESS_KEY_ID", "").strip()
    default_sk = s.volc_access_key_secret.strip() or os.getenv("VOLC_ACCESS_KEY_SECRET", "").strip()
    volc_access_key_id = str(merged.get("volc_access_key_id", default_ak)).strip()
    volc_access_key_secret = str(merged.get("volc_access_key_secret", default_sk)).strip()

    scheduler_enabled = _to_bool(merged.get("scheduler_enabled", s.scheduler_enabled), s.scheduler_enabled)
    max_concurrency = max(1, _to_int(merged.get("max_concurrency", s.max_concurrency), s.max_concurrency))
    poll_interval_seconds = max(0.5, _to_float(merged.get("poll_interval_seconds", s.poll_interval_seconds), s.poll_interval_seconds))

    database_url = str(merged.get("database_url", s.database_url)).strip()
    storage_dir = str(merged.get("storage_dir", s.storage_dir)).strip()

    resolved_base = (
        las_base_url_raw.rstrip("/")
        if las_base_url_raw
        else f"https://operator.las.{las_region}.volces.com/api/v1"
    )
    has_las = bool(las_api_key)
    has_volc_ak = bool(volc_access_key_id)
    has_volc_sk = bool(volc_access_key_secret)
    has_tos = bool(tos_bucket and has_volc_ak and has_volc_sk)

    if execution_mode == "mock":
        effective = "mock"
    elif execution_mode == "live":
        effective = "live"
    else:
        effective = "live" if (has_las and bool(tos_bucket)) else "mock"

    is_first_run = (not _setup_completed) and not (has_las and has_tos)

    return {
        "execution_mode": execution_mode,
        "effective_mode": effective,
        "public_base_url": public_base_url,
        "monthly_quota_minutes": monthly_quota_minutes,
        "las_api_key": las_api_key,
        "has_las_api_key": has_las,
        "las_region": las_region,
        "las_base_url": resolved_base,
        "las_base_url_raw": las_base_url_raw,
        "las_callback_url": las_callback_url,
        "callback_url": las_callback_url,
        "tos_bucket": tos_bucket,
        "tos_region": tos_region,
        "tos_endpoint": tos_endpoint,
        "tos_input_prefix": tos_input_prefix,
        "tos_output_prefix": tos_output_prefix,
        "volc_access_key_id": volc_access_key_id,
        "volc_access_key_secret": volc_access_key_secret,
        "has_volc_ak": has_volc_ak,
        "has_volc_sk": has_volc_sk,
        "has_tos_credentials": has_tos,
        "scheduler_enabled": scheduler_enabled,
        "max_concurrency": max_concurrency,
        "poll_interval_seconds": poll_interval_seconds,
        "database_url": database_url,
        "storage_dir": storage_dir,
        "active_database_url": s.database_url,
        "active_storage_dir": s.storage_dir,
        "restart_required": (database_url != s.database_url) or (storage_dir != s.storage_dir),
        "setup_completed": _setup_completed,
        "is_first_run": is_first_run,
        "env_file_path": str(resolve_env_file_path()),
    }


def update_runtime_config(
    updates: dict[str, Any],
    *,
    clear_keys: list[str] | None = None,
) -> dict[str, Any]:
    secret_keys = {"las_api_key", "volc_access_key_id", "volc_access_key_secret"}
    for key in CONFIGURABLE_KEYS:
        if key not in updates or updates[key] is None:
            continue
        val = updates[key]
        if isinstance(val, bool):
            _runtime_overrides[key] = "true" if val else "false"
        else:
            sval = str(val).strip()
            # When API passes clear_keys list, empty secret string means "keep unchanged" unless listed in clear_keys
            if key in secret_keys and sval == "" and clear_keys is not None and key not in clear_keys:
                continue
            _runtime_overrides[key] = sval

    if clear_keys:
        for ck in clear_keys:
            if ck in secret_keys:
                _runtime_overrides[ck] = ""

    return get_runtime_config()


def _quote_env(val: Any) -> str:
    if isinstance(val, bool):
        return "true" if val else "false"
    s = str(val if val is not None else "").replace("\r", "").replace("\n", "")
    if any(ch in s for ch in (" ", "#", '"', "'")):
        escaped = s.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return s


def render_env_file_content(cfg: dict[str, Any] | None = None, *, mask_secrets: bool = False) -> str:
    c = cfg or get_runtime_config()

    def _sec(raw: str) -> str:
        if not mask_secrets or not raw:
            return raw
        if len(raw) <= 8:
            return "*" * len(raw)
        return f"{raw[:4]}****{raw[-4:]}"

    lines = [
        "# 净影 CleanFrame 线上环境变量配置（由系统设置页面自动维护）",
        "",
        "# ── 必填配置（火山引擎 LAS 算子 + TOS 对象存储）──",
        f"LAS_API_KEY={_quote_env(_sec(c['las_api_key']))}",
        f"LAS_REGION={_quote_env(c['las_region'])}",
        f"TOS_BUCKET={_quote_env(c['tos_bucket'])}",
        f"VOLC_ACCESS_KEY_ID={_quote_env(_sec(c['volc_access_key_id']))}",
        f"VOLC_ACCESS_KEY_SECRET={_quote_env(_sec(c['volc_access_key_secret']))}",
        "",
        "# ── 可选配置（均有默认值，按需调整）──",
        f"CLEANFRAME_PUBLIC_BASE_URL={_quote_env(c['public_base_url'])}",
        f"LAS_CALLBACK_URL={_quote_env(c['las_callback_url'])}",
        f"CLEANFRAME_SCHEDULER_ENABLED={_quote_env(c['scheduler_enabled'])}",
        f"CLEANFRAME_MAX_CONCURRENCY={_quote_env(c['max_concurrency'])}",
        f"CLEANFRAME_POLL_INTERVAL={_quote_env(c['poll_interval_seconds'])}",
        f"LAS_BASE_URL={_quote_env(c['las_base_url_raw'])}",
        f"TOS_REGION={_quote_env(c['tos_region'])}",
        f"TOS_ENDPOINT={_quote_env(c['tos_endpoint'])}",
        f"TOS_INPUT_PREFIX={_quote_env(c['tos_input_prefix'])}",
        f"TOS_OUTPUT_PREFIX={_quote_env(c['tos_output_prefix'])}",
        f"CLEANFRAME_MONTHLY_QUOTA_MIN={_quote_env(c['monthly_quota_minutes'])}",
    ]
    if not mask_secrets:
        lines.extend(
            [
                "",
                "# ── 系统运维持久化参数（重启服务生效）──",
                f"CLEANFRAME_EXECUTION_MODE={_quote_env(c['execution_mode'])}",
                f"CLEANFRAME_DATABASE_URL={_quote_env(c['database_url'])}",
                f"CLEANFRAME_STORAGE_DIR={_quote_env(c['storage_dir'])}",
            ]
        )
    lines.append("")
    return "\n".join(lines)


def write_env_file(target_path: Path | None = None) -> Path:
    path = target_path or resolve_env_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".env.tmp")
    content = render_env_file_content(get_runtime_config(), mask_secrets=False)
    tmp_path.write_text(content, encoding="utf-8")
    try:
        os.chmod(tmp_path, 0o600)
    except OSError:
        pass
    tmp_path.replace(path)
    return path


def load_persisted_settings(db: "Session") -> dict[str, Any]:
    global _setup_completed
    from .models import SystemSetting

    rows = db.query(SystemSetting).all()
    for row in rows:
        if row.key == SETUP_COMPLETED_DB_KEY:
            _setup_completed = _to_bool(row.value, False)
        elif row.key in CONFIGURABLE_KEYS:
            _runtime_overrides[row.key] = row.value
    return get_runtime_config()


def persist_runtime_settings(
    db: "Session",
    *,
    mark_setup_completed: bool | None = None,
    sync_env_file: bool = True,
) -> dict[str, Any]:
    global _setup_completed
    from .models import SystemSetting

    if mark_setup_completed is not None:
        _setup_completed = mark_setup_completed

    existing = {r.key: r for r in db.query(SystemSetting).all()}

    def _upsert(k: str, v: str) -> None:
        if k in existing:
            existing[k].value = v
        else:
            db.add(SystemSetting(key=k, value=v))

    _upsert(SETUP_COMPLETED_DB_KEY, "true" if _setup_completed else "false")
    for k, v in _runtime_overrides.items():
        if k in CONFIGURABLE_KEYS:
            _upsert(k, str(v))

    db.commit()
    if sync_env_file:
        write_env_file()
    return get_runtime_config()


def reset_persisted_settings(db: "Session", *, reopen_onboarding: bool = False) -> dict[str, Any]:
    global _setup_completed
    from .models import SystemSetting

    _runtime_overrides.clear()
    _setup_completed = not reopen_onboarding
    db.query(SystemSetting).delete()
    db.add(SystemSetting(key=SETUP_COMPLETED_DB_KEY, value="true" if _setup_completed else "false"))
    db.commit()
    env_path = resolve_env_file_path()
    if env_path.exists():
        write_env_file(env_path)
    return get_runtime_config()
