"""Per-user Telegram bot webhook connect, disconnect, and startup registration."""
import re
import secrets

import requests

from .utils import decrypt_api_key, encrypt_api_key

_BOT_TOKEN_IN_URL = re.compile(r"/bot[^/\s]+")


def telegram_failure_text(exc: BaseException) -> str:
    """Telegram's reason, without the bot token that requests puts in the URL."""
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        description = ""
        try:
            payload = exc.response.json()
        except ValueError:
            payload = None
        if isinstance(payload, dict):
            description = str(payload.get("description") or "")
        if description:
            return f"Telegram HTTP {exc.response.status_code}: {description}"
        return f"Telegram HTTP {exc.response.status_code}"
    return _BOT_TOKEN_IN_URL.sub("/bot[redacted]", str(exc))


def webhook_url(public_base_url: str, secret: str) -> str:
    base = public_base_url.rstrip("/")
    return f"{base}/api/telegram/investec/webhook/{secret}"


def generate_webhook_secret() -> str:
    return secrets.token_urlsafe(32)


def _public_base_url_configured(public_base_url: str) -> bool:
    return bool(public_base_url and str(public_base_url).strip())


def connect_telegram(
    user,
    bot_token: str,
    allowed_user_id: int,
    public_base_url: str,
    set_webhook,
) -> None:
    if not _public_base_url_configured(public_base_url):
        raise ValueError("Public URL is not configured")

    secret = generate_webhook_secret()
    url = webhook_url(public_base_url, secret)
    set_webhook(bot_token, url)

    user.telegram_bot_token = encrypt_api_key(bot_token)
    user.telegram_allowed_user_id = allowed_user_id
    user.telegram_webhook_secret = secret


def disconnect_telegram(user, delete_webhook) -> None:
    token = decrypt_api_key(user.telegram_bot_token)
    delete_webhook(token)
    user.telegram_bot_token = None
    user.telegram_allowed_user_id = None
    user.telegram_webhook_secret = None


def register_saved_webhooks(users, public_base_url: str, set_webhook) -> None:
    if not _public_base_url_configured(public_base_url):
        return

    for user in users:
        if not user.telegram_bot_token or not user.telegram_webhook_secret:
            continue
        token = decrypt_api_key(user.telegram_bot_token)
        url = webhook_url(public_base_url, user.telegram_webhook_secret)
        set_webhook(token, url)