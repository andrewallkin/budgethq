"""High-level Sygnia scrape orchestration for Investments 2.0."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from time import monotonic
from zoneinfo import ZoneInfo

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from .accounts_browser import login_and_open_summary, read_accounts, select_account
from .extract import clean_html, enrich_summary_with_portfolio_value, extract_all
from .login import launch_chromium

logger = logging.getLogger(__name__)

JOHANNESBURG = ZoneInfo("Africa/Johannesburg")


def _playwright_unavailable() -> dict:
    return {
        "ok": False,
        "message": "Playwright is not installed on the backend. Install playwright and Chromium.",
    }


def _yesterday_johannesburg() -> date:
    now = datetime.now(JOHANNESBURG)
    return (now - timedelta(days=1)).date()


def test_login_and_list_accounts(username: str, password: str) -> dict:
    """
    Log in and list Kendo accounts without persisting credentials or data.

    Returns {"ok", "message", "accounts": [...]}.
    Account items include only API-mapped metadata fields.
    """
    username = (username or "").strip()
    password = password or ""
    if not username or not password:
        return {"ok": False, "message": "Username and password are required.", "accounts": []}

    try:
        import playwright  # noqa: F401
    except ImportError:
        logger.error("Sygnia test login aborted: Playwright is not installed")
        return {**_playwright_unavailable(), "accounts": []}

    logger.info("Sygnia test_login_and_list_accounts starting")
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            login_error = login_and_open_summary(page, username, password)
            if login_error:
                logger.warning("Sygnia test login failed: %s", login_error)
                return {"ok": False, "message": login_error, "accounts": []}

            accounts, list_error = read_accounts(page)
            if list_error:
                logger.warning("Sygnia test login list failed: %s", list_error)
                return {"ok": False, "message": list_error, "accounts": []}

            logger.info("Sygnia test login succeeded, accounts=%s", len(accounts))
            return {
                "ok": True,
                "message": f"Found {len(accounts)} Sygnia account(s).",
                "accounts": accounts,
            }
        except PlaywrightTimeoutError as exc:
            logger.exception("Sygnia login/list timed out")
            return {"ok": False, "message": f"Timed out: {exc}", "accounts": []}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Sygnia login/list failed")
            return {
                "ok": False,
                "message": f"Unexpected error during login/list: {exc}",
                "accounts": [],
            }
        finally:
            logger.info("Sygnia test_login_and_list_accounts closing browser")
            browser.close()


def scrape_account(username: str, password: str, account_code: str) -> dict:
    """
    Log in, select account_code, and extract the Investments Summary page.

    Returns {"ok", "message", "account_meta", "summary", "as_of_date"}.
    as_of_date is yesterday in Africa/Johannesburg (T−1 semantics).
    """
    username = (username or "").strip()
    password = password or ""
    account_code = (account_code or "").strip()
    if not username or not password:
        return _scrape_failure("Username and password are required.")
    if not account_code:
        return _scrape_failure("account_code is required.")

    try:
        import playwright  # noqa: F401
    except ImportError:
        logger.error("Sygnia scrape aborted: Playwright is not installed")
        return _scrape_failure(_playwright_unavailable()["message"])

    as_of_date = _yesterday_johannesburg()
    started = monotonic()
    logger.info("Sygnia scrape starting account_code=%s as_of_date=%s", account_code, as_of_date.isoformat())

    with sync_playwright() as p:
        browser = launch_chromium(p, headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            login_error = login_and_open_summary(page, username, password)
            if login_error:
                logger.warning(
                    "Sygnia scrape login failed account_code=%s elapsed_ms=%s: %s",
                    account_code,
                    int((monotonic() - started) * 1000),
                    login_error,
                )
                return _scrape_failure(login_error, as_of_date=as_of_date)

            accounts, list_error = read_accounts(page)
            if list_error:
                logger.warning(
                    "Sygnia scrape list failed account_code=%s elapsed_ms=%s: %s",
                    account_code,
                    int((monotonic() - started) * 1000),
                    list_error,
                )
                return _scrape_failure(list_error, as_of_date=as_of_date)

            account_meta = next(
                (a for a in accounts if (a.get("accountCode") or "") == account_code),
                None,
            )
            if account_meta is None:
                message = f"Account {account_code} was not found for this login."
                logger.warning(
                    "Sygnia scrape %s available=%s elapsed_ms=%s",
                    message,
                    [a.get("accountCode") for a in accounts],
                    int((monotonic() - started) * 1000),
                )
                return _scrape_failure(message, as_of_date=as_of_date)

            select_error = select_account(page, account_code)
            if select_error:
                logger.warning(
                    "Sygnia scrape select failed account_code=%s elapsed_ms=%s: %s",
                    account_code,
                    int((monotonic() - started) * 1000),
                    select_error,
                )
                return _scrape_failure(select_error, as_of_date=as_of_date, account_meta=account_meta)

            logger.info("Sygnia scrape extracting HTML account_code=%s", account_code)
            cleaned_html, _ = clean_html(page.content())
            summary = enrich_summary_with_portfolio_value(extract_all(cleaned_html))
            holdings = (summary.get("investment_summary") or {}).get("rows") or []
            logger.info(
                "Sygnia scrape succeeded account_code=%s holdings=%s portfolio_value=%s elapsed_ms=%s",
                account_code,
                len(holdings),
                summary.get("portfolio_value"),
                int((monotonic() - started) * 1000),
            )

            return {
                "ok": True,
                "message": f"Scraped account {account_code}.",
                "account_meta": account_meta,
                "summary": summary,
                "as_of_date": as_of_date.isoformat(),
            }
        except PlaywrightTimeoutError as exc:
            logger.exception(
                "Sygnia scrape timed out for account=%s elapsed_ms=%s",
                account_code,
                int((monotonic() - started) * 1000),
            )
            return _scrape_failure(f"Timed out: {exc}", as_of_date=as_of_date)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Sygnia scrape failed for account=%s elapsed_ms=%s",
                account_code,
                int((monotonic() - started) * 1000),
            )
            return _scrape_failure(
                f"Unexpected error during scrape: {exc}",
                as_of_date=as_of_date,
            )
        finally:
            logger.info("Sygnia scrape closing browser account_code=%s", account_code)
            browser.close()


def _scrape_failure(
    message: str,
    *,
    as_of_date: date | None = None,
    account_meta: dict | None = None,
) -> dict:
    return {
        "ok": False,
        "message": message,
        "account_meta": account_meta or {},
        "summary": {},
        "as_of_date": (as_of_date or _yesterday_johannesburg()).isoformat(),
    }
