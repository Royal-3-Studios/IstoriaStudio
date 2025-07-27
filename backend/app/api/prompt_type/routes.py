from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import PromptType
from app.db.session import get_db
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()


class PromptTypeCreate(BaseModel):
    id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    icon_url: Optional[str] = None
    is_active: Optional[bool] = True


@router.post("/", response_model=dict)
async def create_prompt_type(data: PromptTypeCreate, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            new_type = PromptType(**data.model_dump())
            db.add(new_type)

            return {"message": "Prompt type created", "id: ": str(new_type.id)}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Unexpected error during registration: {e}")


@router.get("/", response_model=List[PromptTypeCreate])
async def list_prompt_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PromptType))
    return result.scalars().all()
