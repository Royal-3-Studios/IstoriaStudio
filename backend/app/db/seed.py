import asyncio
from app.db.session import get_db
from app.db.models import User
from app.core.security import hash_password


async def seed():
    async for session in get_db():
        user = User(
            email="test",
            hashed_password=hash_password("1324")
        )
        session.add(user)
        await session.commit()

if __name__ == "__main__":
    asyncio.run(seed())
