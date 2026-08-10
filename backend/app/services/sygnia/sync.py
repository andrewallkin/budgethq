"""Sygnia account sync orchestration for Investments 2.0."""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session, joinedload

from ...database import SessionLocal
from ...models import SygniaAccount
from ...utils import decrypt_api_key, get_sast_now

from .persist import persist_scrape
from .scrape import scrape_account

logger = logging.getLogger(__name__)


def sync_account(db: Session, account_id: int, source: str) -> dict:
    """
    Load account credentials, scrape the portal, persist results, and update sync status.

    Returns {"ok", "message", ...} — never includes decrypted credentials.
    """
    account = (
        db.query(SygniaAccount)
        .options(joinedload(SygniaAccount.login))
        .filter(SygniaAccount.id == account_id)
        .first()
    )
    if account is None:
        return {"ok": False, "message": "Sygnia account not found.", "account_id": account_id}

    login = account.login
    if login is None:
        _mark_sync_error(db, account, "Sygnia login not found for account.")
        return {"ok": False, "message": "Sygnia login not found for account.", "account_id": account_id}

    username = decrypt_api_key(login.username_encrypted)
    password = decrypt_api_key(login.password_encrypted)
    if not username or not password:
        _mark_sync_error(db, account, "Stored Sygnia credentials are missing or invalid.")
        return {
            "ok": False,
            "message": "Stored Sygnia credentials are missing or invalid.",
            "account_id": account_id,
        }

    scrape_result = scrape_account(username, password, account.account_code)

    if not scrape_result.get("ok"):
        message = scrape_result.get("message") or "Sygnia scrape failed."
        _mark_sync_error(db, account, message)
        return {"ok": False, "message": message, "account_id": account_id}

    try:
        persist_scrape(db, account, scrape_result, source)
        _mark_sync_success(db, account, scrape_result)
        db.commit()
        return {
            "ok": True,
            "message": scrape_result.get("message") or "Sync completed.",
            "account_id": account_id,
            "as_of_date": scrape_result.get("as_of_date"),
        }
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.exception(
            "Sygnia persist failed for account_id=%s",
            account_id,
            extra={"account_id": account_id, "source": source},
        )
        account = (
            db.query(SygniaAccount)
            .filter(SygniaAccount.id == account_id)
            .first()
        )
        if account is not None:
            _mark_sync_error(db, account, str(exc))
        return {"ok": False, "message": str(exc), "account_id": account_id}


def run_scheduled_sygnia_sync() -> None:
    """Sync all connected Sygnia accounts; isolate failures per account."""
    db = SessionLocal()
    try:
        account_ids = [row[0] for row in db.query(SygniaAccount.id).order_by(SygniaAccount.id).all()]
        logger.info(
            "Sygnia scheduled sync started",
            extra={"account_count": len(account_ids), "job": "run_scheduled_sygnia_sync"},
        )

        for account_id in account_ids:
            try:
                result = sync_account(db, account_id, "scheduled")
                if not result.get("ok"):
                    logger.warning(
                        "Sygnia scheduled sync failed for account_id=%s: %s",
                        account_id,
                        result.get("message"),
                        extra={"account_id": account_id, "job": "run_scheduled_sygnia_sync"},
                    )
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "Sygnia scheduled sync raised for account_id=%s: %s: %s",
                    account_id,
                    type(exc).__name__,
                    exc,
                    extra={"account_id": account_id, "job": "run_scheduled_sygnia_sync"},
                )
                db.rollback()

        logger.info("Sygnia scheduled sync completed", extra={"job": "run_scheduled_sygnia_sync"})
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Sygnia scheduled sync job failed: %s: %s",
            type(exc).__name__,
            exc,
            extra={"job": "run_scheduled_sygnia_sync"},
        )
    finally:
        db.close()


def _parse_as_of_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        return date.fromisoformat(value)
    return None


def _mark_sync_success(db: Session, account: SygniaAccount, scrape_result: dict) -> None:
    account.last_synced_at = get_sast_now()
    account.last_sync_status = "ok"
    account.last_sync_error = None
    as_of_date = _parse_as_of_date(scrape_result.get("as_of_date"))
    if as_of_date is not None:
        account.as_of_date = as_of_date


def _mark_sync_error(db: Session, account: SygniaAccount, message: str) -> None:
    account.last_synced_at = get_sast_now()
    account.last_sync_status = "error"
    account.last_sync_error = message
    db.commit()
