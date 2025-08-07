from sqlalchemy import String, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from uuid import uuid4
from app.db.session import Base
from typing import List


class Plan(Base):
    __tablename__ = "plan"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(
        String, unique=True)  # e.g. "Free", "Pro"
    description: Mapped[str] = mapped_column(String, default="")
    stripe_price_id: Mapped[str] = mapped_column(
        String, unique=True)  # maps to Stripe's price ID
    monthly_price_cents: Mapped[int] = mapped_column(
        Integer)  # store prices in cents for accuracy
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Optional: max generations per month, storage, features, etc.
    max_generations_per_month: Mapped[int] = mapped_column(Integer, default=50)
    priority_gpu: Mapped[bool] = mapped_column(Boolean, default=False)

    subscriptions: Mapped[List["Subscription"]] = relationship(
        "Subscription", back_populates="plan")
