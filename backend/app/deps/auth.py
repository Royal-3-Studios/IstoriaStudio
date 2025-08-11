# from typing import Optional
# from fastapi import Request, HTTPException, Depends
# from fastapi.security.utils import get_authorization_scheme_param
# from jose import jwt
# from sqlalchemy.ext.asyncio import AsyncSession
# from jose.exceptions import ExpiredSignatureError, JWTError
# from app.api.auth.routes import get_jwks
# from app.db.session import get_db
# from app.services.users import get_or_create_user
# from app.core.config import get_settings
# from sqlalchemy.exc import IntegrityError
# from sqlalchemy import select
# from app.db.models import User
# settings = get_settings()

# # PUBLIC_ISSUER = f"{settings.keycloak_public}/realms/{settings.realm}"
# PUBLIC_ISSUER = f"{settings.keycloak_public}/realms/{settings.realm}"
# ALGORITHMS = [settings.algorithms]  # typically ["RS256"]
# AUDIENCE = settings.client_id
# ALLOWED_AUDIENCES = {settings.client_id, "account"}


# async def auth_token_dep(request: Request) -> str:
#     # 1) Authorization header
#     auth_header = request.headers.get("Authorization")
#     scheme, token = get_authorization_scheme_param(auth_header)
#     if scheme and scheme.lower() == "bearer" and token:
#         return token

#     # 2) access_token cookie (same Keycloak token)
#     cookie_token: Optional[str] = request.cookies.get("access_token")
#     if cookie_token:
#         return cookie_token

#     raise HTTPException(status_code=401, detail="Not authenticated")


# # async def get_current_user(
# #     token: str = Depends(auth_token_dep),
# #     db: AsyncSession = Depends(get_db),
# # ):
# #     try:
# #         jwks = await get_jwks()
# #         unverified_header = jwt.get_unverified_header(token)
# #         key = next((k for k in jwks if k.get("kid") ==
# #                    unverified_header.get("kid")), None)
# #         if not key:
# #             raise HTTPException(status_code=401, detail="Public key not found")

# #         rsa_key = {k: key[k]
# #                    for k in ("kty", "kid", "use", "n", "e") if k in key}

# #         print("unverified_header: ",  unverified_header)
# #         print("DATA: ", token,
# #               rsa_key, ALGORITHMS, AUDIENCE, PUBLIC_ISSUER)
# #         ALLOWED_AUDIENCES = [settings.client_id, "account"]
# #         payload = jwt.decode(
# #             token,
# #             rsa_key,
# #             algorithms=ALGORITHMS,
# #             audience=ALLOWED_AUDIENCES,
# #             issuer=PUBLIC_ISSUER,
# #             # helps with small clock skew between containers/host:
# #             options={
# #                 "verify_signature": True,
# #                 "verify_exp": True,
# #                 "verify_aud": True,
# #                 "verify_iss": True,
# #                 "leeway": 60,          # ✅ leeway goes here
# #             },
# #         )

# #         user = await get_or_create_user(db, payload)
# #         return user

# #     except ExpiredSignatureError:
# #         # Signal the frontend to hit /api/auth/refresh
# #         raise HTTPException(status_code=401, detail="token_expired")
# #     except JWTError as e:
# #         print(f"Invalid token: {str(e)}")
# #         raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# async def get_current_user(
#     token: str = Depends(...),  # your auth_token_dep
#     db: AsyncSession = Depends(get_db),
# ):
#     try:
#         jwks = await get_jwks()
#         unverified_header = jwt.get_unverified_header(token)
#         key = next((k for k in jwks if k.get("kid") ==
#                    unverified_header.get("kid")), None)
#         if not key:
#             raise HTTPException(status_code=401, detail="Public key not found")

#         rsa_key = {k: key[k]
#                    for k in ("kty", "kid", "use", "n", "e") if k in key}

#         # Peek at claims to handle audience shape
#         claims = jwt.get_unverified_claims(token)
#         aud_claim = claims.get("aud")  # can be str or list
#         iss_claim = claims.get("iss")

#         # Build decode options; we'll decide how to verify aud
#         options = {
#             "verify_signature": True,
#             "verify_exp": True,
#             "verify_iss": True,
#             # We'll set verify_aud below based on shape
#             "leeway": 60,
#         }

#         audience_arg = None
#         if isinstance(aud_claim, str):
#             # Single-aud token: let python-jose verify it if it's one we accept
#             if aud_claim in ALLOWED_AUDIENCES:
#                 options["verify_aud"] = True
#                 audience_arg = aud_claim  # must be a string
#             else:
#                 # Not an allowed audience
#                 raise HTTPException(status_code=401, detail="Invalid audience")
#         elif isinstance(aud_claim, (list, tuple)):
#             # Multi-aud token: python-jose can't take a list, so disable built-in check
#             options["verify_aud"] = False
#         else:
#             # No aud present: disable built-in check and enforce manually as needed
#             options["verify_aud"] = False

