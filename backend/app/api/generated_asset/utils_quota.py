# utils_quota.py (or place at top of your generated_asset routes module)

from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import GeneratedAsset
from app.db.models.plan import Plan
from app.db.models.subscription import Subscription


async def get_active_plan_limit(db: AsyncSession, user_id: UUID) -> int | None:
    """
    Returns the user's monthly generation limit from their ACTIVE subscription's plan,
    or None if the user has no active subscription/plan.
    """
    stmt = (
        select(Plan.max_generations_per_month)
        .join(Subscription, Subscription.plan_id == Plan.id)
        .where(Subscription.user_id == user_id)
        .where(Subscription.active.is_(True))
        .limit(1)
    )
    res = await db.execute(stmt)
    limit = res.scalar_one_or_none()
    return int(limit) if limit is not None else None


async def get_user_month_count(db: AsyncSession, user_id: UUID) -> int:
    """
    Count GeneratedAsset rows for the user created since the beginning of the current month (UTC).
    """
    month_start = datetime.now(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(func.count())
        .select_from(GeneratedAsset)
        .where(
            and_(
                GeneratedAsset.user_id == user_id,
                GeneratedAsset.created_at >= month_start,
            )
        )
    )
    res = await db.execute(stmt)
    return int(res.scalar_one())


async def enforce_monthly_quota(db: AsyncSession, user_id: UUID) -> None:
    """
    - If the user has no active subscription/plan -> 403
    - If they reached their monthly limit -> 403
    - Otherwise returns None (OK to proceed)
    """
    limit = await get_active_plan_limit(db, user_id)
    if limit is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403, detail="No active subscription or plan found.")

    used = await get_user_month_count(db, user_id)
    if used >= limit:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403, detail="Generation limit reached for your plan.")
