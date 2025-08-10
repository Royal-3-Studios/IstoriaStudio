from sqlalchemy import String, DateTime, ForeignKey, Integer, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped, foreign
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional
from app.db.session import Base


class GeneratedAsset(Base):
    __tablename__ = "generated_asset"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    url: Mapped[str] = mapped_column(String)
    is_archived: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False)
    format: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    resolution: Mapped[str] = mapped_column(String)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    revision_of_id: Mapped[Optional[UUID]] = mapped_column(
        UUID, ForeignKey("generated_asset.id"), nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    style_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    text_overlays: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # FKs
    project_id: Mapped[UUID] = mapped_column(UUID, ForeignKey(
        "project.id", ondelete="SET NULL"), nullable=True)
    asset_type_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("asset_type.id"))
    user_id: Mapped[Optional[UUID]] = mapped_column(
        UUID, ForeignKey("user.id"), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User")

    # ⬇️ Match the parent: this uses generated_asset.project_id
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="assets",
        foreign_keys=[project_id],
    )

    asset_type: Mapped["AssetType"] = relationship(
        "AssetType", back_populates="assets")
    template_id: Mapped[Optional[UUID]] = mapped_column(
        UUID, ForeignKey("template.id"), nullable=True)
    template: Mapped[Optional["Template"]] = relationship("Template")
