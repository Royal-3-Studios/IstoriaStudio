from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.db.models import Purchase
from app.db.session import get_db
from app.core.deps import get_current_user
from app.db.models.base import OrmBaseModel
from typing import List, Optional

router = APIRouter()


class PurchaseCreate(OrmBaseModel):
    id: Optional[UUID] = None
    email: str
    amount: float
    currency: Optional[str] = "usd"
    is_guest: Optional[bool] = True


@router.post("/", response_model=dict)
async def create_purchase(
    data: PurchaseCreate,
    db: AsyncSession = Depends(get_db),
):
    new_purchase = Purchase(
        email=data.email,
        amount=data.amount,
        currency=data.currency,
        is_guest=data.is_guest,
    )
    db.add(new_purchase)
    await db.commit()
    return {"message": "Purchase recorded"}


@router.get("/my", response_model=List[dict])
async def get_my_purchases(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    result = await db.execute(select(Purchase).where(Purchase.user_id == user.id))
    purchases = result.scalars().all()
    return [{"amount": p.amount, "email": p.email, "created_at": p.created_at} for p in purchases]
