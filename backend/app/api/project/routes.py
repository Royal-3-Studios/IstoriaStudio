from sqlalchemy.orm import selectinload, joinedload
from app.db.models import Tag
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from app.enums.project_status import ProjectStatus
from app.db.models import Project
from app.db.session import get_db
from app.db.models import Tag
from app.db.models import GeneratedAsset
from pydantic import Field
from typing import Optional, List
from uuid import UUID
import enum
from app.db.models.user import User
from datetime import datetime
from app.deps.auth import get_current_user
from app.api.generated_asset.routes import GeneratedAssetRead
from app.db.models.base import OrmBaseModel
from app.api.generated_asset.routes import GeneratedAssetLite

router = APIRouter()


@router.get("/secure", response_model=dict)
async def secured_route(user=Depends(get_current_user)):
    return {"message": f"Hello, {user.username}!"}


class ProjectCreate(OrmBaseModel):
    id: Optional[UUID] = None
    title: str
    type: str
    status: ProjectStatus = Field(default=ProjectStatus.PENDING)
    description: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[UUID] = None
    is_active: bool = True
    tags: Optional[List[UUID]] = None


class ProjectUpdate(OrmBaseModel):
    id: Optional[UUID] = None
    title: Optional[str] = None
    type: Optional[str] = None
    status: Optional[ProjectStatus] = None
    description: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    tags: Optional[List[UUID]] = None
    featured_asset_id: UUID | None = None


class ProjectRead(OrmBaseModel):
    id: UUID
    title: str
    type: str
    status: str
    description: Optional[str] = None
    email: Optional[str] = None
    user_id: Optional[UUID] = None
    is_active: bool
    created_at: datetime
    featured_asset_id: UUID | None = None
    featured_asset: GeneratedAssetLite | None = None
    assets: list[GeneratedAssetLite] = []
    tags: List[str] = []


@router.post("/", response_model=dict)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        project = Project(
            title=data.title,
            type=data.type,
            status=data.status.value,
            description=data.description,
            email=data.email,
            user_id=user.id,
            is_active=data.is_active,
        )

        if data.tags:
            res = await db.execute(select(Tag).where(Tag.id.in_(data.tags).options(
                selectinload(Project.tags),
                selectinload(Project.assets).selectinload(
                    GeneratedAsset.asset_type),
                joinedload(Project.featured_asset),
            )))
            project.tags = res.scalars().all()

        db.add(project)
        await db.commit()
        await db.refresh(project)
        return {"id": str(project.id), "message": "Project created"}

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error: {e}")


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(project_id: UUID, payload: ProjectUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    proj = await db.get(Project, project_id)
    if not proj or proj.user_id != user.id:
        raise HTTPException(404, "Project not found")

    if payload.featured_asset_id is not None:
        asset = await db.get(GeneratedAsset, payload.featured_asset_id)
        if not asset or asset.project_id != proj.id:
            raise HTTPException(
                400, "featured_asset_id must belong to this project")
        proj.featured_asset_id = asset.id
    elif payload.featured_asset_id is None and "featured_asset_id" in payload.dict(exclude_unset=True):
        proj.featured_asset_id = None

    if payload.title is not None:
        proj.title = payload.title
    if payload.description is not None:
        proj.description = payload.description

    await db.commit()
    await db.refresh(proj)
    return proj


@router.put("/{project_id}", response_model=dict)
async def update_project(project_id: UUID, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

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

        await db.commit()
        return {"message": "Project updated successfully"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error: {e}")


@router.delete("/{project_id}", response_model=dict)
async def delete_project(
    project_id: UUID,
    cascade: Literal["project_only",
                     "project_and_assets"] = Query("project_only"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id, Project.user_id == user.id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        if cascade == "project_and_assets":
            await db.execute(
                delete(GeneratedAsset).where(
                    GeneratedAsset.project_id == project_id)
            )
            await db.delete(project)
        else:
            await db.execute(
                update(GeneratedAsset)
                .where(GeneratedAsset.project_id == project_id)
                .values(project_id=None)
            )
            await db.delete(project)

        await db.commit()
        return {"message": "Project deleted successfully", "cascade": cascade}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error: {e}")


@router.get("/", response_model=List[ProjectRead])
async def get_all_projects(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(Project)
        .where(Project.user_id == user.id)
        .order_by(Project.created_at.desc())
        .options(
            selectinload(Project.tags),
            selectinload(Project.assets).selectinload(
                GeneratedAsset.asset_type),
            joinedload(Project.featured_asset)
        )
    )
    return result.scalars().all()


@router.get("/{project_id}", response_model=List[GeneratedAssetRead])
async def get_assets_for_project(project_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GeneratedAsset).where(GeneratedAsset.project_id == project_id)
    )
    return result.scalars().all()


@router.get("/statuses", response_model=List[str])
async def get_project_statuses():
    return [status.value for status in ProjectStatus]
