from sqlalchemy import String, DateTime, Boolean
from typing import List
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from datetime import datetime, timezone
from uuid import uuid4
from typing import Optional

from app.db.session import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(
        String, unique=True, index=True, nullable=False)
    stripe_customer_id: Mapped[str] = mapped_column(String, nullable=True)
    business_name: Mapped[str] = mapped_column(String, nullable=True)
    first_name: Mapped[str] = mapped_column(String, nullable=True)
    last_name: Mapped[str] = mapped_column(String, nullable=True)
    phone: Mapped[str] = mapped_column(String, nullable=True)
    username: Mapped[str] = mapped_column(String, nullable=True)
    is_business: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=True)
    keycloak_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    subscription: Mapped[Optional["Subscription"]] = relationship(
        "Subscription", back_populates="user", uselist=False
    )
    projects: Mapped[List["Project"]] = relationship(
        "Project", back_populates="user")
    purchases: Mapped[List["Purchase"]] = relationship(
        "Purchase", back_populates="user")
    templates: Mapped[list["Template"]] = relationship(
        "Template", back_populates="user")
