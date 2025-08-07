from urllib.parse import urlencode
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi import APIRouter, Request, HTTPException
from jose import jwt, jwk
from app.db.models.user import User
from jose.utils import base64url_decode
import httpx
import json
from app.db.models.base import OrmBaseModel
from typing import List, Optional
from uuid import UUID
from app.core.config import get_settings
from sqlalchemy import select
from app.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

router = APIRouter()
settings = get_settings()

# JWKS cache
jwks_cache = None


class UserOut(OrmBaseModel):
    id: UUID
    keycloak_id: str
    email: Optional[str]
    username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    roles: List[str] = []


async def get_jwks():
    global jwks_cache
    if jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{settings.keycloak_internal}/realms/{settings.realm}/protocol/openid-connect/certs")
            resp.raise_for_status()
            jwks_cache = resp.json()
    return jwks_cache["keys"]

# ========== GET_OR_CREATE_USER ==========


async def get_or_create_user(db: AsyncSession, keycloak_user: dict):
    keycloak_id = keycloak_user["sub"]
    email = keycloak_user.get("email")
    username = keycloak_user.get("preferred_username")
    first_name = keycloak_user.get("given_name")
    last_name = keycloak_user.get("family_name")

    result = await db.execute(select(User).where(User.keycloak_id == keycloak_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            keycloak_id=keycloak_id,
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


# ========== LOGIN ==========


@router.get("/login")
async def login(request: Request):
    theme = request.query_params.get("theme", "dark")
    redirect_uri = (
        # f"{settings.keycloak_internal}/realms/{settings.realm}/protocol/openid-connect/auth"
        f"{settings.keycloak_public}/realms/{settings.realm}/protocol/openid-connect/auth"
        f"?client_id={settings.client_id}"
        f"&response_type=code"
        f"&redirect_uri={settings.redirect_uri}"
        f"&scope=openid"
        f"&theme={theme}"
    )
    return RedirectResponse(url=redirect_uri)

# ========== CALLBACK ==========


@router.get("/callback")
async def auth_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    token_url = f"{settings.keycloak_internal}/realms/{settings.realm}/protocol/openid-connect/token"
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": settings.client_id,
        "client_secret": settings.client_secret,
        "redirect_uri": settings.redirect_uri,
    }

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(token_url, data=data)

    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Token exchange failed")

    token_data = token_resp.json()
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    id_token = token_data.get("id_token")

    print("token_url", token_url)
    print("access_token", access_token)
    print("refresh_token", refresh_token)
    print("id_token", id_token)

    response = RedirectResponse(url="http://localhost:3000", status_code=303)
    response.set_cookie("access_token", access_token, httponly=True,
                        secure=settings.is_production, samesite="lax", max_age=3600)
    response.set_cookie("refresh_token", refresh_token, httponly=True,
                        secure=settings.is_production, samesite="lax", max_age=7 * 86400)
    response.set_cookie("logged_in", "true", httponly=False,
                        secure=settings.is_production, samesite="lax", max_age=3600 * 86400)
    if id_token:
        response.set_cookie("id_token", id_token, httponly=True,
                            secure=settings.is_production, samesite="lax", max_age=3600)

    return response

# ========== GET CURRENT USER ==========


# @router.get("/keycloak/me")
# async def get_current_user(request: Request):
#     token = request.cookies.get("access_token")
#     if not token:
#         raise HTTPException(status_code=401, detail="Missing token")

#     try:
#         header_b64, payload_b64, signature_b64 = token.split(".")
#         headers = json.loads(base64url_decode(
#             (header_b64 + "==").encode()).decode())
#         kid = headers.get("kid")
#     except Exception:
#         raise HTTPException(status_code=401, detail="Malformed token")

#     if not kid:
#         raise HTTPException(status_code=401, detail="Missing key ID")

#     keys = await get_jwks()
#     key_data = next((k for k in keys if k["kid"] == kid), None)
#     if not key_data:
#         raise HTTPException(status_code=401, detail="Public key not found")

#     public_key = jwk.construct(key_data)
#     message = f"{header_b64}.{payload_b64}".encode()
#     decoded_signature = base64url_decode(signature_b64 + "==")

#     if not public_key.verify(message, decoded_signature):
#         raise HTTPException(status_code=401, detail="Invalid signature")

#     try:
#         payload = jwt.decode(
#             token,
#             public_key,
#             algorithms=[settings.algorithms],
#             audience="account",
#             issuer=f"{settings.keycloak_public}/realms/{settings.realm}"
#         )
#     except jwt.ExpiredSignatureError:
#         raise HTTPException(status_code=401, detail="Token expired")
#     except jwt.JWTClaimsError as e:
#         raise HTTPException(
#             status_code=401, detail=f"Invalid claims: {str(e)}")
#     except jwt.JWTError as e:
#         raise HTTPException(
#             status_code=401, detail=f"Token validation failed: {str(e)}")
#     except Exception:
#         raise HTTPException(status_code=500, detail="Unexpected server error")

#     return {
#         "id": str(user.id),
#         "keycloak_id": user.keycloak_id,
#         "email": user.email,
#         "username": user.username,
#         "first_name": user.first_name,
#         "last_name": user.last_name,
#         "roles": payload.get("realm_access", {}).get("roles", []),
#     }


@router.get("/keycloak/me")
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        headers = json.loads(base64url_decode(
            (header_b64 + "==").encode()).decode())
        kid = headers.get("kid")
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed token")

    if not kid:
        raise HTTPException(status_code=401, detail="Missing key ID")

    keys = await get_jwks()
    key_data = next((k for k in keys if k["kid"] == kid), None)
    if not key_data:
        raise HTTPException(status_code=401, detail="Public key not found")

    public_key = jwk.construct(key_data)
    message = f"{header_b64}.{payload_b64}".encode()
    decoded_signature = base64url_decode(signature_b64 + "==")

    if not public_key.verify(message, decoded_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=[settings.algorithms],
            audience="account",
            issuer=f"{settings.keycloak_public}/realms/{settings.realm}"
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTClaimsError as e:
        raise HTTPException(
            status_code=401, detail=f"Invalid claims: {str(e)}")
    except jwt.JWTError as e:
        raise HTTPException(
            status_code=401, detail=f"Token validation failed: {str(e)}")
    except Exception:
        raise HTTPException(status_code=500, detail="Unexpected server error")

    # 🟢 This will create or return the local DB user
    user = await get_or_create_user(db, payload)

    return UserOut(
        id=user.id,
        keycloak_id=user.keycloak_id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        roles=payload.get("realm_access", {}).get("roles", []),
    )


# ========== REFRESH ==========


@router.post("/refresh")
async def refresh_tokens(request: Request):
    refresh_token = request.cookies.get("refresh_token")
    print("refresh_token", refresh_token)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    # token_url = f"{settings.keycloak_internal}/realms/{settings.realm}/protocol/openid-connect/token"
    token_url = f"{settings.keycloak_internal}/realms/{settings.realm}/protocol/openid-connect/token"
    data = {
        "grant_type": "refresh_token",
        "client_id": settings.client_id,
        "client_secret": settings.client_secret,
        "refresh_token": refresh_token,
    }

    print("data: ", data)
    print("token_url", token_url)

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(token_url, data=data)

    print("token_resp", token_resp)
    if token_resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Token refresh failed")

    token_data = token_resp.json()
    new_access_token = token_data["access_token"]
    new_refresh_token = token_data["refresh_token"]

    response = JSONResponse(content={"message": "Tokens refreshed"})
    response.set_cookie("access_token", new_access_token, httponly=True,
                        secure=settings.is_production, samesite="lax", max_age=3600)
    response.set_cookie("refresh_token", new_refresh_token, httponly=True,
                        secure=settings.is_production, samesite="lax", max_age=7 * 86400)
    response.set_cookie("logged_in", "true", httponly=False,
                        secure=settings.is_production, samesite="lax", max_age=3600 * 86400)

    return response

# ========== LOGOUT ==========


@router.post("/logout")
async def logout(request: Request):
    redirect_uri = "http://localhost:3000"
    id_token = request.cookies.get("id_token")

    params = {
        "post_logout_redirect_uri": redirect_uri,
        "client_id": settings.client_id
    }
    if id_token:
        params["id_token_hint"] = id_token

    logout_url = f"{settings.keycloak_public}/realms/{settings.realm}/protocol/openid-connect/logout?{urlencode(params)}"

    response = JSONResponse(content={"redirectUrl": logout_url})
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    response.delete_cookie("logged_in")
    response.delete_cookie("id_token")

    return response
