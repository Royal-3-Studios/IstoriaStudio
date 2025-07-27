from sqlalchemy.orm import mapped_column, Mapped
import enum
from sqlalchemy import Enum


class PromptStatus(enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    ARCHIVED = "archived"


status: Mapped[PromptStatus] = mapped_column(
    Enum(PromptStatus), default=PromptStatus.PENDING)
