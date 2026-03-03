"""
Optional request/response logging middleware.

Logs method, path, status_code, duration_ms for each request.
Disabled by default; set REQUEST_LOGGING=true to enable.
"""

import logging
import os
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)


def _redact_path(path: str) -> str:
    """Redact numeric IDs in path (e.g. /api/etf/holdings/123 -> /api/etf/holdings/{id})."""
    parts = path.split("/")
    redacted = []
    for p in parts:
        if p.isdigit():
            redacted.append("{id}")
        else:
            redacted.append(p)
    return "/".join(redacted)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log request method, path, status, duration. Optional via REQUEST_LOGGING env."""

    async def dispatch(self, request: Request, call_next):
        if os.getenv("REQUEST_LOGGING", "").lower() not in ("true", "1", "yes"):
            return await call_next(request)

        start = time.monotonic()
        method = request.method
        path = request.url.path
        redacted_path = _redact_path(path)
        request_id = getattr(request.state, "request_id", None)

        response = await call_next(request)
        duration_ms = int((time.monotonic() - start) * 1000)
        status = response.status_code

        logger.info(
            "%s %s %d %dms",
            method,
            redacted_path,
            status,
            duration_ms,
            extra={
                "request_id": request_id,
                "method": method,
                "path": redacted_path,
                "status_code": status,
                "duration_ms": duration_ms,
            },
        )
        return response
