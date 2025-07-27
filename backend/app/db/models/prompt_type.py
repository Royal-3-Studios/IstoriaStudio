from sqlalchemy import DateTime, String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped, relationship
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional, List
from app.db.session import Base


class PromptType(Base):
    __tablename__ = "prompt_type"

    id: Mapped[UUID] = mapped_column(
        UUID, primary_key=True, default=uuid4, index=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[Optional[str]] = mapped_column(String)
    icon_url: Mapped[Optional[str]] = mapped_column(String)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    prompts: Mapped[List["PromptLog"]] = relationship(
        "PromptLog", back_populates="prompt_type")
