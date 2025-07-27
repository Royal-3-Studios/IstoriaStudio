from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator
import os

# Use environment variable in production
DATABASE_URL = os.getenv("ALEMBIC_DATABASE_URL",
                         "postgresql+asyncpg://istoria:istoriapass@db:5432/istoriadb")

engine = create_async_engine(DATABASE_URL, echo=True)

async_session = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
