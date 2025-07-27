from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from typing import Optional, List
from pydantic import BaseModel

from app.db.models import GeneratedAsset
from app.db.session import get_db

router = APIRouter()


class GeneratedAssetCreate(BaseModel):
    id: Optional[UUID] = None
    asset_type_id: UUID
    url: str
    name: Optional[str] = None
    resolution: str
    format: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_size: Optional[int] = None
    project_id: UUID


class GeneratedAssetUpdate(BaseModel):
    id: Optional[UUID] = None
    asset_type_id: Optional[UUID] = None
    url: Optional[str] = None
    name: Optional[str] = None
    resolution: Optional[str] = None
    format: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_size: Optional[int] = None


class GeneratedAssetReturn(GeneratedAssetCreate):
    id: UUID


@router.post("/", response_model=dict)
async def create_asset(data: GeneratedAssetCreate, db: AsyncSession = Depends(get_db)):
    try:
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


@router.put("/{asset_id}", response_model=dict)
async def update_asset(asset_id: UUID, data: GeneratedAssetUpdate, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            result = await db.execute(select(GeneratedAsset).where(GeneratedAsset.id == asset_id))
            asset = result.scalar_one_or_none()
            if not asset:
                raise HTTPException(status_code=404, detail="Asset not found")

            for key, value in data.model_dump(exclude_unset=True).items():
                setattr(asset, key, value)

            return {"message": "Asset updated"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


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
