from fastapi import FastAPI, Depends
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import engine, Base, get_db
from fastapi.middleware.cors import CORSMiddleware

# ✅ Add this:
from app.api import api_router  # Imports your /auth routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("✅ Tables checked/created")
    yield
    print("🛑 Shutting down")

app = FastAPI(title="Istoria Studio API", lifespan=lifespan)

# ✅ Add this:
app.include_router(api_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Welcome to Istoria Studio"}


@app.get("/health")
async def healthcheck(db: AsyncSession = Depends(get_db)):
    result = await db.execute("SELECT 1")
    return {"db_status": result.scalar() == 1}
