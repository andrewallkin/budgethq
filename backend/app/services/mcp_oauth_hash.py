from __future__ import annotations

import hashlib
import hmac

from app.config import get_settings


def hash_oauth_token(raw_token: str) -> str:
    secret = get_settings().jwt_secret_key
    return hmac.new(secret.encode("utf-8"), raw_token.encode("utf-8"), hashlib.sha256).hexdigest()