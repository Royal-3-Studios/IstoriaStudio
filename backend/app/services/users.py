from app.db.models.user import User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError


async def get_or_create_user(db: AsyncSession, kc: dict) -> User:
    sub = kc["sub"]
    res = await db.execute(select(User).where(User.keycloak_id == sub))
    user = res.scalar_one_or_none()

    email = kc.get("email")
    username = kc.get("preferred_username")
    first_name = kc.get("given_name")
    last_name = kc.get("family_name")

    if user:
        changed = False
        if user.email != email:
            user.email = email
            changed = True
        if user.username != username:
            user.username = username
            changed = True
        if user.first_name != first_name:
            user.first_name = first_name
            changed = True
        if user.last_name != last_name:
            user.last_name = last_name
            changed = True

        if changed:
            await db.commit()
            await db.refresh(user)
        return user

    # create
    user = User(
        keycloak_id=sub,
        email=email,
        username=username,
        first_name=first_name,
        last_name=last_name,
    )
    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
        return user
    except IntegrityError:
        # Race: another request created the user after our select
        await db.rollback()
        res = await db.execute(select(User).where(User.keycloak_id == sub))
        return res.scalar_one()
