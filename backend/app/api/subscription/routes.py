from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Optional
from uuid import UUID
from datetime import datetime, timezone

from app.db.models.subscription import Subscription
from app.db.session import get_db
from app.db.models.base import OrmBaseModel

router = APIRouter()


class SubscriptionCreate(OrmBaseModel):
    plan_id: UUID
    user_id: UUID
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None


class SubscriptionUpdate(OrmBaseModel):
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    active: Optional[bool] = None


class SubscriptionResponse(SubscriptionCreate):
    id: UUID
    active: bool
    created_at: datetime


# ✅ Create
@router.post("/", response_model=dict)
async def create_subscription(data: SubscriptionCreate, db: AsyncSession = Depends(get_db)):
    try:
        new_sub = Subscription(**data.model_dump())
        db.add(new_sub)
        await db.commit()
        return {"message": "Subscription created"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


# ✅ Get all
@router.get("/", response_model=List[SubscriptionResponse])
async def get_all_subscriptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription))
    return result.scalars().all()


# ✅ Get by ID
@router.get("/{subscription_id}", response_model=SubscriptionResponse)
async def get_subscription(subscription_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


# ✅ Update
@router.put("/{subscription_id}", response_model=SubscriptionResponse)
async def update_subscription(subscription_id: UUID, data: SubscriptionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(sub, key, value)

    await db.commit()
    await db.refresh(sub)
    return sub


# ✅ Delete
@router.delete("/{subscription_id}", response_model=dict)
async def delete_subscription(subscription_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    await db.delete(sub)
    await db.commit()
    return {"message": "Subscription deleted"}


# 🔁 Optional: Deactivate
@router.post("/{subscription_id}/deactivate", response_model=dict)
async def deactivate_subscription(subscription_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    sub.active = False
    await db.commit()
    return {"message": "Subscription deactivated"}


# 🔁 Optional: Reactivate
@router.post("/{subscription_id}/reactivate", response_model=dict)
async def reactivate_subscription(subscription_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    sub.active = True
    await db.commit()
    return {"message": "Subscription reactivated"}


# 🔍 Optional: Get only active
@router.get("/active/all", response_model=List[SubscriptionResponse])
async def get_active_subscriptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.active == True))
    return result.scalars().all()
