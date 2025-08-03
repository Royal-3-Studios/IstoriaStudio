# from fastapi import APIRouter, Request, Response, HTTPException, status, Form
# import httpx
# from jose import jwt
# from datetime import timedelta
# import os

# router = APIRouter()

# KEYCLOAK_BASE = "http://localhost:8080"
# REALM = "istoria"
# CLIENT_ID = "istoria-frontend"
# REDIRECT_URI = "http://localhost:3000"
# ALGORITHMS = ["RS256"]
# IS_PRODUCTION = os.getenv("IS_PRODUCTION", "true").lower() == "true"


# @router.post("/auth/callback")
# async def auth_callback(
#     response: Response,
#     code: str = Form(...),
# ):
#     token_url = f"{KEYCLOAK_BASE}/realms/{REALM}/protocol/openid-connect/token"
#     data = {
#         "grant_type": "authorization_code",
#         "code": code,
#         "client_id": CLIENT_ID,
#         "redirect_uri": REDIRECT_URI,
#     }

#     async with httpx.AsyncClient() as client:
#         token_resp = await client.post(token_url, data=data)
#         if token_resp.status_code != 200:
#             raise HTTPException(
#                 status_code=400, detail="Token exchange failed")

#         token_data = token_resp.json()
#         access_token = token_data["access_token"]
#         refresh_token = token_data.get("refresh_token")
#         id_token = token_data.get("id_token")

#         # Optional: validate JWT here using JWKS (we'll do that in /me)

#         # Set secure HttpOnly cookie with access token
#         response.set_cookie(
#             key="access_token",
#             value=access_token,
#             httponly=True,
#             secure=IS_PRODUCTION,  # Set True in prod w/ HTTPS
#             samesite="lax",
#             max_age=3600,
#         )

#         # Set optional logged_in cookie for frontend/middleware
#         response.set_cookie(
#             key="logged_in",
#             value="true",
#             httponly=False,
#             secure=IS_PRODUCTION,
#             samesite="lax",
#             max_age=3600,
#         )

#         return {"message": "Login successful"}
