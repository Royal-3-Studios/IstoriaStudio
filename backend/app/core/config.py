# app/core/config.py
from __future__ import annotations
import json
from functools import lru_cache
from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",  # ignore env keys we don't model yet
    )

    # Database
    alembic_database_url: str = Field(alias="ALEMBIC_DATABASE_URL")

    # JWT / Auth
    secret_key: str = Field(alias="SECRET_KEY")
    algorithm: str = Field(default="RS256", alias="ALGORITHM")
    access_token_expire_minutes: int = Field(
        default=15, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(
        default=7, alias="REFRESH_TOKEN_EXPIRE_DAYS")
    is_production: bool = Field(default=False, alias="IS_PRODUCTION")

    # Keycloak
    keycloak_internal: str = Field(alias="KEYCLOAK_INTERNAL")
    keycloak_public: str = Field(alias="KEYCLOAK_PUBLIC")
    realm: str = Field(alias="REALM")
    client_id: str = Field(alias="CLIENT_ID")
    client_secret: str = Field(alias="CLIENT_SECRET")
    redirect_uri: str = Field(alias="REDIRECT_URI")

    # OIDC verification
    algorithms: str = Field(default="RS256", alias="ALGORITHMS")

    # --- CORS ---
    cors_origins: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        alias="CORS_ORIGINS",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        # Accept list, JSON string, or comma-separated string
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):  # JSON array form
                try:
                    parsed = json.loads(s)
                    if isinstance(parsed, list):
                        return parsed
                except Exception:
                    pass
            return [part.strip() for part in s.split(",") if part.strip()]
        return v

    # --- Optional: storage / paths used elsewhere ---
    s3_endpoint: Optional[str] = Field(default=None, alias="S3_ENDPOINT")
    s3_access_key: Optional[str] = Field(default=None, alias="S3_ACCESS_KEY")
    s3_secret_key: Optional[str] = Field(default=None, alias="S3_SECRET_KEY")
    s3_region: str = Field(default="us-east-1", alias="S3_REGION")
    s3_bucket: str = Field(default="generated", alias="S3_BUCKET")
    s3_secure: bool = Field(default=False, alias="S3_SECURE")

    generated_dir: str = Field(default="app/generated", alias="GENERATED_DIR")
    server_url: str = Field(
        default="http://localhost:8000", alias="SERVER_URL")

    # app/core/config.py (append inside Settings)
    # --- Stable Diffusion / generation ---
    sd_model_id: str = Field(
        default="stabilityai/sd-turbo", alias="SD_MODEL_ID")
    sd_steps: int = Field(default=12, alias="SD_STEPS")
    sd_guidance: float = Field(default=1.8, alias="SD_GUIDANCE")
    sd_use_cuda: bool = Field(default=True, alias="USE_CUDA")
    sd_enable_xformers: bool = Field(default=False, alias="SD_ENABLE_XFORMERS")
    sd_max_mp: float = Field(default=1.0, alias="SD_MAX_MP")  # VRAM guardrail

    @field_validator("sd_steps")
    @classmethod
    def _steps_pos(cls, v: int) -> int:
        return max(1, v)

    @field_validator("sd_guidance")
    @classmethod
    def _guidance_nonneg(cls, v: float) -> float:
        return max(0.0, v)

    @field_validator("sd_max_mp")
    @classmethod
    def _mp_pos(cls, v: float) -> float:
        return max(0.1, v)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
