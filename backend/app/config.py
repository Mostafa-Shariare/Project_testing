"""Application settings loaded from environment / .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
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

    attention_threshold: int = Field(default=50, alias="ATTENTION_THRESHOLD")
    sustained_duration_sec: float = Field(default=30.0, alias="SUSTAINED_DURATION_SEC")
    sustained_low_attention_sec: int = Field(default=30, alias="SUSTAINED_LOW_ATTENTION_SEC")
    class_average_threshold: int = Field(default=60, alias="CLASS_AVERAGE_THRESHOLD")
    alert_window_size_sec: float = Field(default=30.0, alias="ALERT_WINDOW_SIZE_SEC")
    alert_cooldown_sec: float = Field(default=45.0, alias="ALERT_COOLDOWN_SEC")
    auth_rate_limit: int = Field(default=20, alias="AUTH_RATE_LIMIT")
    auth_rate_window_sec: int = Field(default=60, alias="AUTH_RATE_WINDOW_SEC")
    telemetry_rate_limit: int = Field(default=120, alias="TELEMETRY_RATE_LIMIT")
    telemetry_rate_window_sec: int = Field(default=60, alias="TELEMETRY_RATE_WINDOW_SEC")

    @model_validator(mode="after")
    def _reject_known_jwt_secret_in_production(self):
        if self.environment.lower() == "production":
            if not self.jwt_secret or self.jwt_secret == DEV_JWT_PLACEHOLDER:
                raise ValueError(
                    "JWT_SECRET must be set to a strong, non-default value "
                    "when ENVIRONMENT=production"
                )
        return self

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
