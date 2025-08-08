from app.db.models.user import User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# services/users.py (or wherever)


async def get_or_create_user(db: AsyncSession, kc: dict) -> User:
    sub = kc["sub"]
    res = await db.execute(select(User).where(User.keycloak_id == sub))
    user = res.scalar_one_or_none()
    if user:
        return user

    user = User(
        keycloak_id=sub,
        email=kc.get("email"),
        username=kc.get("preferred_username"),
        first_name=kc.get("given_name"),
        last_name=kc.get("family_name"),
    )
    db.add(user)
    await db.flush()        # ✅ no commit here
    await db.refresh(user)  # ensure .id is populated
    return user
