from sqlalchemy import String, Boolean, DateTime, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from datetime import datetime, timezone
from uuid import uuid4
from decimal import Decimal
from typing import Optional

from app.db.session import Base


class Purchase(Base):
    __tablename__ = "purchase"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String, index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String, default="usd")
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    status: Mapped[Optional[str]] = mapped_column(String, default="completed")
    stripe_payment_intent_id: Mapped[Optional[str]
                                     ] = mapped_column(String, nullable=True)

    user_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("user.id"), nullable=True)
    user: Mapped["User"] = relationship("User", back_populates="purchases")
