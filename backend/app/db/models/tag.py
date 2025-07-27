from sqlalchemy import String, Table, Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, mapped_column, Mapped
from uuid import uuid4
from typing import List

from app.db.session import Base

project_tag_link = Table(
    "project_tag_link",
    Base.metadata,
    Column("project_id", UUID, ForeignKey("project.id")),
    Column("tag_id", UUID, ForeignKey("tag.id"))
)


class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String, unique=True)

    # // MANY TO MANY //
    projects: Mapped[List["Project"]] = relationship(
        "Project", secondary=project_tag_link, back_populates="tags"
    )
