"""Application settings loaded from environment / .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
DEV_JWT_PLACEHOLDER = "dev-only-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development", alias="ENVIRONMENT")
    jwt_secret: str = Field(default=DEV_JWT_PLACEHOLDER, alias="JWT_SECRET")
    jwt_expire_hours: int = Field(default=24, alias="JWT_EXPIRE_HOURS")

    mongodb_uri: str = Field(default="mongodb://localhost:27017", alias="MONGODB_URI")
    mongodb_db: str = Field(default="attention_tracker", alias="MONGODB_DB")

    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000",
        alias="CORS_ORIGINS",
    )

    require_join_code: bool = Field(default=False, alias="REQUIRE_JOIN_CODE")
    session_log_interval_sec: float = Field(default=5.0, alias="SESSION_LOG_INTERVAL_SEC")
    student_stale_sec: float = Field(default=8.0, alias="STUDENT_STALE_SEC")
    history_limit: int = Field(default=50, alias="HISTORY_LIMIT")
    session_ttl_days: int = Field(default=90, alias="SESSION_TTL_DAYS")

    auth_rate_limit: int = Field(default=20, alias="AUTH_RATE_LIMIT")
    auth_rate_window_sec: int = Field(default=60, alias="AUTH_RATE_WINDOW_SEC")
    telemetry_rate_limit: int = Field(default=120, alias="TELEMETRY_RATE_LIMIT")
    telemetry_rate_window_sec: int = Field(default=60, alias="TELEMETRY_RATE_WINDOW_SEC")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production:
        if not settings.jwt_secret or settings.jwt_secret == DEV_JWT_PLACEHOLDER:
            raise RuntimeError(
                "JWT_SECRET must be set to a strong value when ENVIRONMENT=production"
            )
    return settings
