from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import select
from uuid import UUID
from typing import Optional
from app.db.models import Tag
from app.db.session import get_db
from pydantic import BaseModel
from typing import List

router = APIRouter()


class TagCreate(BaseModel):
    id: Optional[UUID] = None
    name: str


@router.post("/", response_model=dict)
async def create_tag(data: TagCreate, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            new_tag = Tag(**data.model_dump())
            db.add(new_tag)
        return {"message": "Tag created"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/", response_model=List[TagCreate])
async def get_all_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag))
    return result.scalars().all()
