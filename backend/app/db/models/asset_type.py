from sqlalchemy import String, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import mapped_column, Mapped, relationship
from uuid import uuid4
from app.db.session import Base
from typing import Optional, List


class AssetType(Base):
    __tablename__ = "asset_type"
    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    icon_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    assets: Mapped[List["GeneratedAsset"]] = relationship(
        "GeneratedAsset", back_populates="asset_type")
