from sqlalchemy import String, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from datetime import datetime, timezone
from uuid import uuid4
from app.db.session import Base
from typing import Optional


class GeneratedAsset(Base):
    __tablename__ = "generated_asset"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    url: Mapped[str] = mapped_column(String)
    is_archived: bool = False
    format: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)  # e.g. png, mp4
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=True)
    resolution: Mapped[str] = mapped_column(String)
    version: int = 1
    revision_of_id: Optional[UUID] = ForeignKey("generated_asset.id")
    file_size: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True)  # in bytes
    style_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    text_overlays: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    project_id: Mapped[UUID] = mapped_column(UUID, ForeignKey("project.id"))
    asset_type_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("asset_type.id"))
    user_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("user.id"), nullable=True)
    user: Mapped["User"] = relationship("User")

    project: Mapped["Project"] = relationship(
        "Project", back_populates="assets")
    asset_type: Mapped["AssetType"] = relationship(
        "AssetType", back_populates="assets")
    template_id: Mapped[Optional[UUID]] = mapped_column(
        UUID, ForeignKey("template.id"), nullable=True)
    template: Mapped[Optional["Template"]] = relationship("Template")
