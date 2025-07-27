from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.db.models import User
from sqlalchemy.exc import SQLAlchemyError
from app.core.deps import get_current_user
from uuid import UUID
from app.core.security import (
    verify_password,
    hash_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
)
from pydantic import BaseModel
import os
from typing import Optional

router = APIRouter()

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 7))


class AuthRequest(BaseModel):
    id: Optional[UUID] = None
    email: str
    password: str
    business_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    username: Optional[str] = None
    is_business: bool = False
    stripe_customer_id: Optional[str] = None


class UpdateUserRequest(BaseModel):
    id: Optional[UUID] = None
    email: Optional[str] = None
    password: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    business_name: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    username: Optional[str] = None
    is_business: bool = False


@router.post("/token")
async def login(data: AuthRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token({"sub": user.email})
    refresh_token = create_refresh_token({"sub": user.email})

    response = JSONResponse(content={"message": "Login successful"})
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="Lax",
        secure=True,
        path="/"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        samesite="Lax",
        secure=True,
        path="/"
    )
    return response


@router.post("/refresh")
async def refresh_token(request: Request):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    payload = decode_access_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="Invalid token payload")

    new_access_token = create_access_token({"sub": user_id})
    new_refresh_token = create_refresh_token({"sub": user_id})

    response = JSONResponse(content={"message": "Refreshed tokens"})
    response.set_cookie("access_token", new_access_token, httponly=True,
                        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60, samesite="Lax", secure=True, path="/")
    response.set_cookie("refresh_token", new_refresh_token, httponly=True,
                        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400, samesite="Lax", secure=True, path="/")
    return response


@router.post("/register")
async def register_user(data: AuthRequest, db: AsyncSession = Depends(get_db)):
    try:
        async with db.begin():
            result = await db.execute(select(User).where(User.email == data.email))
            if result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400, detail="User already exists")

            user = User(
                email=data.email,
                hashed_password=hash_password(data.password),
                first_name=data.first_name,
                last_name=data.last_name,
                username=data.username,
                business_name=data.business_name,
                is_business=data.is_business,
                stripe_customer_id=data.stripe_customer_id,
                phone=data.phone
            )

            db.add(user)

        return {"message": "User created successfully"}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Unexpected error during registration: {e}")


@router.put("/me")
async def update_me(data: UpdateUserRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        async with db.begin():
            updates = data.model_dump(exclude_unset=True)
            if "password" in updates:
                updates["password"] = hash_password(updates.pop("password"))

            for field, value in updates.items():
                setattr(user, field, value)

        return {"message": "User updated"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Exception: {e}")


@router.delete("/me")
async def delete_me(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        async with db.begin():
            await db.delete(user)

        return {"message": "User deleted"}
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
