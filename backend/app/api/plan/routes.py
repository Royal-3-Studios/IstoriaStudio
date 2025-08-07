from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from typing import List

from app.db.models.plan import Plan
from app.db.session import get_db
from app.db.models.base import OrmBaseModel


router = APIRouter()


class PlanCreate(OrmBaseModel):
    name: str
    description: str
    monthly_price_cents: int
    yearly_price_cents: int
    max_generations_per_month: int


class PlanUpdate(OrmBaseModel):
    description: str | None = None
    monthly_price_cents: int | None = None
    yearly_price_cents: int | None = None
    max_generations_per_month: int | None = None


class PlanResponse(PlanCreate):
    id: UUID


# ✅ Create
@router.post("/", response_model=PlanResponse)
async def create_plan(data: PlanCreate, db: AsyncSession = Depends(get_db)):
    try:
        new_plan = Plan(**data.model_dump())
        db.add(new_plan)
        await db.commit()
        await db.refresh(new_plan)
        return new_plan
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ✅ Read all
@router.get("/", response_model=List[PlanResponse])
async def get_all_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Plan))
    return result.scalars().all()


# ✅ Read one
@router.get("/{plan_id}", response_model=PlanResponse)
async def get_plan(plan_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


# ✅ Update
@router.put("/{plan_id}", response_model=PlanResponse)
async def update_plan(plan_id: UUID, data: PlanUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(plan, key, value)

    await db.commit()
    await db.refresh(plan)
    return plan


# ✅ Delete
@router.delete("/{plan_id}", response_model=dict)
async def delete_plan(plan_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    await db.delete(plan)
    await db.commit()
    return {"message": "Plan deleted"}
