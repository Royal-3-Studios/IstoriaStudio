from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import PromptLog
from app.db.session import get_db
from app.db.models.base import OrmBaseModel
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()


class PromptLogCreate(OrmBaseModel):
    id: Optional[UUID] = None
    prompt_input: dict
    prompt_output: str
    email: Optional[str] = None
    project_id: Optional[UUID] = None
    prompt_type_id: Optional[UUID] = None


@router.post("/", response_model=dict)
async def create_prompt_log(data: PromptLogCreate, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            new_prompt = PromptLog(**data.model_dump())
            db.add(new_prompt)
        return {"message": "Prompt log created"}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Unexpected error during registration: {e}")


@router.get("/", response_model=List[PromptLogCreate])
async def list_prompt_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PromptLog))
    return result.scalars().all()
