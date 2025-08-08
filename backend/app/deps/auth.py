from typing import Optional
from fastapi.security.utils import get_authorization_scheme_param
from fastapi import Request, HTTPException
from fastapi import Depends, HTTPException
from jose import jwt
from app.api.auth.routes import get_jwks
from app.services.users import get_or_create_user
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
import os

KEYCLOAK_PUBLIC = os.getenv("KEYCLOAK_PUBLIC")
REALM = os.getenv("REALM")
ALGORITHMS = [os.getenv("ALGORITHMS", "RS256")]
PUBLIC_ISSUER = f"{KEYCLOAK_PUBLIC}/realms/{REALM}"


async def auth_token_dep(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    scheme, token = get_authorization_scheme_param(auth_header)
    if scheme.lower() == "bearer" and token:
        return token

    cookie_token: Optional[str] = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token

    raise HTTPException(status_code=401, detail="Not authenticated")


# async def get_current_user(token: str = Depends(auth_token_dep)):
#     try:
#         jwks = await get_jwks()
#         unverified_header = jwt.get_unverified_header(token)
#         key = next((k for k in jwks if k["kid"]
#                    == unverified_header["kid"]), None)

#         if not key:
#             raise HTTPException(status_code=401, detail="Public key not found")

#         payload = jwt.decode(
#             token,
#             key,
#             algorithms=ALGORITHMS,
#             audience="account",
#             issuer=PUBLIC_ISSUER
#         )

#         return {
#             "sub": payload.get("sub"),
#             "email": payload.get("email"),
#             "username": payload.get("preferred_username"),
#             "roles": payload.get("realm_access", {}).get("roles", [])
#         }

#     except jwt.JWTError as e:
#         raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


async def get_current_user(
    token: str = Depends(auth_token_dep),
    db: AsyncSession = Depends(get_db),
):
    try:
        jwks = await get_jwks()
        unverified_header = jwt.get_unverified_header(token)
        key = next((k for k in jwks if k["kid"]
                   == unverified_header["kid"]), None)
        if not key:
            raise HTTPException(status_code=401, detail="Public key not found")

        payload = jwt.decode(
            token,
            key,
            algorithms=ALGORITHMS,
            audience="account",
            issuer=PUBLIC_ISSUER,
        )

        # 👇 create or fetch the *local* user based on Keycloak claims
        user = await get_or_create_user(db, payload)
        return user  # return the ORM row (has .id, .email, etc.)

    except jwt.JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
