from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    # Database
    alembic_database_url: str = Field(alias="ALEMBIC_DATABASE_URL")

    # JWT / Auth (local JWTs no longer used for access/refresh, but keep if needed elsewhere)
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


@lru_cache()
def get_settings() -> Settings:
    return Settings()