#         payload = jwt.decode(
#             token,
#             rsa_key,
#             algorithms=ALGORITHMS,
#             audience=audience_arg,     # str or None
#             issuer=PUBLIC_ISSUER,      # must equal iss in token
#             options=options,
#         )

#         # Manual audience check when we disabled verify_aud
#         if not options.get("verify_aud"):
#             ok = False
#             if isinstance(aud_claim, str):
#                 ok = aud_claim in ALLOWED_AUDIENCES
#             elif isinstance(aud_claim, (list, tuple)):
#                 ok = any(a in ALLOWED_AUDIENCES for a in aud_claim)
#             # If your realm issues account-only auds, this will still pass
#             if not ok:
#                 raise HTTPException(status_code=401, detail="Invalid audience")

#         # (Optional) double-check issuer match if you want:
#         if iss_claim != PUBLIC_ISSUER:
#             raise HTTPException(status_code=401, detail="Invalid issuer")

#         user = await get_or_create_user(db, payload)
#         return user

#     except ExpiredSignatureError:
#         raise HTTPException(status_code=401, detail="token_expired")
#     except JWTError as e:
#         raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
# app/deps/auth.py
from typing import Optional, Iterable
from fastapi import Request, HTTPException, Depends
from fastapi.security.utils import get_authorization_scheme_param
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError

from app.db.session import get_db
from app.api.auth.routes import get_jwks
from app.core.config import get_settings
from app.services.users import get_or_create_user

settings = get_settings()

PUBLIC_ISSUER = f"{settings.keycloak_public}/realms/{settings.realm}"
ALGORITHMS = [settings.algorithms]  # typically ["RS256"]
ALLOWED_AUDIENCES = {settings.client_id, "account"}  # accept either one


async def auth_token_dep(request: Request) -> str:
    # 1) Authorization: Bearer <token>
    auth_header = request.headers.get("Authorization")
    scheme, token = get_authorization_scheme_param(auth_header)
    if scheme and scheme.lower() == "bearer" and token:
        return token
    # 2) Cookie
    cookie_token: Optional[str] = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token
    raise HTTPException(status_code=401, detail="Not authenticated")


async def get_current_user(
    token: str = Depends(auth_token_dep),
    db: AsyncSession = Depends(get_db),
):
    try:
        # --- JWKS key selection ---
        jwks = await get_jwks()
        unverified_header = jwt.get_unverified_header(token)
        key = next((k for k in jwks if k.get("kid") ==
                   unverified_header.get("kid")), None)
        if not key:
            raise HTTPException(status_code=401, detail="Public key not found")
        rsa_key = {k: key[k]
                   for k in ("kty", "kid", "use", "n", "e") if k in key}

        # --- peek at claims to decide how to check audience ---
        claims = jwt.get_unverified_claims(token)
        aud_claim = claims.get("aud")  # str | list | None
        iss_claim = claims.get("iss")

        options = {
            "verify_signature": True,
            "verify_exp": True,
            "verify_iss": True,
            # we’ll set verify_aud conditionally
            "leeway": 60,
        }

        audience_arg: Optional[str] = None
        if isinstance(aud_claim, str):
            # single audience → let jose verify if it's allowed
            if aud_claim in ALLOWED_AUDIENCES:
                options["verify_aud"] = True
                audience_arg = aud_claim  # jose requires a string here
            else:
                raise HTTPException(status_code=401, detail="Invalid audience")
        else:
            # list or missing → disable jose audience check and we’ll check manually
            options["verify_aud"] = False

        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=ALGORITHMS,
            audience=audience_arg,      # str or None
            issuer=PUBLIC_ISSUER,       # must match token's iss exactly
            options=options,
        )

        # Manual audience check for list/none
        if not options["verify_aud"]:
            ok = False
            if isinstance(aud_claim, str):
                ok = aud_claim in ALLOWED_AUDIENCES
            elif isinstance(aud_claim, Iterable):
                ok = any(a in ALLOWED_AUDIENCES for a in aud_claim)
            if not ok:
                raise HTTPException(status_code=401, detail="Invalid audience")

        # (Optional) belt-and-suspenders issuer check
        if iss_claim != PUBLIC_ISSUER:
            raise HTTPException(status_code=401, detail="Invalid issuer")

        user = await get_or_create_user(db, payload)
        return user

    except ExpiredSignatureError:
        # Frontend should call /api/auth/refresh then retry
        raise HTTPException(status_code=401, detail="token_expired")
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
