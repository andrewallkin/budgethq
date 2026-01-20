
from datetime import datetime, timedelta, timezone, date

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

