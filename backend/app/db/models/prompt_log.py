from sqlalchemy import DateTime, Text, JSON, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional

from app.db.session import Base


class PromptLog(Base):
    __tablename__ = "prompt_log"

    id: Mapped[UUID] = mapped_column(
        UUID, primary_key=True, default=uuid4, index=True)
    prompt_input: Mapped[dict] = mapped_column(JSON)
    prompt_output: Mapped[str] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(
        String, index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("project.id"), nullable=True)
    prompt_type_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("prompt_type.id"), nullable=True)

    project: Mapped["Project"] = relationship(
        "Project", back_populates="prompt_logs")
    prompt_type: Mapped["PromptType"] = relationship(
        "PromptType", back_populates="prompts")
