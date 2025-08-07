from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped, relationship
from datetime import datetime, timezone
from uuid import uuid4
from app.db.session import Base
from typing import Optional


class Subscription(Base):
    __tablename__ = "subscription"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)

    user_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("user.id"), nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="subscription")

    plan_id: Mapped[UUID] = mapped_column(
        UUID, ForeignKey("plan.id"), nullable=False)
    plan: Mapped["Plan"] = relationship("Plan", back_populates="subscriptions")

    stripe_customer_id: Mapped[Optional[str]
                               ] = mapped_column(String, nullable=True)
    stripe_subscription_id: Mapped[Optional[str]
                                   ] = mapped_column(String, nullable=True)

    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    ends_at: Mapped[Optional[DateTime]] = mapped_column(
        DateTime(timezone=True), nullable=True)
