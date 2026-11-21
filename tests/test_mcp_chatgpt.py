import asyncio
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from fastapi import HTTPException
from fastapi import status as http_status
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import AnyUrl
from starlette.applications import Starlette
from starlette.testclient import TestClient

from app.mcp.auth import McpAuthError
from app.mcp.external_tools import (
    TOOL_ROUTE_HANDLERS,
    budget_summary,
    categories,
    invoke_external,
    investments_summary,
    register_external_tools,
)
from app.mcp.oauth_provider import SCOPE, OwnerOAuthProvider
from app.mcp.oauth_store import MemoryOAuthRepository

AUTHORIZE = {
    "client_id": "chatgpt",
    "redirect_uri": "https://chatgpt.com/connector/oauth/callback",
    "response_type": "code",
    "code_challenge": "a" * 43,
    "code_challenge_method": "S256",
    "state": "xyz",
    "scope": SCOPE,
    "resource": "http://127.0.0.1:8000/mcp",
}


def _provider(owner_id: int | None) -> OwnerOAuthProvider:
    provider = OwnerOAuthProvider(
        "http://127.0.0.1:8000",
        repository=MemoryOAuthRepository(),
        owner_lookup=lambda _request: owner_id,
    )
    client = OAuthClientInformationFull(
        client_id="chatgpt",
        redirect_uris=[AnyUrl("https://chatgpt.com/connector/oauth/callback")],
        token_endpoint_auth_method="none",
        scope=SCOPE,
    )
    asyncio.run(provider.register_client(client))
    return provider


def _client(provider: OwnerOAuthProvider) -> TestClient:
    return TestClient(Starlette(routes=provider.get_routes("/mcp")))


def test_metadata_advertises_public_pkce_and_refresh() -> None:
    response = _client(_provider(None)).get("/.well-known/oauth-authorization-server")

    assert response.status_code == 200
    body = response.json()
    assert "none" in body["token_endpoint_auth_methods_supported"]
    assert body["code_challenge_methods_supported"] == ["S256"]
    assert "refresh_token" in body["grant_types_supported"]
    assert body["authorization_endpoint"] == "http://127.0.0.1:8000/authorize"


def test_anonymous_authorize_does_not_issue_a_code() -> None:
    provider = _provider(None)
    response = _client(provider).post("/authorize", params=AUTHORIZE, data={"decision": "allow"})

    assert response.status_code == 200
    assert "Sign in first" in response.text
    assert provider.repository.codes == {}


def test_owner_approval_issues_a_code_for_that_user_only() -> None:
    provider = _provider(7)
    response = _client(provider).post("/authorize", params=AUTHORIZE, data={"decision": "allow"}, follow_redirects=False)

    assert response.status_code == 302
    location = response.headers["location"]
    assert "code=" in location
    raw_code = location.split("code=", 1)[1].split("&", 1)[0]
    stored = provider.repository.get_code(raw_code, "chatgpt")
    assert stored is not None
    assert stored.user_id == 7

    client = asyncio.run(provider.get_client("chatgpt"))
    token = asyncio.run(provider.exchange_authorization_code(client, stored.code))
    assert provider.repository.user_id_for_access_token(token.access_token) == 7
    assert provider.repository.get_code(raw_code, "chatgpt") is None


@pytest.mark.parametrize(
    "tool_fn,route_path,kwargs,expected",
    [
        (
            investments_summary,
            "app.routers.external.get_external_investments_summary",
            {},
            {"total_value_base": 1.0},
        ),
        (
            budget_summary,
            "app.routers.external_budget.get_external_budget_summary",
            {},
            {"income": 100.0},
        ),
    ],
)
def test_tool_returns_external_route_payload(monkeypatch, tool_fn, route_path, kwargs, expected) -> None:
    monkeypatch.setattr("app.mcp.external_tools.require_mcp_user", lambda: MagicMock())
    seen: dict = {}

    async def fake_route(**call_kwargs):
        seen.update(call_kwargs)
        return expected

    monkeypatch.setattr(route_path, fake_route)
    assert tool_fn(**kwargs) == expected
    assert "db" in seen
    assert "current_user" in seen


def test_categories_calls_the_route_without_a_database_session(monkeypatch) -> None:
    monkeypatch.setattr("app.mcp.external_tools.require_mcp_user", lambda: object())

    payload = categories()

    assert payload["categories"]
    assert payload["categories"][0]["slug"]


def test_invoke_external_passes_database_and_user(monkeypatch) -> None:
    user = object()
    monkeypatch.setattr("app.mcp.external_tools.require_mcp_user", lambda: user)
    seen = {}

    async def operation(**kwargs):
        seen.update(kwargs)
        return {"ok": True}

    assert invoke_external(operation) == {"ok": True}
    assert seen["current_user"] is user
    assert "db" in seen


def test_invoke_external_maps_auth_failure(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.mcp.external_tools.require_mcp_user",
        MagicMock(side_effect=McpAuthError("Missing Authorization bearer token")),
    )
    assert invoke_external(lambda **kwargs: {"ok": True}) == {
        "error": {"code": "unauthorized", "message": "Missing Authorization bearer token"}
    }


def test_invoke_external_maps_http_exception(monkeypatch) -> None:
    monkeypatch.setattr("app.mcp.external_tools.require_mcp_user", lambda: MagicMock())

    async def operation(**_kwargs):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="missing")

    assert invoke_external(operation) == {"error": {"code": "not_found", "message": "missing"}}


def test_mcp_server_fastmcp_name_and_multiauth() -> None:
    from fastmcp import FastMCP
    from fastmcp.server.auth import MultiAuth

    from app.mcp import server
    from app.mcp.oauth_provider import OwnerOAuthProvider

    assert server.mcp.name == "budgethq"
    assert isinstance(server.mcp.auth, MultiAuth)
    assert isinstance(server.mcp.auth.server, OwnerOAuthProvider)


def test_every_tool_maps_to_a_route_handler() -> None:
    from fastmcp import FastMCP

    expected = {
        "investments_summary",
        "investments_composition",
        "categories",
        "budget_summary",
        "budget_comparison",
        "transactions_link_candidates",
        "list_transactions",
        "get_transaction",
        "patch_transactions_categories",
        "patch_transaction_category",
        "patch_transaction_hidden",
        "post_apply_rules",
        "post_transaction_link",
        "delete_transaction_link",
        "list_manual_accounts",
        "get_manual_account",
        "post_manual_account",
        "patch_manual_account",
        "list_investec_accounts",
        "get_investec_account_balance",
        "list_investec_transactions",
        "list_investec_pending_transactions",
        "list_investec_profiles",
        "list_investec_profile_accounts",
        "get_investec_authorisation_setup",
        "list_investec_profile_beneficiaries",
        "list_investec_beneficiaries",
        "list_investec_beneficiary_categories",
        "get_investec_movement",
        "create_investec_transfer",
        "create_investec_payment",
    }
    assert set(TOOL_ROUTE_HANDLERS) == expected
    mcp = FastMCP("test")
    register_external_tools(mcp)


def test_mcp_oauth_models_use_expected_tables() -> None:
    from app.models import McpOAuthClient, McpOAuthGrant

    assert McpOAuthClient.__tablename__ == "mcp_oauth_clients"
    assert McpOAuthGrant.__tablename__ == "mcp_oauth_grants"