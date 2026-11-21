"""MCP tools for Investec external proxy routes."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi.responses import JSONResponse

from app.mcp import external_tools
from app.mcp.external_tools import TOOL_ROUTE_HANDLERS, register_external_tools


INVESTEC_TOOL_NAMES = {
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


def test_investec_tools_registered_in_tool_route_handlers() -> None:
    missing = INVESTEC_TOOL_NAMES - set(TOOL_ROUTE_HANDLERS)
    assert not missing, f"missing handlers: {sorted(missing)}"
    for name in INVESTEC_TOOL_NAMES:
        assert name in TOOL_ROUTE_HANDLERS


def test_register_external_tools_includes_investec_tools() -> None:
    import inspect

    from fastmcp import FastMCP

    source = inspect.getsource(register_external_tools)
    for name in INVESTEC_TOOL_NAMES:
        assert name in source


def test_create_investec_transfer_calls_route_not_investec_service(monkeypatch) -> None:
    from app.mcp.external_tools import create_investec_transfer
    from app.routers import external_investec

    pending = {
        "id": 42,
        "status": "pending",
        "kind": "transfer",
        "expires_at": "2026-11-21T12:15:00+02:00",
    }
    seen: dict = {}

    async def fake_create_transfer(**kwargs):
        seen.update(kwargs)
        return JSONResponse(status_code=202, content=pending)

    monkeypatch.setattr(external_investec, "create_transfer", fake_create_transfer)
    monkeypatch.setattr("app.mcp.external_tools.require_mcp_user", lambda: MagicMock())
    monkeypatch.setattr("app.mcp.external_tools.SessionLocal", MagicMock())

    result = create_investec_transfer(
        account_id="acc-src",
        beneficiary_account_id="acc-dst",
        amount="1500.00",
        my_reference="Mine",
        their_reference="Theirs",
        idempotency_key="idem-1",
    )

    assert result == pending
    assert seen["account_id"] == "acc-src"
    body = seen["body"]
    assert len(body["transferList"]) == 1
    item = body["transferList"][0]
    assert item["beneficiaryAccountId"] == "acc-dst"
    assert item["amount"] == "1500.00"
    assert item["myReference"] == "Mine"
    assert item["theirReference"] == "Theirs"
    assert seen.get("idempotency_key") == "idem-1"

    import app.mcp.external_tools as et

    assert "InvestecService" not in et.__dict__


def test_create_investec_transfer_invoke_external_wires_route(monkeypatch) -> None:
    from app.mcp.external_tools import create_investec_transfer

    called: dict = {}

    def fake_invoke(operation, **kwargs):
        called["operation"] = operation
        called["kwargs"] = kwargs
        return {"id": 1, "status": "pending", "kind": "transfer", "expires_at": "t"}

    monkeypatch.setattr("app.mcp.external_tools.invoke_external", fake_invoke)

    create_investec_transfer(
        account_id="a1",
        beneficiary_account_id="a2",
        amount="10.00",
        my_reference="m",
        their_reference="t",
    )

    from app.routers.external_investec import create_transfer

    assert called["operation"] is create_transfer
    assert called["kwargs"]["body"]["transferList"][0]["beneficiaryAccountId"] == "a2"


def test_create_investec_payment_builds_payment_list(monkeypatch) -> None:
    from app.mcp.external_tools import create_investec_payment

    called: dict = {}

    def fake_invoke(operation, **kwargs):
        called["kwargs"] = kwargs
        return {"id": 2, "status": "pending", "kind": "payment", "expires_at": "t"}

    monkeypatch.setattr("app.mcp.external_tools.invoke_external", fake_invoke)

    create_investec_payment(
        account_id="a1",
        beneficiary_id="ben-1",
        amount="99.50",
        my_reference="pay me",
        their_reference="pay them",
        idempotency_key="pay-idem",
    )

    item = called["kwargs"]["body"]["paymentList"][0]
    assert item["beneficiaryId"] == "ben-1"
    assert item["amount"] == "99.50"
    assert called["kwargs"]["idempotency_key"] == "pay-idem"


def test_list_investec_transactions_forwards_query(monkeypatch) -> None:
    from app.mcp.external_tools import list_investec_transactions

    called: dict = {}

    def fake_invoke(operation, **kwargs):
        called.update(kwargs)
        return {"data": {}}

    monkeypatch.setattr("app.mcp.external_tools.invoke_external", fake_invoke)

    list_investec_transactions(
        account_id="acc-1",
        from_date="2026-01-01",
        to_date="2026-01-31",
    )

    assert called["account_id"] == "acc-1"
    assert called["query"] == {"fromDate": "2026-01-01", "toDate": "2026-01-31"}


def test_invoke_external_unwraps_json_response(monkeypatch) -> None:
    monkeypatch.setattr("app.mcp.external_tools.require_mcp_user", lambda: MagicMock())

    async def operation(**_kwargs):
        return JSONResponse(status_code=202, content={"status": "pending"})

    assert external_tools.invoke_external(operation) == {"status": "pending"}