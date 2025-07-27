from sqlalchemy.orm import selectinload
from app.db.models import Tag  # Import Tag model
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import select
from app.enums.project_status import ProjectStatus
from app.db.models import Project
from app.db.session import get_db
from app.db.models import Tag
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
import enum
from datetime import datetime

router = APIRouter()


class ProjectCreate(BaseModel):
    id: Optional[UUID] = None
    title: str
    type: str
    status: ProjectStatus = Field(default=ProjectStatus.PENDING)
    description: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[UUID] = None
    is_active: bool = True
    tags: Optional[List[UUID]] = None


class ProjectUpdate(BaseModel):
    id: Optional[UUID] = None
    title: Optional[str] = None
    type: Optional[str] = None
    status: Optional[ProjectStatus] = None
    description: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    tags: Optional[List[UUID]] = None


class ProjectRead(BaseModel):
    id: UUID
    title: str
    type: str
    status: str
    description: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[UUID] = None
    is_active: bool
    created_at: datetime
    # Or use a nested TagRead model if you want full objects
    tags: List[str] = []

    class Config:
        orm_mode = True


@router.post("/", response_model=dict)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            project = Project(
                title=data.title,
                type=data.type,
                status=data.status.value,
                description=data.description,
                email=data.email,
                user_id=data.user_id,
                is_active=data.is_active
            )

            if data.tags:
                result = await db.execute(select(Tag).where(Tag.id.in_(data.tags)))
                project.tags = result.scalars().all()

            db.add(project)

        return {"message": "Project created"}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")


@router.put("/{project_id}", response_model=dict)
async def update_project(
    project_id: UUID,
    data: ProjectUpdate,  # has Optional[List[UUID]] for tags
    db: AsyncSession = Depends(get_db)
):
    try:
        async with db.begin():
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            if not project:
                raise HTTPException(
                    status_code=404, detail="Project not found")

            updates = data.model_dump(exclude_unset=True)

            if "tags" in updates:
                tag_ids = updates.pop("tags")
                if tag_ids:
                    tag_result = await db.execute(select(Tag).where(Tag.id.in_(tag_ids)))
                    project.tags = tag_result.scalars().all()
                else:
                    project.tags = []

            for field, value in updates.items():
                if isinstance(value, enum.Enum):
                    value = value.value
                setattr(project, field, value)

        return {"message": "Project updated successfully"}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")


@router.delete("/{project_id}", response_model=dict)
async def delete_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    try:
        async with db.begin():
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            if not project:
                raise HTTPException(
                    status_code=404, detail="Project not found")

            await db.delete(project)

        return {"message": "Project deleted successfully"}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {e}")


@router.get("/", response_model=List[ProjectRead])
async def get_all_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).options(selectinload(Project.tags))
    )
    return result.scalars().all()


@router.get("/statuses", response_model=List[str])
async def get_project_statuses():
    return [status.value for status in ProjectStatus]
