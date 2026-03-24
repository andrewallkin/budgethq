import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    database_url: str
    postgres_host: str | None
    postgres_port: str | None
    postgres_db: str | None


@lru_cache
def get_settings() -> Settings:
    load_dotenv()
    user = os.getenv("POSTGRES_USER")
    password = os.getenv("POSTGRES_PASSWORD")
    port = os.getenv("POSTGRES_PORT")
    name = os.getenv("POSTGRES_DB")
    host = os.getenv("POSTGRES_HOST")
    database_url = f"postgresql://{user}:{password}@{host}:{port}/{name}"
    return Settings(
        database_url=database_url,
        postgres_host=host,
        postgres_port=port,
        postgres_db=name,
    )
