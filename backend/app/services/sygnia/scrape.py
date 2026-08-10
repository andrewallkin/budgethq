"""High-level Sygnia scrape orchestration for Investments 2.0."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from .accounts_browser import login_and_open_summary, read_accounts, select_account
from .extract import clean_html, enrich_summary_with_portfolio_value, extract_all

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
        return {**_playwright_unavailable(), "accounts": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            login_error = login_and_open_summary(page, username, password)
            if login_error:
                return {"ok": False, "message": login_error, "accounts": []}

            accounts, list_error = read_accounts(page)
            if list_error:
                return {"ok": False, "message": list_error, "accounts": []}

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
        return _scrape_failure(_playwright_unavailable()["message"])

    as_of_date = _yesterday_johannesburg()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            login_error = login_and_open_summary(page, username, password)
            if login_error:
                return _scrape_failure(login_error, as_of_date=as_of_date)

            accounts, list_error = read_accounts(page)
            if list_error:
                return _scrape_failure(list_error, as_of_date=as_of_date)

            account_meta = next(
                (a for a in accounts if (a.get("accountCode") or "") == account_code),
                None,
            )
            if account_meta is None:
                return _scrape_failure(
                    f"Account {account_code} was not found for this login.",
                    as_of_date=as_of_date,
                )

            select_error = select_account(page, account_code)
            if select_error:
                return _scrape_failure(select_error, as_of_date=as_of_date, account_meta=account_meta)

            cleaned_html, _ = clean_html(page.content())
            summary = enrich_summary_with_portfolio_value(extract_all(cleaned_html))

            return {
                "ok": True,
                "message": f"Scraped account {account_code}.",
                "account_meta": account_meta,
                "summary": summary,
                "as_of_date": as_of_date.isoformat(),
            }
        except PlaywrightTimeoutError as exc:
            logger.exception("Sygnia scrape timed out for account=%s", account_code)
            return _scrape_failure(f"Timed out: {exc}", as_of_date=as_of_date)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Sygnia scrape failed for account=%s", account_code)
            return _scrape_failure(
                f"Unexpected error during scrape: {exc}",
                as_of_date=as_of_date,
            )
        finally:
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
