from urllib.parse import urlencode
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from fastapi import APIRouter, Request, Response, HTTPException, Form
from fastapi.responses import JSONResponse
from jose import jwt, jwk
from jose.utils import base64url_decode
import httpx
import os
import json


router = APIRouter()

# ENV CONFIG
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
CLIENT_ID = os.getenv("CLIENT_ID")
# KEYCLOAK_BASE = os.getenv("KEYCLOAK_BASE")
KEYCLOAK_INTERNAL = os.getenv("KEYCLOAK_INTERNAL")
KEYCLOAK_PUBLIC = os.getenv("KEYCLOAK_PUBLIC")
REALM = os.getenv("REALM")
REDIRECT_URI = os.getenv("REDIRECT_URI")
ALGORITHMS = [os.getenv("ALGORITHMS", "RS256")]
ISSUER = f"{KEYCLOAK_INTERNAL}/realms/{REALM}"
PUBLIC_ISSUER = f"{KEYCLOAK_PUBLIC}/realms/{REALM}"
IS_PRODUCTION = os.getenv("IS_PRODUCTION", "true").lower() == "true"

# JWKS cache
jwks_cache = None


async def get_jwks():
    global jwks_cache
    if jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{ISSUER}/protocol/openid-connect/certs")
            resp.raise_for_status()
            jwks_cache = resp.json()
    return jwks_cache["keys"]


# @router.get("/login")
# async def login():
#     redirect_uri = (
#         f"{ISSUER}/protocol/openid-connect/auth"
#         f"?client_id={CLIENT_ID}"
#         f"&response_type=code"
#         # This should match your /callback endpoint
#         f"&redirect_uri={REDIRECT_URI}"
#         f"&scope=openid"
#     )
#     return RedirectResponse(url=redirect_uri)


# @router.post("/callback")
# async def auth_callback(code: str = Form(...)):
#     token_url = f"{ISSUER}/protocol/openid-connect/token"
#     data = {
#         "grant_type": "authorization_code",
#         "code": code,
#         "client_id": CLIENT_ID,
#         "client_secret": CLIENT_SECRET,
#         "redirect_uri": REDIRECT_URI,
#     }

#     async with httpx.AsyncClient() as client:
#         token_resp = await client.post(token_url, data=data)

#     if token_resp.status_code != 200:
#         raise HTTPException(status_code=400, detail="Token exchange failed")

#     token_data = token_resp.json()
#     access_token = token_data["access_token"]
#     refresh_token = token_data.get("refresh_token")
#     id_token = token_data.get("id_token")

#     response = RedirectResponse(url="http://localhost:3000", status_code=303)
#     response.set_cookie("access_token", access_token, httponly=True,
#                         secure=IS_PRODUCTION, samesite="lax", max_age=3600)
#     response.set_cookie("refresh_token", refresh_token, httponly=True,
#                         secure=IS_PRODUCTION, samesite="lax", max_age=7 * 86400)
#     response.set_cookie("logged_in", "true", httponly=False,
#                         secure=IS_PRODUCTION, samesite="lax", max_age=3600)
#     if id_token:
#         response.set_cookie(
#             "id_token", id_token,
#             httponly=True,
#             secure=IS_PRODUCTION,
#             samesite="lax",
#             max_age=3600
#         )

#     print("token_url: ", token_url, "data: ", data, "token resp: ", token_resp,
#           "token data: ", token_data, "access_token: ", access_token, "refresh token: ", refresh_token,
#           "response: ", response)
#     return response


# @router.get("/keycloak/me")
# async def get_current_user(request: Request):
#     token = request.cookies.get("access_token")
#     if not token:
#         raise HTTPException(status_code=401, detail="Missing token")

#     try:
#         header_b64, payload_b64, signature_b64 = token.split(".")
#     except ValueError:
#         raise HTTPException(status_code=401, detail="Malformed token")

#     headers = json.loads(base64url_decode(
#         (header_b64 + "==").encode()).decode())

