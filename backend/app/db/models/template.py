from sqlalchemy import String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional
from app.db.session import Base


class Template(Base):
    __tablename__ = "template"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)

    name: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    asset_type_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("asset_type.id"))
    asset_type: Mapped["AssetType"] = relationship(
        "AssetType", back_populates="templates")

    user_id: Mapped[Optional[UUID]] = mapped_column(UUID, ForeignKey(
        "user.id"), nullable=True)  # Null for system-wide templates
    user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="templates")

    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    preview_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)  # Optional preview image

    default_prompt: Mapped[Optional[str]
                           ] = mapped_column(String, nullable=True)
    style_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    example_overlay: Mapped[Optional[str]
                            ] = mapped_column(String, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
