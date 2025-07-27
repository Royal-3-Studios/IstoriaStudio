from fastapi import Request, HTTPException, Depends
from app.core.security import decode_access_token
from app.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import User
from sqlalchemy import select


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing access token")

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.email == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
