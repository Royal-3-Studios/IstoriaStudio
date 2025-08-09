from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from typing import Optional, List
from app.db.models.base import OrmBaseModel

from app.db.models import AssetType
from app.db.session import get_db

router = APIRouter()


class AssetTypeRead(OrmBaseModel):
    id: UUID
    name: str


class AssetTypeCreate(OrmBaseModel):
    id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    icon_url: Optional[str] = None
    is_active: Optional[bool] = True


@router.post("/", response_model=dict)
async def create_asset_type(data: AssetTypeCreate, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            new_type = AssetType(**data.model_dump())
            db.add(new_type)
            return {"message": "Asset type created", "id": str(new_type.id)}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")


@router.get("/", response_model=List[AssetTypeCreate])
async def list_asset_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AssetType))
    return result.scalars().all()


@router.delete("/{asset_type_id}", response_model=dict)
async def delete_asset_type(asset_type_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            result = await db.execute(select(AssetType).where(AssetType.id == asset_type_id))
            asset_type = result.scalar_one_or_none()
            if not asset_type:
                raise HTTPException(
                    status_code=404, detail="Asset type not found")

            await db.delete(asset_type)
            return {"message": "Asset type deleted"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")
