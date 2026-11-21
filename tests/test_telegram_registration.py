"""Startup Telegram webhook re-registration with retry delays."""
import asyncio
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import telegram_registration


class TestEnsureTelegramWebhooks:
    def test_returns_immediately_when_public_url_blank(self):
        load_users = MagicMock(return_value=[])
        set_webhook = MagicMock()
        sleep = MagicMock()

        asyncio.run(
            telegram_registration.ensure_telegram_webhooks(
                load_users, "", set_webhook, sleep
            )
        )
        asyncio.run(
            telegram_registration.ensure_telegram_webhooks(
                load_users, "   ", set_webhook, sleep
            )
        )

        load_users.assert_not_called()
        set_webhook.assert_not_called()
        sleep.assert_not_called()

    def test_retries_with_30_second_delay_after_first_failure(self):
        user = MagicMock(telegram_bot_token="enc", telegram_webhook_secret="sec")
        load_users = MagicMock(return_value=[user])
        attempts = {"n": 0}
        delays = []

        def set_webhook(_token, _url):
            attempts["n"] += 1
            if attempts["n"] == 1:
                raise RuntimeError("Telegram down")

        async def sleep(seconds):
            delays.append(seconds)

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(
                "app.telegram_connection.decrypt_api_key",
                lambda value: f"plain-{value}",
            )
            asyncio.run(
                telegram_registration.ensure_telegram_webhooks(
                    load_users,
                    "https://app.example.com",
                    set_webhook,
                    sleep,
                )
            )

        assert attempts["n"] == 2
        assert delays == [30]

    def test_succeeds_without_sleep_when_registration_passes(self):
        load_users = MagicMock(return_value=[])
        set_webhook = MagicMock()
        delays = []

        async def sleep(seconds):
            delays.append(seconds)

        with pytest.MonkeyPatch.context() as mp:
            register = MagicMock()
            mp.setattr("app.telegram_registration.register_saved_webhooks", register)

            asyncio.run(
                telegram_registration.ensure_telegram_webhooks(
                    load_users,
                    "https://app.example.com",
                    set_webhook,
                    sleep,
                )
            )

        register.assert_called_once_with([], "https://app.example.com", set_webhook)
        assert delays == []