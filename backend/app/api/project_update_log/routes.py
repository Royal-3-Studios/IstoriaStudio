from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import select

from app.db.models import ProjectUpdateLog
from app.db.session import get_db
from app.db.models.base import OrmBaseModel
from typing import Optional, List
from uuid import UUID

router = APIRouter()


class UpdateLogCreate(OrmBaseModel):
    id: Optional[UUID] = None
    project_id: UUID
    change_summary: str
    updated_by_email: Optional[str] = None


@router.post("/", response_model=dict)
async def create_update_log(data: UpdateLogCreate, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            log = ProjectUpdateLog(**data.model_dump())
            db.add(log)
        return {"message": "Update log created"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/", response_model=List[UpdateLogCreate])
async def get_all_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectUpdateLog))
    return result.scalars().all()