#     kid = headers.get("kid")
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
#     print("token: ", token, "header_b64: ", header_b64, "payload_b64: ", payload_b64,
#           "signature_b64: ", signature_b64, "headers: ", headers, "kid: ", kid,
#           "keys: ", keys, "key_data: ", key_data, "public_key: ", public_key, "message: ", message,
#           "decoded_signature: ", decoded_signature)
#     try:
#         payload = jwt.decode(
#             token, public_key, algorithms=ALGORITHMS, audience="account",
#             # issuer=ISSUER
#             issuer="http://localhost:8080/realms/istoria"
#         )
#         print("✅ Successfully decoded token payload:", payload)
#     except jwt.ExpiredSignatureError:
#         print("❌ Token has expired")
#         raise HTTPException(status_code=401, detail="Token expired")
#     except jwt.JWTClaimsError as e:
#         print("❌ Invalid claims:", e)
#         raise HTTPException(
#             status_code=401, detail=f"Invalid claims: {str(e)}")
#     except jwt.JWTError as e:
#         print("❌ General JWT error:", e)
#         raise HTTPException(
#             status_code=401, detail=f"Token validation failed: {str(e)}")
#     except Exception as e:
#         print("❌ Unexpected error:", e)
#         raise HTTPException(status_code=500, detail="Unexpected server error")
#     return {
#         "email": payload.get("email"),
#         "username": payload.get("preferred_username"),
#         "roles": payload.get("realm_access", {}).get("roles", []),
#     }


# @router.post("/refresh")
# async def refresh_tokens(request: Request):
#     refresh_token = request.cookies.get("refresh_token")
#     if not refresh_token:
#         raise HTTPException(status_code=401, detail="Missing refresh token")

#     token_url = f"{ISSUER}/protocol/openid-connect/token"
#     data = {
#         "grant_type": "refresh_token",
#         "client_id": CLIENT_ID,
#         "client_secret": CLIENT_SECRET,
#         "refresh_token": refresh_token,
#     }

#     async with httpx.AsyncClient() as client:
#         token_resp = await client.post(token_url, data=data)

#     print("refresh_token: ", refresh_token, "token_url: ",
#           token_url, "data: ", data, "token resp: ", token_resp)

#     if token_resp.status_code != 200:
#         print("❌ Refresh failed:", token_resp.text)
#         raise HTTPException(status_code=401, detail="Token refresh failed")

#     token_data = token_resp.json()
#     new_access_token = token_data["access_token"]
#     new_refresh_token = token_data["refresh_token"]

#     response = JSONResponse(content={"message": "Tokens refreshed"})

#     response.set_cookie("access_token", new_access_token,
#                         httponly=True, secure=IS_PRODUCTION, samesite="lax", max_age=3600)
#     response.set_cookie("refresh_token", new_refresh_token,
#                         httponly=True, secure=IS_PRODUCTION, samesite="lax", max_age=7 * 86400)
#     response.set_cookie("logged_in", "true", httponly=False,
#                         secure=IS_PRODUCTION, samesite="lax", max_age=3600)

#     return response


# @router.post("/logout")
# async def logout(request: Request):
#     redirect_uri = "http://localhost:3000"
#     id_token = request.cookies.get("id_token")

#     # Build correct logout URL per OIDC spec
#     params = {
#         "post_logout_redirect_uri": redirect_uri,
#         "client_id": CLIENT_ID
#     }
#     if id_token:
#         params["id_token_hint"] = id_token

#     # logout_url = f"{ISSUER}/protocol/openid-connect/logout?{urlencode(params)}"

#     logout_url = f"http://localhost:8080/realms/istoria/protocol/openid-connect/logout?{urlencode(params)}"

#     # Clear cookies
#     response = JSONResponse(content={"redirectUrl": logout_url})
#     response.delete_cookie("access_token")
#     response.delete_cookie("refresh_token")
#     response.delete_cookie("logged_in")
#     response.delete_cookie("id_token")

#     return response


# ========== LOGIN ==========
@router.get("/login")
async def login():
    redirect_uri = (
        f"{PUBLIC_ISSUER}/protocol/openid-connect/auth"
        f"?client_id={CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope=openid"
    )
    return RedirectResponse(url=redirect_uri)


# ========== CALLBACK ==========
# @router.post("/callback")
# async def auth_callback(code: str = Form(...)):
#     token_url = f"{ISSUER}/protocol/openid-connect/token"
#     data = {
#         "grant_type": "authorization_code",
#         "code": code,
#         "client_id": CLIENT_ID,
#         "client_secret": CLIENT_SECRET,
#         "redirect_uri": REDIRECT_URI,
#     }

