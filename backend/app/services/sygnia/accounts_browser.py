"""Sygnia Kendo account selector helpers (list + select by accountCode)."""

from __future__ import annotations

import logging

from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError

from .login import (
    DUMP_SETTLE_MS,
    TARGET_URL,
    dismiss_post_login_modals,
    fill_login,
    looks_logged_in,
    on_login_flow,
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
        return [], str(result.get("error") or "Failed to read Sygnia accounts.")
    raw_accounts = result.get("accounts") or []
    return [map_account_for_api(a) for a in raw_accounts], None


def select_account(page: Page, account_code: str) -> str | None:
    """Select account by code. Returns error message on failure."""
    result = page.evaluate(SELECT_ACCOUNT_JS, account_code)
    if not result.get("ok"):
        return str(result.get("error") or f"Failed to select account {account_code}.")
    logger.debug("Selected Sygnia account %s", result.get("value"))
    try:
        page.wait_for_load_state("networkidle", timeout=60_000)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(POST_SELECT_SETTLE_MS)
    return None


def login_and_open_summary(page: Page, username: str, password: str) -> str | None:
    """
    Navigate, log in, dismiss modals, and wait for the account selector.

    Returns None on success or an error message.
    """
    page.goto(TARGET_URL, wait_until="domcontentloaded")

    if not on_login_flow(page):
        page.wait_for_timeout(3_000)

    if on_login_flow(page):
        fill_login(page, username, password)
        page.wait_for_load_state("networkidle", timeout=60_000)

    page.wait_for_timeout(2_000)

    if not looks_logged_in(page):
        return "Login did not reach Investments Summary."

    dismiss_post_login_modals(page)
    page.wait_for_timeout(DUMP_SETTLE_MS)

    try:
        wait_for_account_selector(page)
    except PlaywrightTimeoutError as exc:
        return f"Account selector did not load: {exc}"

    return None
