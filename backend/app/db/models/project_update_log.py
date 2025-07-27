from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional

from app.db.session import Base


class ProjectUpdateLog(Base):
    __tablename__ = "project_update_log"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(UUID, ForeignKey("project.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_by_email: Mapped[Optional[str]] = mapped_column(String)
    change_summary: Mapped[Optional[str]] = mapped_column(String)

    project: Mapped["Project"] = relationship(
        "Project", back_populates="update_logs")
