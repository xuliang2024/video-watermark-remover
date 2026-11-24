from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("asset"))
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[str] = mapped_column(String(32), default="inpaint")  # inpaint | translate
    local_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    tos_uri: Mapped[str | None] = mapped_column(String(512), nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    thumbnail_url: Mapped[str] = mapped_column(String(512), default="/media/sample/frame_16x9.png")
    width: Mapped[int] = mapped_column(Integer, default=1920)
    height: Mapped[int] = mapped_column(Integer, default=1080)
    fps: Mapped[float] = mapped_column(Float, default=30.0)
    duration_sec: Mapped[float] = mapped_column(Float, default=60.0)
    frames: Mapped[int] = mapped_column(Integer, default=1800)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    detected_lang: Mapped[str] = mapped_column(String(64), default="中文（简体）")
    detected_lang_code: Mapped[str] = mapped_column(String(32), default="zh-CN")
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("batch"))
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    job_type: Mapped[str] = mapped_column(String(32), nullable=False)  # inpaint | translate
    operator_id: Mapped[str] = mapped_column(String(64), nullable=False)
    operator_version: Mapped[str] = mapped_column(String(16), default="v1")
    region: Mapped[str] = mapped_column(String(32), default="cn-beijing")
    status: Mapped[str] = mapped_column(String(32), default="RUNNING")
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    execution_mode: Mapped[str] = mapped_column(String(16), default="mock")
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    estimated_bill_min: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_cost: Mapped[float] = mapped_column(Float, default=0.0)
    accrued_bill_min: Mapped[float] = mapped_column(Float, default=0.0)
    accrued_cost: Mapped[float] = mapped_column(Float, default=0.0)
    unit_price: Mapped[float] = mapped_column(Float, default=3.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tasks: Mapped[list["OperatorTask"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan", order_by="OperatorTask.sort_order"
    )
    logs: Mapped[list["TaskLog"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan", order_by="TaskLog.id"
    )


class OperatorTask(Base):
    __tablename__ = "operator_tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("task"))
    batch_id: Mapped[str] = mapped_column(ForeignKey("batch_jobs.id", ondelete="CASCADE"), index=True)
    asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id", ondelete="SET NULL"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_meta: Mapped[str] = mapped_column(String(255), default="")
    thumbnail_url: Mapped[str] = mapped_column(String(512), default="/media/sample/frame_16x9.png")
    job_type: Mapped[str] = mapped_column(String(32), nullable=False)  # inpaint | translate
    operator_id: Mapped[str] = mapped_column(String(64), nullable=False)
    operator_version: Mapped[str] = mapped_column(String(16), default="v1")

    scheme_label: Mapped[str] = mapped_column(String(128), default="")
    sub_scheme_label: Mapped[str] = mapped_column(String(255), default="")

    # Status: PENDING | RUNNING | COMPLETED | FAILED | TIMEOUT | CANCELLED
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    eta_label: Mapped[str] = mapped_column(String(64), default="等待调度")

    remote_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    execution_mode: Mapped[str] = mapped_column(String(16), default="mock")
    request_payload_json: Mapped[str] = mapped_column(Text, default="{}")
    result_json: Mapped[str] = mapped_column(Text, default="{}")

    input_video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    output_video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    inpainted_video_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    repaired_video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    subtitle_bbox: Mapped[str | None] = mapped_column(String(128), nullable=True)
    output_resolution: Mapped[str | None] = mapped_column(String(32), nullable=True)
    output_fps: Mapped[float | None] = mapped_column(Float, nullable=True)

    estimated_bill_min: Mapped[float] = mapped_column(Float, default=0.0)
    bill_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    unit_price: Mapped[float] = mapped_column(Float, default=3.0)
    cost_cny: Mapped[float] = mapped_column(Float, default=0.0)

    business_code: Mapped[str] = mapped_column(String(64), default="0")
    error_msg: Mapped[str] = mapped_column(Text, default="")
    is_seed: Mapped[bool] = mapped_column(Boolean, default=False)

    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    batch: Mapped["BatchJob"] = relationship(back_populates="tasks")


class TaskLog(Base):
    __tablename__ = "task_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("batch_jobs.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    timestamp_str: Mapped[str] = mapped_column(String(16), nullable=False)
    tag: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    tone: Mapped[str] = mapped_column(String(16), default="normal")  # dim | normal | mint | amber | faint | red
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    batch: Mapped["BatchJob"] = relationship(back_populates="logs")


class RegionTemplate(Base):
    __tablename__ = "region_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("tpl"))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    regions_json: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SubtitleStylePreset(Base):
    __tablename__ = "subtitle_style_presets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default="default")
    name: Mapped[str] = mapped_column(String(128), default="默认烧录样式")
    config_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class BillingRecord(Base):
    __tablename__ = "billing_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("bill"))
    batch_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    task_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    billed_at_str: Mapped[str] = mapped_column(String(32), nullable=False)
    batch_label: Mapped[str] = mapped_column(String(255), nullable=False)
    operator_label: Mapped[str] = mapped_column(String(128), nullable=False)
    job_type: Mapped[str] = mapped_column(String(32), default="inpaint")
    unit_price_str: Mapped[str] = mapped_column(String(32), nullable=False)
    bill_minutes: Mapped[float] = mapped_column(Float, nullable=False)
    cost_cny: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
