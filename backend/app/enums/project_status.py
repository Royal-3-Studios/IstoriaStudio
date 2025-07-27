from sqlalchemy.orm import mapped_column, Mapped
import enum
from sqlalchemy import Enum


class ProjectStatus(enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ARCHIVED = "archived"
    CANCELED = "canceled"
    FAILED = "failed"
    DRAFT = "draft"
    REVIEW = "review"


status: Mapped[ProjectStatus] = mapped_column(
    Enum(ProjectStatus), default=ProjectStatus.PENDING)
