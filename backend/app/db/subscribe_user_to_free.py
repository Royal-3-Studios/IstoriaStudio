# scripts/subscribe_user_to_free.py
import asyncio
from sqlalchemy import select
from app.db.session import async_session
from app.db.models.user import User
from app.db.models.plan import Plan
from app.db.models.subscription import Subscription

USER_EMAIL = "theelina111@gmail.com"


async def main():
    async with async_session() as db:
        user = (await db.execute(select(User).where(User.email == USER_EMAIL))).scalar_one()
        plan = (await db.execute(select(Plan).where(Plan.name == "Free", Plan.is_active == True))).scalar_one()
        # check if already subscribed & active
        existing = (await db.execute(
            select(Subscription).where(Subscription.user_id ==
                                       user.id, Subscription.active.is_(True))
        )).scalar_one_or_none()
        if existing:
            print("User already has an active subscription")
            return
        sub = Subscription(user_id=user.id, plan_id=plan.id, active=True)
        db.add(sub)
        await db.commit()
        print("User subscribed to Free")

asyncio.run(main())
