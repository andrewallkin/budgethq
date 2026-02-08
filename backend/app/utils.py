
from datetime import datetime, timedelta, timezone, date
from cryptography.fernet import Fernet
import os
import base64

def get_sast_now():
    """
    Returns the current time in South Africa Standard Time (UTC+2).
    This ensures all recorded timestamps are in local time.
    """
    utc_now = datetime.now(timezone.utc)
    sast_offset = timedelta(hours=2)
    sast_now = utc_now.astimezone(timezone(sast_offset))
    # Return naive datetime representing local time to avoid db complexity if needed,
    # or keep timezone info. SQLAlchemy usually prefers naive UTC or timezone-aware if configured.
    # For this app, previous usage was datetime.utcnow() (naive UTC).
    # We will return naive datetime shifted to SAST to match user expectation of "seeing local time" in DB.
    return sast_now.replace(tzinfo=None)


def get_sa_financial_year_start(target_date: date | None = None) -> int:
    """
    Return the South African financial year start year for a given date.

    SA financial year runs from 1 March (year N) to end of Feb (year N+1).
    Example:
    - 2025-02-28  -> 2024 (FY 2024/25)
    - 2025-03-01  -> 2025 (FY 2025/26)
    """
    if target_date is None:
        target_date = get_sast_now().date()

    if target_date.month < 3:  # January or February
        return target_date.year - 1
    return target_date.year


def format_sa_financial_year_label(financial_year_start: int) -> str:
    """
    Format a financial year start into a human-readable label.

    Example:
    - 2024 -> "2024/25"
    - 2025 -> "2025/26"
    """
    short_end = (financial_year_start + 1) % 100
    return f"{financial_year_start}/{short_end:02d}"


# =====================================================
# Encryption Utilities for API Keys
# =====================================================

def get_encryption_key() -> bytes:
    """
    Get or generate encryption key from environment variable.
    The key should be a base64-encoded Fernet key.
    """
    key_str = os.getenv("ENCRYPTION_KEY")
    if not key_str:
        raise ValueError("ENCRYPTION_KEY environment variable not set")
    return key_str.encode()


def encrypt_api_key(api_key: str) -> str:
    """
    Encrypt an API key using Fernet symmetric encryption.
    Returns base64-encoded encrypted string.
    """
    if not api_key:
        return None
    
    fernet = Fernet(get_encryption_key())
    encrypted = fernet.encrypt(api_key.encode())
    return base64.b64encode(encrypted).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """
    Decrypt an encrypted API key.
    Returns the original API key string.
    """
    if not encrypted_key:
        return None
    
    fernet = Fernet(get_encryption_key())
    encrypted_bytes = base64.b64decode(encrypted_key.encode())
    decrypted = fernet.decrypt(encrypted_bytes)
    return decrypted.decode()

