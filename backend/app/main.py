# app/main.py
import os
import logging
from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings
from app.api import api_router
from app.db.session import get_db

logger = logging.getLogger("uvicorn")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

# -------- Storage mode detection --------

settings = get_settings()
USE_S3 = bool(os.getenv("S3_ENDPOINT"))
if USE_S3:
    logger.info(
        "Storage mode: S3/MinIO (presigned URLs). Static mount for generated assets is disabled.")
else:
    logger.info(
        "Storage mode: Local filesystem. Serving /generated from app/generated.")
    # Ensure the directory exists so StaticFiles has something to serve
    Path("app/generated").mkdir(parents=True, exist_ok=True)

# -------- App --------
app = FastAPI(title="Istoria Studio API")

# -------- Routers --------
app.include_router(api_router, prefix="/api")

# -------- CORS --------
# Comma-separated list, e.g. "http://localhost:3000,https://yourapp.com"
cors_origins = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------- Static (local-only) --------
if not USE_S3:
    # In local mode we saved images to app/generated and can serve them directly
    app.mount("/generated", StaticFiles(directory="app/generated"),
              name="generated")

# -------- Basic routes --------


@app.get("/")
async def root():
    return {"message": "Welcome to Istoria Studio"}


@app.get("/health")
async def healthcheck(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT 1"))
    return {"db_status": result.scalar() == 1}
