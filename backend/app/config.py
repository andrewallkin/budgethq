from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # database
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_host: str = "postgres"
    postgres_port: int = 5432

    # auth
    jwt_secret_key: str
    jwt_access_token_expire_minutes: int = 60
    authorized_users: str = ""

    # cors
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # secrets at rest (Fernet; required to store OpenAI/Investec credentials)
    encryption_key: str = ""

    # google sheets / gcs (optional)
    gcp_service_account_credentials: str = ""
    google_spreadsheet_id: str | None = None
    google_fx_range: str = "BudgetHQ_FX!A2:B"
    investments_fx_base_currency: str = "ZAR"
    investments_fx_cache_seconds: int = 900
    gcs_payslips_bucket_name: str | None = None

    # logging (optional)
    log_dir: str | None = None
    log_format: str = ""
    request_logging: str = ""

    @field_validator("investments_fx_cache_seconds", mode="before")
    @classmethod
    def _fx_cache_seconds_fallback(cls, value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return 900

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def authorized_users_list(self) -> list[str]:
        return [u.strip() for u in self.authorized_users.split(",") if u.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
