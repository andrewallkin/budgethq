"""Tests for the authorized-users allowlist (empty list = open access)."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth
from app.config import get_settings
from app.routers.auth import router as auth_router


@pytest.fixture(autouse=True)
def _fresh_settings_cache():
    yield
    get_settings.cache_clear()


def _set_authorized_users(monkeypatch, value: str) -> None:
    monkeypatch.setenv("AUTHORIZED_USERS", value)
    get_settings.cache_clear()


def _make_client(db: MagicMock, current_user=None) -> TestClient:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")

    def override_get_db():
        yield db

    from app import database

    app.dependency_overrides[database.get_db] = override_get_db
    if current_user is not None:
        async def override_get_current_user():
            return current_user

        app.dependency_overrides[auth.get_current_user] = override_get_current_user
    return TestClient(app)


class TestAuthorizedUsersHelpers:
    def test_get_authorized_users_list_empty_when_empty_value(self, monkeypatch):
        _set_authorized_users(monkeypatch, "")
        assert auth.get_authorized_users_list() == []

    def test_get_authorized_users_list_parses_comma_separated(self, monkeypatch):
        _set_authorized_users(monkeypatch, "a@example.com, b@example.com")
        assert auth.get_authorized_users_list() == ["a@example.com", "b@example.com"]

    def test_get_authorized_users_list_ignores_blank_entries(self, monkeypatch):
        _set_authorized_users(monkeypatch, "a@example.com, , b@example.com,")
        assert auth.get_authorized_users_list() == ["a@example.com", "b@example.com"]

    def test_ensure_username_authorized_noop_when_in_list(self, monkeypatch):
        _set_authorized_users(monkeypatch, "allowed@example.com")
        auth.ensure_username_authorized("allowed@example.com")

    def test_ensure_username_authorized_raises_when_not_in_list(self, monkeypatch):
        _set_authorized_users(monkeypatch, "allowed@example.com")
        with pytest.raises(HTTPException) as exc_info:
            auth.ensure_username_authorized("other@example.com", context="registration")
        assert exc_info.value.status_code == 403

    def test_ensure_username_authorized_noop_when_allowlist_empty(self, monkeypatch):
        _set_authorized_users(monkeypatch, "")
        auth.ensure_username_authorized("other@example.com")


class TestAuthConfigEndpoint:
    def test_config_reports_restricted_when_allowlist_populated(self, monkeypatch):
        _set_authorized_users(monkeypatch, "allowed@example.com")
        client = _make_client(MagicMock())
        response = client.get("/api/auth/config")
        assert response.status_code == 200
        assert response.json() == {"restrict_authorized_users": True}

    def test_config_reports_open_when_allowlist_empty(self, monkeypatch):
        _set_authorized_users(monkeypatch, "")
        client = _make_client(MagicMock())
        response = client.get("/api/auth/config")
        assert response.status_code == 200
        assert response.json() == {"restrict_authorized_users": False}


class TestRegisterAuthorizedUsers:
    def test_register_allowed_when_in_list(self, monkeypatch):
        _set_authorized_users(monkeypatch, "allowed@example.com")

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        client = _make_client(db)

        response = client.post(
            "/api/auth/register",
            json={"username": "allowed@example.com", "password": "secret12"},
        )

        assert response.status_code == 200
        assert "access_token" in response.json()
        db.add.assert_called_once()
        db.commit.assert_called_once()

    def test_register_denied_when_not_in_list(self, monkeypatch):
        _set_authorized_users(monkeypatch, "allowed@example.com")

        db = MagicMock()
        client = _make_client(db)

        response = client.post(
            "/api/auth/register",
            json={"username": "other@example.com", "password": "secret12"},
        )

        assert response.status_code == 403
        db.add.assert_not_called()

    def test_register_allowed_when_allowlist_empty(self, monkeypatch):
        _set_authorized_users(monkeypatch, "")

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        client = _make_client(db)

        response = client.post(
            "/api/auth/register",
            json={"username": "any@example.com", "password": "secret12"},
        )

        assert response.status_code == 200
        assert "access_token" in response.json()


class TestLoginAuthorizedUsers:
    def test_login_allowed_when_on_allowlist(self, monkeypatch):
        _set_authorized_users(monkeypatch, "allowed@example.com")

        user = MagicMock()
        user.id = 1
        user.username = "allowed@example.com"
        user.hashed_password = auth.get_password_hash("secret12")

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = user
        client = _make_client(db)

        response = client.post(
            "/api/auth/login",
            data={"username": "allowed@example.com", "password": "secret12"},
        )

        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_login_denied_when_not_in_list(self, monkeypatch):
        _set_authorized_users(monkeypatch, "allowed@example.com")

        user = MagicMock()
        user.id = 1
        user.username = "other@example.com"
        user.hashed_password = auth.get_password_hash("secret12")

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = user
        client = _make_client(db)

        response = client.post(
            "/api/auth/login",
            data={"username": "other@example.com", "password": "secret12"},
        )

        assert response.status_code == 403


class TestChangeUsernameAuthorizedUsers:
    def test_change_username_allowed_when_in_list(self, monkeypatch):
        _set_authorized_users(monkeypatch, "new@example.com")

        current_user = MagicMock()
        current_user.id = 1
        current_user.username = "old@example.com"

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        client = _make_client(db, current_user=current_user)

        response = client.put(
            "/api/auth/user/username",
            json={"username": "new@example.com"},
        )

        assert response.status_code == 200
        assert current_user.username == "new@example.com"
        db.commit.assert_called_once()

    def test_change_username_denied_when_not_in_list(self, monkeypatch):
        _set_authorized_users(monkeypatch, "allowed@example.com")

        current_user = MagicMock()
        current_user.id = 1
        current_user.username = "old@example.com"

        db = MagicMock()
        client = _make_client(db, current_user=current_user)

        response = client.put(
            "/api/auth/user/username",
            json={"username": "other@example.com"},
        )

        assert response.status_code == 403
        db.commit.assert_not_called()
