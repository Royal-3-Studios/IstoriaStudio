from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    alembic_database_url: str

    # JWT / Auth
    secret_key: str
    algorithm: str = "RS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    is_production: bool = False

    # Keycloak
    keycloak_internal: str
    keycloak_public: str
    realm: str
    client_id: str
    client_secret: str
    redirect_uri: str

    # OIDC verification
    algorithms: str = "RS256"


@lru_cache()
def get_settings():
    return Settings()
