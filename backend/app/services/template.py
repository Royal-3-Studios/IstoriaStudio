from sqlalchemy import select, func
from app.db.models.generated_asset import GeneratedAsset
from sqlalchemy.ext.asyncio import AsyncSession


async def get_top_templates(session: AsyncSession, limit: int = 10):
    stmt = (
        select(GeneratedAsset.template_id, func.count().label("usage_count"))
        .group_by(GeneratedAsset.template_id)
        .order_by(func.count().desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return result.fetchall()
