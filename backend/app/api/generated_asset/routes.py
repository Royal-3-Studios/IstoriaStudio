from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from typing import Optional, List, Dict
from pydantic import HttpUrl
from app.db.models import GeneratedAsset
from app.db.session import get_db
from app.db.models.plan import Plan
from app.db.models.subscription import Subscription
from app.db.models import GeneratedAsset
from datetime import datetime
from app.db.models.base import OrmBaseModel
from app.api.asset_type.routes import AssetTypeRead
router = APIRouter()


class GeneratedAssetCreate(OrmBaseModel):
    id: Optional[UUID] = None
    asset_type_id: UUID
    url: str
    name: Optional[str] = None
    resolution: str
    format: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_size: Optional[int] = None
    project_id: UUID


class GeneratedAssetUpdate(OrmBaseModel):
    id: Optional[UUID] = None
    asset_type_id: Optional[UUID] = None
    url: Optional[str] = None
    name: Optional[str] = None
    resolution: Optional[str] = None
    format: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_size: Optional[int] = None


class AssetUpdateRequest(OrmBaseModel):
    name: Optional[str]
    style_json: Optional[Dict]
    text_overlays: Optional[List[Dict]]


class GeneratedAssetRead(OrmBaseModel):
    id: UUID
    url: HttpUrl
    name: Optional[str]
    resolution: str
    format: Optional[str]
    thumbnail_url: Optional[HttpUrl]
    is_archived: Optional[bool]
    file_size: Optional[int]
    created_at: datetime
    project_id: UUID
    asset_type_id: UUID
    template_id: Optional[UUID]
    style_json: Optional[Dict]
    text_overlays: Optional[List[Dict]]


class GeneratedAssetLite(OrmBaseModel):
    id: UUID
    url: str | None = None
    thumbnail_url: str | None = None
    asset_type: AssetTypeRead | None = None


class GeneratedAssetReturn(GeneratedAssetCreate):
    id: UUID


# @router.post("/", response_model=dict)
# async def create_asset(data: GeneratedAssetCreate, db: AsyncSession = Depends(get_db)):
#     try:
#         async with db.begin():
#             new_asset = GeneratedAsset(**data.model_dump())
#             db.add(new_asset)
#             return {"message": "Generated asset created", "id": str(new_asset.id)}
#     except SQLAlchemyError as e:
#         raise HTTPException(status_code=500, detail=f"Database error: {e}")
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")
@router.post("/", response_model=dict)
async def create_asset(data: GeneratedAssetCreate, db: AsyncSession = Depends(get_db)):
    try:
        # Get the user ID from the request data
        user_id = data.user_id

        # Step 1: Fetch current generation count for this user
        asset_count_stmt = select(func.count()).select_from(
            GeneratedAsset).where(GeneratedAsset.user_id == user_id)
        result = await db.execute(asset_count_stmt)
        asset_count = result.scalar_one()

        # Step 2: Fetch user -> subscription -> plan
        sub_stmt = (
            select(Plan.generation_limit)
            .join(Subscription, Plan.id == Subscription.plan_id)
            .where(Subscription.user_id == user_id)
            .where(Subscription.active.is_(True))
        )
        result = await db.execute(sub_stmt)
        limit = result.scalar_one_or_none()

        if limit is None:
            raise HTTPException(
                status_code=403, detail="No active subscription or plan found.")

        # Step 3: Compare asset count to plan limit
        if asset_count >= limit:
            raise HTTPException(
                status_code=403, detail="Generation limit reached for your plan.")

        # Step 4: Proceed with creation
        async with db.begin():
            new_asset = GeneratedAsset(**data.model_dump())
            db.add(new_asset)
            return {"message": "Generated asset created", "id": str(new_asset.id)}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


@router.get("/", response_model=List[GeneratedAssetCreate])
async def list_assets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GeneratedAsset))
    return result.scalars().all()


@router.get("/{asset_id}", response_model=GeneratedAssetRead)
async def get_asset(asset_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GeneratedAsset).where(GeneratedAsset.id == asset_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


# @router.put("/{asset_id}", response_model=dict)
# async def update_asset(asset_id: UUID, data: GeneratedAssetUpdate, db: AsyncSession = Depends(get_db)):
#     try:
#         async with db.begin():
#             result = await db.execute(select(GeneratedAsset).where(GeneratedAsset.id == asset_id))
#             asset = result.scalar_one_or_none()
#             if not asset:
#                 raise HTTPException(status_code=404, detail="Asset not found")

#             for key, value in data.model_dump(exclude_unset=True).items():
#                 setattr(asset, key, value)

#             return {"message": "Asset updated"}
#     except SQLAlchemyError as e:
#         raise HTTPException(status_code=500, detail=f"Database error: {e}")
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


@router.put("/{asset_id}", response_model=dict)
async def update_asset(
    asset_id: UUID,
    update_data: AssetUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(GeneratedAsset).where(GeneratedAsset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(asset, field, value)

    await db.commit()
    return {"message": "Asset updated"}


@router.delete("/{asset_id}", response_model=dict)
async def delete_asset(asset_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            result = await db.execute(select(GeneratedAsset).where(GeneratedAsset.id == asset_id))
            asset = result.scalar_one_or_none()
            if not asset:
                raise HTTPException(status_code=404, detail="Asset not found")

            await db.delete(asset)
            return {"message": "Asset deleted"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")
