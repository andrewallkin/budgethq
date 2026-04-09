import logging

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import get_settings

log = logging.getLogger("db")

settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
log.info(
    "Database connection configured: %s pool_pre_ping=True pool_class=%s",
    engine.url.render_as_string(hide_password=True),
    type(engine.pool).__name__,
)

# Export for Alembic migrations
SQLALCHEMY_DATABASE_URL = settings.database_url

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def check_postgres_connection() -> None:
    """Verify connectivity and log outcome (call after logging is configured)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        log.info(
            "PostgreSQL connection OK (host=%s port=%s database=%s)",
            settings.postgres_host,
            settings.postgres_port,
            settings.postgres_db,
        )
    except Exception:
        log.exception(
            "PostgreSQL connection failed (host=%s port=%s database=%s)",
            settings.postgres_host,
            settings.postgres_port,
            settings.postgres_db,
        )
        raise


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
