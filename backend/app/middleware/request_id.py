import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from ..logging_config import request_id_var


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Generate or propagate X-Request-ID for request tracing."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        token = request_id_var.set(request_id)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            request_id_var.reset(token)
