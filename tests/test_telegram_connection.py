"""Tests for per-user Telegram webhook connection helpers."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import telegram_connection


class TestWebhookUrl:
    def test_builds_path_without_double_slash(self):
        url = telegram_connection.webhook_url(
            "https://budgethq.example.com/", "abc123"
        )
        assert url == "https://budgethq.example.com/api/telegram/investec/webhook/abc123"

    def test_builds_path_when_base_has_no_trailing_slash(self):
        url = telegram_connection.webhook_url(
            "https://budgethq.example.com", "secret"
        )
        assert url == "https://budgethq.example.com/api/telegram/investec/webhook/secret"


class TestGenerateWebhookSecret:
    def test_returns_url_safe_non_empty_string(self):
        secret = telegram_connection.generate_webhook_secret()
        assert isinstance(secret, str)
        assert secret
        assert secret == secret.strip()
        assert all(c.isalnum() or c in "-_" for c in secret)


class TestConnectTelegram:
    def test_raises_when_public_url_blank(self):
        user = MagicMock()
        user.telegram_bot_token = None
        user.telegram_allowed_user_id = None
        user.telegram_webhook_secret = None
        set_webhook = MagicMock()

        with pytest.raises(ValueError, match="Public URL is not configured"):
            telegram_connection.connect_telegram(
                user,
                "bot-token",
                12345,
                "",
                set_webhook,
            )

        set_webhook.assert_not_called()
        assert user.telegram_bot_token is None
        assert user.telegram_allowed_user_id is None
        assert user.telegram_webhook_secret is None

    def test_calls_set_webhook_then_persists_encrypted_fields(self):
        user = MagicMock()
        user.telegram_bot_token = None
        user.telegram_allowed_user_id = None
        user.telegram_webhook_secret = None
        set_webhook = MagicMock()

        with patch(
            "app.telegram_connection.generate_webhook_secret",
            return_value="whsec",
        ), patch(
            "app.telegram_connection.encrypt_api_key",
            return_value="encrypted-token",
        ) as mock_encrypt:
            telegram_connection.connect_telegram(
                user,
                "plain-token",
                99,
                "https://app.example.com",
                set_webhook,
            )

        set_webhook.assert_called_once_with(
            "plain-token",
            "https://app.example.com/api/telegram/investec/webhook/whsec",
        )
        mock_encrypt.assert_called_once_with("plain-token")
        assert user.telegram_bot_token == "encrypted-token"
        assert user.telegram_allowed_user_id == 99
        assert user.telegram_webhook_secret == "whsec"

    def test_does_not_persist_when_set_webhook_raises(self):
        user = MagicMock()
        user.telegram_bot_token = "existing"
        user.telegram_allowed_user_id = 1
        user.telegram_webhook_secret = "old-secret"
        set_webhook = MagicMock(side_effect=RuntimeError("Telegram error"))

        with patch(
            "app.telegram_connection.generate_webhook_secret",
            return_value="new-secret",
        ):
            with pytest.raises(RuntimeError, match="Telegram error"):
                telegram_connection.connect_telegram(
                    user,
                    "token",
                    2,
                    "https://app.example.com",
                    set_webhook,
                )

        assert user.telegram_bot_token == "existing"
        assert user.telegram_allowed_user_id == 1
        assert user.telegram_webhook_secret == "old-secret"


class TestDisconnectTelegram:
    def test_deletes_webhook_and_clears_fields(self):
        user = MagicMock()
        user.telegram_bot_token = "stored"
        user.telegram_allowed_user_id = 42
        user.telegram_webhook_secret = "whsec"
        delete_webhook = MagicMock()

        with patch(
            "app.telegram_connection.decrypt_api_key",
            return_value="decrypted",
        ) as mock_decrypt:
            telegram_connection.disconnect_telegram(user, delete_webhook)

        mock_decrypt.assert_called_once_with("stored")
        delete_webhook.assert_called_once_with("decrypted")
        assert user.telegram_bot_token is None
        assert user.telegram_allowed_user_id is None
        assert user.telegram_webhook_secret is None


class TestRegisterSavedWebhooks:
    def test_skips_when_public_url_blank(self):
        set_webhook = MagicMock()
        users = [MagicMock(telegram_bot_token="t", telegram_webhook_secret="s")]

        telegram_connection.register_saved_webhooks(users, "", set_webhook)

        set_webhook.assert_not_called()

    def test_registers_each_user_with_token_and_secret(self):
        user_ok = MagicMock()
        user_ok.telegram_bot_token = "enc1"
        user_ok.telegram_webhook_secret = "sec1"
        user_missing_secret = MagicMock()
        user_missing_secret.telegram_bot_token = "enc2"
        user_missing_secret.telegram_webhook_secret = None
        user_missing_token = MagicMock()
        user_missing_token.telegram_bot_token = None
        user_missing_token.telegram_webhook_secret = "sec3"

        set_webhook = MagicMock()

        with patch(
            "app.telegram_connection.decrypt_api_key",
            side_effect=lambda value: f"plain-{value}",
        ):
            telegram_connection.register_saved_webhooks(
                [user_ok, user_missing_secret, user_missing_token],
                "https://app.example.com",
                set_webhook,
            )

        set_webhook.assert_called_once_with(
            "plain-enc1",
            "https://app.example.com/api/telegram/investec/webhook/sec1",
        )