#     async with httpx.AsyncClient() as client:
#         token_resp = await client.post(token_url, data=data)

#     if token_resp.status_code != 200:
#         raise HTTPException(status_code=400, detail="Token exchange failed")

#     token_data = token_resp.json()
#     access_token = token_data["access_token"]
#     refresh_token = token_data.get("refresh_token")
#     id_token = token_data.get("id_token")

#     response = RedirectResponse(url="http://localhost:3000", status_code=303)
#     response.set_cookie("access_token", access_token, httponly=True,
#                         secure=IS_PRODUCTION, samesite="lax", max_age=3600)
#     response.set_cookie("refresh_token", refresh_token, httponly=True,
#                         secure=IS_PRODUCTION, samesite="lax", max_age=7 * 86400)
#     response.set_cookie("logged_in", "true", httponly=False,
#                         secure=IS_PRODUCTION, samesite="lax", max_age=3600)
#     if id_token:
#         response.set_cookie("id_token", id_token,
#                             httponly=True,
#                             secure=IS_PRODUCTION,
#                             samesite="lax",
#                             max_age=3600)

#     return response

@router.get("/callback")
async def auth_callback(request: Request):
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")

    token_url = f"{ISSUER}/protocol/openid-connect/token"
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
    }

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(token_url, data=data)

    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Token exchange failed")

    token_data = token_resp.json()
    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    id_token = token_data.get("id_token")

    response = RedirectResponse(url="http://localhost:3000", status_code=303)
    response.set_cookie("access_token", access_token, httponly=True,
                        secure=IS_PRODUCTION, samesite="lax", max_age=3600)
    response.set_cookie("refresh_token", refresh_token, httponly=True,
                        secure=IS_PRODUCTION, samesite="lax", max_age=7 * 86400)
    response.set_cookie("logged_in", "true", httponly=False,
                        secure=IS_PRODUCTION, samesite="lax", max_age=3600)
    if id_token:
        response.set_cookie("id_token", id_token,
                            httponly=True,
                            secure=IS_PRODUCTION,
                            samesite="lax",
                            max_age=3600)

    return response


# ========== GET CURRENT USER ==========
@router.get("/keycloak/me")
async def get_current_user(request: Request):
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
            algorithms=ALGORITHMS,
            audience="account",
            issuer=PUBLIC_ISSUER
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

    return {
        "email": payload.get("email"),
        "username": payload.get("preferred_username"),
        "roles": payload.get("realm_access", {}).get("roles", []),
    }


# ========== REFRESH ==========
@router.post("/refresh")
async def refresh_tokens(request: Request):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")

    token_url = f"{ISSUER}/protocol/openid-connect/token"
    data = {
        "grant_type": "refresh_token",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
    }

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(token_url, data=data)

    if token_resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Token refresh failed")

    token_data = token_resp.json()
    new_access_token = token_data["access_token"]
    new_refresh_token = token_data["refresh_token"]

    response = JSONResponse(content={"message": "Tokens refreshed"})
    response.set_cookie("access_token", new_access_token, httponly=True,
                        secure=IS_PRODUCTION, samesite="lax", max_age=3600)
    response.set_cookie("refresh_token", new_refresh_token, httponly=True,
                        secure=IS_PRODUCTION, samesite="lax", max_age=7 * 86400)
    response.set_cookie("logged_in", "true", httponly=False,
                        secure=IS_PRODUCTION, samesite="lax", max_age=3600)

    return response


# ========== LOGOUT ==========
@router.post("/logout")
async def logout(request: Request):
    redirect_uri = "http://localhost:3000"
    id_token = request.cookies.get("id_token")

    params = {
        "post_logout_redirect_uri": redirect_uri,
        "client_id": CLIENT_ID
    }
    if id_token:
        params["id_token_hint"] = id_token

    logout_url = f"{PUBLIC_ISSUER}/protocol/openid-connect/logout?{urlencode(params)}"

    response = JSONResponse(content={"redirectUrl": logout_url})
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    response.delete_cookie("logged_in")
    response.delete_cookie("id_token")

    return response
