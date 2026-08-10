"""Sygnia Alchemy Playwright login helpers."""

from __future__ import annotations

import logging

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

TARGET_URL = "https://online.sygnia.com/Alchemy/Investments/Summary"
DUMP_SETTLE_MS = 5_000


def _username_field(page):
    field = page.get_by_placeholder("Username", exact=False)
    if field.count() == 0:
        field = page.get_by_label("Username", exact=False)
    if field.count() == 0:
        field = page.locator(
            'input[type="text"], input[type="email"], '
            'input[name*="User" i], input[id*="User" i]'
        ).first
    else:
        field = field.first
    return field


def _password_field(page):
    field = page.get_by_placeholder("Password", exact=False)
    if field.count() == 0:
        field = page.get_by_label("Password", exact=False)
    if field.count() == 0:
        field = page.locator('input[type="password"]').first
    else:
        field = field.first
    return field


def fill_login(page, username: str, password: str) -> None:
    """Two-step Alchemy login: Username → Next, then Password → Login."""
    page.wait_for_load_state("domcontentloaded")

    user_field = _username_field(page)
    user_field.wait_for(state="visible", timeout=30_000)
    user_field.fill(username)
    page.get_by_role("button", name="Next").click()

    password_field = _password_field(page)
    password_field.wait_for(state="visible", timeout=30_000)
    password_field.fill(password)
    page.get_by_role("button", name="Login").click()


def looks_logged_in(page) -> bool:
    url = page.url.lower()
    if "login" in url or "signin" in url or "account/login" in url:
        return False
    if "investments/summary" in url:
        return True
    if page.get_by_role("button", name="Next").count() > 0:
        return False
    if page.get_by_role("button", name="Login").count() > 0:
        return False
    if page.locator('input[type="password"]').count() > 0:
        return False
    return "/alchemy/" in url


def on_login_flow(page) -> bool:
    """True when the username step (or password step) is visible."""
    if page.get_by_role("button", name="Next").count() > 0:
        return True
    if page.get_by_placeholder("Username", exact=False).count() > 0:
        return True
    if page.locator('input[type="password"]').count() > 0:
        return True
    return False


def test_login(username: str, password: str, *, headless: bool = True) -> dict:
    """
    Exercise only the username/password login path.

    Returns {"ok": bool, "message": str, "url": str}.
    Never raises for auth failure — only for unexpected infrastructure errors.
    """
    username = (username or "").strip()
    password = password or ""
    if not username or not password:
        return {"ok": False, "message": "Username and password are required.", "url": ""}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context()
        page = context.new_page()
        try:
            page.goto(TARGET_URL, wait_until="domcontentloaded")

            if not on_login_flow(page):
                page.wait_for_timeout(3_000)

            if on_login_flow(page):
                fill_login(page, username, password)
                page.wait_for_load_state("networkidle", timeout=60_000)

            page.wait_for_timeout(2_000)

            if looks_logged_in(page):
                return {
                    "ok": True,
                    "message": "Sygnia login succeeded.",
                    "url": page.url,
                }

            return {
                "ok": False,
                "message": "Login failed — still on the sign-in page or summary did not load.",
                "url": page.url,
            }
        except PlaywrightTimeoutError as exc:
            return {
                "ok": False,
                "message": f"Login timed out: {exc}",
                "url": page.url if page else "",
            }
        finally:
            browser.close()


def dismiss_post_login_modals(page, *, max_modals: int = 5) -> None:
    """Dismiss stacked post-login promos (each has a Hide button)."""
    dismissed = 0
    for _ in range(max_modals):
        hide = page.get_by_role("button", name="Hide")
        try:
            hide.first.wait_for(state="visible", timeout=3_000)
        except PlaywrightTimeoutError:
            break
        hide.first.click()
        dismissed += 1
        page.wait_for_timeout(500)

    if dismissed:
        logger.debug("Dismissed %d Sygnia promo modal(s)", dismissed)
