from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import select, delete
from uuid import UUID
from typing import Optional, List
from app.db.models import Template
from app.db.session import get_db
from app.db.models.base import OrmBaseModel

router = APIRouter()


class TemplateCreate(OrmBaseModel):
    name: str
    example_overlay: Optional[str] = None
    style_json: Optional[str] = None
    default_prompt: Optional[str] = None


class TemplateUpdate(OrmBaseModel):
    name: Optional[str]
    example_overlay: Optional[str]
    style_json: Optional[str]
    default_prompt: Optional[str]


class TemplateResponse(TemplateCreate):
    id: UUID


@router.post("/", response_model=dict)
async def create_template(data: TemplateCreate, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            new_template = Template(**data.model_dump())
            db.add(new_template)
        return {"message": "Template created"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/", response_model=List[TemplateResponse])
async def get_all_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Template))
    return result.scalars().all()


@router.delete("/{template_id}", response_model=dict)
async def delete_template(template_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Template).where(Template.id == template_id))
        template = result.scalar_one_or_none()
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        await db.delete(template)
        await db.commit()
        return {"message": "Template deleted"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template_by_id(template_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(template_id: UUID, data: TemplateUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(template, key, value)

    await db.commit()
    await db.refresh(template)
    return template
