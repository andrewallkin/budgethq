"""Sygnia Kendo account selector helpers (list + select by accountCode)."""

from __future__ import annotations

import logging

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError

from .login import (
    DUMP_SETTLE_MS,
    TARGET_URL,
    attach_page_debug_listeners,
    dismiss_post_login_modals,
    fill_login,
    looks_logged_in,
    on_login_flow,
    page_snapshot,
    wait_after_navigation,
)

logger = logging.getLogger(__name__)

ACCOUNT_SELECTOR_WAIT_MS = 30_000
POST_SELECT_SETTLE_MS = DUMP_SETTLE_MS

ACCOUNT_API_FIELDS = (
    "accountCode",
    "accountTypeName",
    "accountTypeCode",
    "foreignAllocation",
    "reg28Compliant",
)

LIST_ACCOUNTS_JS = """() => {
  const widget = window.jQuery
    ? window.jQuery("#accountSelector").data("kendoComboBox")
    : null;
  if (!widget) {
    return { ok: false, error: "kendoComboBox not found on #accountSelector", accounts: [] };
  }
  const raw = widget.dataSource.data();
  const accounts = Array.from(raw).map((item) => {
    const plain = typeof item?.toJSON === "function" ? item.toJSON() : { ...item };
    const reg28 = plain.currentReg28Compliance || {};
    return {
      accountCode: plain.accountCode ?? plain.AccountCode ?? null,
      accountName: plain.accountName ?? plain.AccountName ?? null,
      accountTypeName: plain.accountTypeName ?? plain.AccountTypeName ?? null,
      accountTypeCode: plain.accountTypeCode ?? plain.AccountTypeCode ?? null,
      accountTypeDescription:
        plain.accountTypeDescription ?? plain.AccountTypeDescription ?? null,
      reg28Compliant: reg28.isCompliant ?? null,
      equityAllocation: reg28.equityAllocation ?? null,
      propertyAllocation: reg28.propertyAllocation ?? null,
      foreignAllocation: reg28.foreignAllocation ?? null,
      foreignAfricaAllocation: reg28.foreignAfricaAllocation ?? null,
      alternativeAllocation: reg28.alternativeAllocation ?? null,
    };
  });
  return { ok: true, error: null, accounts };
}"""

SELECT_ACCOUNT_JS = """(accountCode) => {
  const widget = window.jQuery
    ? window.jQuery("#accountSelector").data("kendoComboBox")
    : null;
  if (!widget) {
    return { ok: false, error: "kendoComboBox not found on #accountSelector" };
  }
  const match = widget.dataSource.data().find((item) => {
    const plain = typeof item?.toJSON === "function" ? item.toJSON() : item;
    const code = plain.accountCode ?? plain.AccountCode;
    return code === accountCode;
  });
  if (!match) {
    return { ok: false, error: `Account not in dataSource: ${accountCode}` };
  }
  widget.value(accountCode);
  widget.trigger("change");
  return { ok: true, value: widget.value() };
}"""


def map_account_for_api(raw: dict) -> dict:
    """Keep only fields persisted / exposed by the Investments 2.0 API."""
    return {field: raw.get(field) for field in ACCOUNT_API_FIELDS}


def wait_for_account_selector(page: Page) -> None:
    page.locator("#accountSelector").wait_for(
        state="attached", timeout=ACCOUNT_SELECTOR_WAIT_MS
    )
    page.wait_for_function(
        """() => {
          const w = window.jQuery && window.jQuery("#accountSelector").data("kendoComboBox");
          return !!(w && w.dataSource && w.dataSource.data().length > 0);
        }""",
        timeout=ACCOUNT_SELECTOR_WAIT_MS,
    )


def read_accounts(page: Page) -> tuple[list[dict], str | None]:
    """Return (mapped accounts, error message)."""
    result = page.evaluate(LIST_ACCOUNTS_JS)
    if not result.get("ok"):
        error = str(result.get("error") or "Failed to read Sygnia accounts.")
        logger.warning("Sygnia read_accounts failed: %s (%s)", error, page_snapshot(page))
        return [], error
    raw_accounts = result.get("accounts") or []
    mapped = [map_account_for_api(a) for a in raw_accounts]
    codes = [a.get("accountCode") for a in mapped]
    logger.info("Sygnia read_accounts count=%s codes=%s (%s)", len(mapped), codes, page_snapshot(page))
    return mapped, None


def select_account(page: Page, account_code: str) -> str | None:
    """Select account by code. Returns error message on failure."""
    logger.info("Sygnia select_account code=%s (%s)", account_code, page_snapshot(page))
    result = page.evaluate(SELECT_ACCOUNT_JS, account_code)
    if not result.get("ok"):
        error = str(result.get("error") or f"Failed to select account {account_code}.")
        logger.warning("Sygnia select_account failed: %s (%s)", error, page_snapshot(page))
        return error
    logger.info("Sygnia select_account value=%s, waiting for summary", result.get("value"))
    wait_after_navigation(page)
    page.wait_for_timeout(POST_SELECT_SETTLE_MS)
    logger.info("Sygnia select_account settled (%s)", page_snapshot(page))
    return None


def login_and_open_summary(page: Page, username: str, password: str) -> str | None:
    """
    Navigate, log in, dismiss modals, and wait for the account selector.

    Returns None on success or an error message.
    """
    attach_page_debug_listeners(page)
    logger.info("Sygnia login_and_open_summary: goto %s", TARGET_URL)
    page.goto(TARGET_URL, wait_until="domcontentloaded")
    logger.info(
        "Sygnia after goto on_login_flow=%s looks_logged_in=%s (%s)",
        on_login_flow(page),
        looks_logged_in(page),
        page_snapshot(page),
    )

    if not on_login_flow(page):
        logger.info("Sygnia login form not visible yet; waiting 3s")
        page.wait_for_timeout(3_000)
        logger.info(
            "Sygnia after wait on_login_flow=%s looks_logged_in=%s (%s)",
            on_login_flow(page),
            looks_logged_in(page),
            page_snapshot(page),
        )

    if on_login_flow(page):
        fill_login(page, username, password)
        wait_after_navigation(page)

    if not looks_logged_in(page):
        message = "Login did not reach Investments Summary."
        logger.warning("Sygnia %s (%s)", message, page_snapshot(page))
        return message

    logger.info("Sygnia login looks successful; dismissing modals (%s)", page_snapshot(page))
    dismiss_post_login_modals(page)
    page.wait_for_timeout(DUMP_SETTLE_MS)

    try:
        logger.info("Sygnia waiting for #accountSelector")
        wait_for_account_selector(page)
    except PlaywrightTimeoutError as exc:
        message = f"Account selector did not load: {exc}"
        logger.warning("Sygnia %s (%s)", message, page_snapshot(page))
        return message

    logger.info("Sygnia account selector ready (%s)", page_snapshot(page))
    return None
