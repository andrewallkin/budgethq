"""Tests for dashboard auth cookie helpers."""
import sys
from pathlib import Path

from fastapi import Response

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth
from app.config import get_settings


def test_auth_cookie_name_constant() -> None:
    assert auth.AUTH_COOKIE_NAME == "budgethq_auth"


def test_set_auth_cookie_uses_jwt_lifetime(monkeypatch) -> None:
    monkeypatch.setenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "45")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    get_settings.cache_clear()

    response = Response()
    auth.set_auth_cookie(response, "token-value")

    cookie_header = response.headers.get("set-cookie", "")
    assert auth.AUTH_COOKIE_NAME in cookie_header
    assert "Max-Age=2700" in cookie_header
    assert "Secure" in cookie_header
    get_settings.cache_clear()