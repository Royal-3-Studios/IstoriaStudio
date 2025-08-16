# scripts/seed_free_plan.py
import asyncio
from sqlalchemy import select
from app.db.session import async_session
from app.db.models.plan import Plan


async def main():
    async with async_session() as db:
        existing = (await db.execute(select(Plan).where(Plan.name == "Free"))).scalar_one_or_none()
        if not existing:
            free = Plan(
                name="Free",
                description="Free tier",
                stripe_price_id="price_free",      # placeholder
                monthly_price_cents=0,
                max_generations_per_month=50,
                priority_gpu=False,
                is_active=True,
            )
            db.add(free)
            await db.commit()
            print("Seeded Free plan")
        else:
            print("Free plan already exists")

asyncio.run(main())
