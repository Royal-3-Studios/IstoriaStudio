from app.db.session import Base  # Assuming your Base is defined in session.py
import asyncio
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from alembic import context
from app.db import models
from dotenv import load_dotenv
import os

# Load .env and config
load_dotenv()
config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

# Import your metadata

target_metadata = Base.metadata


def run_migrations_offline():
    url = os.getenv("ALEMBIC_DATABASE_URL")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    url = os.getenv("ALEMBIC_DATABASE_URL")
    connectable = create_async_engine(url, poolclass=NullPool)

    async with connectable.connect() as connection:
        # Use run_sync to ensure sync compatibility
        def do_migrations(sync_connection):
            context.configure(
                connection=sync_connection,
                target_metadata=target_metadata,
                compare_type=True,
            )
            with context.begin_transaction():
                context.run_migrations()

        await connection.run_sync(do_migrations)

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
