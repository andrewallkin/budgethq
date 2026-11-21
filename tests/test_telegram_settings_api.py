"""Tests for Settings Telegram connect/disconnect API routes."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database
from app.routers.auth import router as auth_router


def _make_auth_client(db: MagicMock, current_user=None) -> TestClient:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db
    if current_user is not None:

        async def override_get_current_user():
            return current_user

        app.dependency_overrides[auth.get_current_user] = override_get_current_user
    return TestClient(app)


def _mock_settings(public_base_url: str = "https://budgethq.example.com"):
    settings = MagicMock()
    settings.public_base_url = public_base_url
    return settings


def _telegram_ok_response():
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"ok": True}
    return response


class TestTelegramSettingsGet:
    def test_not_connected(self):
        current_user = MagicMock()
        current_user.telegram_bot_token = None
        current_user.telegram_allowed_user_id = None
        client = _make_auth_client(MagicMock(), current_user=current_user)

        response = client.get("/api/auth/telegram")

        assert response.status_code == 200
        assert response.json() == {"connected": False, "allowed_user_id": None}
        assert "bot_token" not in response.json()

    def test_connected_returns_allowed_user_id_not_token(self):
        current_user = MagicMock()
        current_user.telegram_bot_token = "encrypted-stored"
        current_user.telegram_allowed_user_id = 123456789
        client = _make_auth_client(MagicMock(), current_user=current_user)

        response = client.get("/api/auth/telegram")

        assert response.status_code == 200
        body = response.json()
        assert body == {"connected": True, "allowed_user_id": 123456789}
        assert "bot_token" not in body


class TestTelegramSettingsPost:
    def test_save_registers_webhook_and_commits(self):
        current_user = MagicMock()
        current_user.telegram_bot_token = None
        current_user.telegram_allowed_user_id = None
        current_user.telegram_webhook_secret = None
        db = MagicMock()
        client = _make_auth_client(db, current_user=current_user)

        with patch("app.routers.auth.get_settings", return_value=_mock_settings()), patch(
            "app.routers.auth.requests.post",
            return_value=_telegram_ok_response(),
        ) as mock_post, patch(
            "app.telegram_connection.generate_webhook_secret",
            return_value="whsec-test",
        ), patch(
            "app.telegram_connection.encrypt_api_key",
            return_value="encrypted-token",
        ):
            response = client.post(
                "/api/auth/telegram",
                json={"bot_token": "123:ABC", "allowed_user_id": 999},
            )

        assert response.status_code == 200
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert call_args[0][0] == "https://api.telegram.org/bot123:ABC/setWebhook"
        assert call_args[1]["json"] == {
            "url": "https://budgethq.example.com/api/telegram/investec/webhook/whsec-test",
        }
        assert current_user.telegram_allowed_user_id == 999
        assert current_user.telegram_webhook_secret == "whsec-test"
        assert current_user.telegram_bot_token is not None
        db.commit.assert_called_once()

    def test_telegram_error_leaves_user_unchanged(self):
        current_user = MagicMock()
        current_user.telegram_bot_token = "existing-enc"
        current_user.telegram_allowed_user_id = 1
        current_user.telegram_webhook_secret = "old-secret"
        db = MagicMock()
        client = _make_auth_client(db, current_user=current_user)

        bad_response = MagicMock()
        bad_response.raise_for_status = MagicMock()
        bad_response.json.return_value = {"ok": False, "description": "Bad Request"}

        with patch("app.routers.auth.get_settings", return_value=_mock_settings()), patch(
            "app.routers.auth.requests.post",
            return_value=bad_response,
        ):
            response = client.post(
                "/api/auth/telegram",
                json={"bot_token": "123:NEW", "allowed_user_id": 2},
            )

        assert response.status_code == 400
        assert current_user.telegram_bot_token == "existing-enc"
        assert current_user.telegram_allowed_user_id == 1
        assert current_user.telegram_webhook_secret == "old-secret"
        db.commit.assert_not_called()


class TestTelegramSettingsDelete:
    def test_delete_clears_connection_and_commits(self):
        current_user = MagicMock()
        current_user.telegram_bot_token = "stored-enc"
        current_user.telegram_allowed_user_id = 42
        current_user.telegram_webhook_secret = "whsec"
        db = MagicMock()
        client = _make_auth_client(db, current_user=current_user)

        with patch(
            "app.telegram_connection.decrypt_api_key",
            return_value="123:PLAIN",
        ), patch(
            "app.routers.auth.requests.post",
            return_value=_telegram_ok_response(),
        ) as mock_post:
            response = client.delete("/api/auth/telegram")

        assert response.status_code == 200
        mock_post.assert_called_once_with(
            "https://api.telegram.org/bot123:PLAIN/deleteWebhook",
            timeout=30,
        )
        assert current_user.telegram_bot_token is None
        assert current_user.telegram_allowed_user_id is None
        assert current_user.telegram_webhook_secret is None
        db.commit.assert_called_once()