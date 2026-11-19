from __future__ import annotations

from fastmcp.server.dependencies import get_http_headers
from mcp.server.auth.provider import AccessToken

from app.database import SessionLocal
from app.models import User
from app.mcp.oauth_store import SqlOAuthRepository

oauth_grants = SqlOAuthRepository()


class McpAuthError(Exception):
    pass


def extract_bearer_token(headers: dict[str, str]) -> str:
    authorization = headers.get("authorization") or headers.get("Authorization") or ""
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise McpAuthError("Missing Authorization bearer token")
    return token.strip()


def require_mcp_user() -> User:
    token = extract_bearer_token(dict(get_http_headers(include={"authorization"})))
    with SessionLocal() as db:
        user_id = oauth_grants.user_id_for_access_token(token)
        if user_id is None:
            raise McpAuthError("Invalid or expired MCP access token")
        user = db.get(User, user_id)
        if user is None:
            raise McpAuthError("Invalid or expired MCP access token")
        return user