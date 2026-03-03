"""
PII redaction utilities for safe logging.

Never log: passwords, tokens, API keys, full credit card numbers.
"""

def redact_email(email: str | None) -> str:
    """Redact email to first char + ***@domain (e.g. u***@example.com)."""
    if not email or "@" not in email:
        return "***"
    local, domain = email.rsplit("@", 1)
    if len(local) <= 1:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"


def redact_account(account_id: str | None) -> str:
    """Mask account ID to last 4 characters only."""
    if not account_id:
        return "****"
    if len(account_id) <= 4:
        return "****"
    return f"****{account_id[-4:]}"


def redact_description(desc: str | None, max_len: int = 20) -> str:
    """Truncate description for logging; avoid full strings."""
    if not desc:
        return ""
    s = str(desc).strip()
    if len(s) <= max_len:
        return s
    return f"{s[:max_len]}..."


def redact_user_id(user_id: int | None) -> str:
    """Safe to log user IDs as-is; this exists for consistency if masking needed later."""
    return str(user_id) if user_id is not None else ""
