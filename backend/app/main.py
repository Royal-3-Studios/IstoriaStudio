from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pathlib import Path

from app.api import api_router
from app.db.session import get_db  # engine/Base not needed when using Alembic

# Ensure the directory exists so StaticFiles doesn't 404
Path("app/generated").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Istoria Studio API")

# Routes
app.include_router(api_router, prefix="/api")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # add your real domains in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated images (e.g., from image_gen.py)
app.mount("/generated", StaticFiles(directory="app/generated"), name="generated")


@app.get("/")
async def root():
    return {"message": "Welcome to Istoria Studio"}


@app.get("/health")
async def healthcheck(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT 1"))
    return {"db_status": result.scalar() == 1}
