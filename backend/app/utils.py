
from datetime import datetime, timedelta, timezone

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
