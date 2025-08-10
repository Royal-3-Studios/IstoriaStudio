from sqlalchemy import String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from datetime import datetime, timezone
from uuid import uuid4
from typing import List, Optional
from app.db.session import Base
from .tag import project_tag_link


class Project(Base):
    __tablename__ = "project"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    is_archived: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False)
    title: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="draft")
    description: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    featured_asset_id: Mapped[Optional[UUID]] = mapped_column(
        UUID, ForeignKey("generated_asset.id"), nullable=True, index=True
    )

    # FKs
    user_id: Mapped[Optional[UUID]] = mapped_column(
        UUID, ForeignKey("user.id"), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="projects")

    # ⬇️ Disambiguate: this relationship is driven by GeneratedAsset.project_id
    assets: Mapped[List["GeneratedAsset"]] = relationship(
        "GeneratedAsset",
        back_populates="project",
        foreign_keys="GeneratedAsset.project_id",
    )

    update_logs: Mapped[List["ProjectUpdateLog"]] = relationship(
        "ProjectUpdateLog", back_populates="project")
    prompt_logs: Mapped[List["PromptLog"]] = relationship(
        "PromptLog", back_populates="project")

    # The single “cover”
    featured_asset: Mapped[Optional["GeneratedAsset"]] = relationship(
        "GeneratedAsset",
        foreign_keys=[featured_asset_id],
        lazy="joined",
        uselist=False,
    )

    # M2M
    tags: Mapped[List["Tag"]] = relationship(
        "Tag", secondary=project_tag_link, back_populates="projects"
    )
