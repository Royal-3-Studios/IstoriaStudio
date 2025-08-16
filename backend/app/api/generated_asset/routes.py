from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from typing import Optional, List, Dict
from pydantic import HttpUrl
from datetime import datetime
from app.db.session import get_db
from app.db.models import GeneratedAsset
from app.db.models.plan import Plan
from app.db.models.subscription import Subscription
from app.db.models.base import OrmBaseModel
from app.api.asset_type.routes import AssetTypeRead
from app.image_gen import generate_image_key_or_url
from app.services.s3_storage import presign_get_url

# 🔐 get current user
from app.db.models.user import User
from app.deps.auth import get_current_user
from .utils_quota import enforce_monthly_quota

router = APIRouter(tags=["assets"])


# ----------------- Schemas -----------------

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
    url: str
    name: Optional[str]
    resolution: str
    format: Optional[str]
    thumbnail_url: Optional[str]
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

# Request used by /assets/generate


class GenerateAssetRequest(OrmBaseModel):
    project_id: UUID
    prompt: str
    preset: str
    width: int
    height: int
    # Optional: if provided, we will persist the generated result as a DB row
    asset_type_id: Optional[UUID] = None
    name: Optional[str] = None
    format: Optional[str] = "png"

# ----------------- Helpers -----------------


async def require_active_plan_and_remaining_quota(db: AsyncSession, user_id: UUID) -> int:
    """
    Ensures the user has an active subscription/plan and hasn't exceeded the generation limit.
    Returns the plan limit (useful for logs/UI), raises HTTPException on failure.
    """
    # current count
    count_stmt = select(func.count()).select_from(
        GeneratedAsset).where(GeneratedAsset.user_id == user_id)
    result = await db.execute(count_stmt)
    current_count = result.scalar_one()

    # plan limit
    limit_stmt = (
        select(Plan.generation_limit)
        .join(Subscription, Plan.id == Subscription.plan_id)
        .where(Subscription.user_id == user_id, Subscription.active.is_(True))
    )
    result = await db.execute(limit_stmt)
    limit = result.scalar_one_or_none()

    if limit is None:
        raise HTTPException(
            status_code=403, detail="No active subscription or plan found.")
    if current_count >= limit:
        raise HTTPException(
            status_code=403, detail="Generation limit reached for your plan.")

    return limit


# ----------------- Routes -----------------

@router.post("/generate")
async def generate_asset_endpoint(
    payload: GenerateAssetRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await enforce_monthly_quota(db, current_user.id)

    ident, is_key = generate_image_key_or_url(
        prompt=payload.prompt,
        width=payload.width,
        height=payload.height,
        project_id=str(payload.project_id),
    )

    # The value we'll store in DB and how we'll present it
    if is_key:
        stored_value = ident                               # store S3 key in DB
        presigned_url = presign_get_url(ident, expires=3600)  # 1 hour
        public_for_now = presigned_url
    else:
        stored_value = ident  # a local URL during dev
        public_for_now = ident

    # (Optional) persist immediately
    new_asset_id: Optional[str] = None
    if payload.asset_type_id:
        async with db.begin():
            asset = GeneratedAsset(
                user_id=current_user.id,
                project_id=payload.project_id,
                asset_type_id=payload.asset_type_id,
                url=stored_value,   # <- KEY or local URL
                name=payload.name or payload.preset,
                resolution=f"{payload.width}x{payload.height}",
                format=payload.format or "png",
            )
            db.add(asset)
        await db.refresh(asset)
        new_asset_id = str(asset.id)

    return {"url": public_for_now, "id": new_asset_id, "expiresIn": 3600 if is_key else None}


@router.get("/{asset_id}/url")
async def get_asset_presigned_url(
    asset_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = await db.get(GeneratedAsset, asset_id)
    if not asset or asset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Local dev fallback: stored_value is a direct URL already
    if asset.url.startswith("http://") or asset.url.startswith("https://"):
        return {"url": asset.url, "expiresIn": None}

    # Stored value is an S3 key
    url = presign_get_url(asset.url, expires=3600)
    return {"url": url, "expiresIn": 3600}


@router.post("/", response_model=dict)
async def create_asset(
    data: GeneratedAssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Quota first
    await enforce_monthly_quota(db, current_user.id)

    from sqlalchemy.exc import SQLAlchemyError
    try:
        async with db.begin():
            new_asset = GeneratedAsset(
                user_id=current_user.id,
                **data.model_dump()
            )
            db.add(new_asset)
        return {"message": "Generated asset created", "id": str(new_asset.id)}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/", response_model=List[GeneratedAssetRead])
async def list_assets(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(
        select(GeneratedAsset).where(GeneratedAsset.user_id == current_user.id)
    )
    return res.scalars().all()


@router.get("/{asset_id}", response_model=GeneratedAssetRead)
async def get_asset(asset_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GeneratedAsset).where(GeneratedAsset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


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
