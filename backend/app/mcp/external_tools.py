from __future__ import annotations

import asyncio
import inspect
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException
from fastapi import status as http_status
from fastmcp import FastMCP

from app.database import SessionLocal
from app.mcp.auth import McpAuthError, require_mcp_user
from app.routers import external, external_budget, external_manual_accounts
from app.routers.external_budget import ExternalLinkCreate

READ_ONLY = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "openWorldHint": False,
    "idempotentHint": True,
}
WRITE = {
    "readOnlyHint": False,
    "destructiveHint": False,
    "openWorldHint": False,
    "idempotentHint": False,
}
PATCH = {
    "readOnlyHint": False,
    "destructiveHint": False,
    "openWorldHint": False,
    "idempotentHint": True,
}
DELETE = {
    "readOnlyHint": False,
    "destructiveHint": True,
    "openWorldHint": False,
    "idempotentHint": True,
}

_HTTP_ERROR_CODES = {
    http_status.HTTP_401_UNAUTHORIZED: "unauthorized",
    http_status.HTTP_403_FORBIDDEN: "forbidden",
    http_status.HTTP_400_BAD_REQUEST: "bad_request",
    http_status.HTTP_404_NOT_FOUND: "not_found",
    http_status.HTTP_409_CONFLICT: "conflict",
}


def _run_route(operation: Callable[..., Any], **kwargs: Any) -> Any:
    if asyncio.iscoroutinefunction(operation):
        return asyncio.run(operation(**kwargs))
    return operation(**kwargs)


def _route_kwargs(operation: Callable[..., Any], *, user: Any, db: Any, extra: dict[str, Any]) -> dict[str, Any]:
    """Pass db and current_user only when the route function declares them."""
    params = inspect.signature(operation).parameters
    accepts_any = any(param.kind == inspect.Parameter.VAR_KEYWORD for param in params.values())
    kwargs = dict(extra)
    if accepts_any or "db" in params:
        kwargs["db"] = db
    if accepts_any or "current_user" in params:
        kwargs["current_user"] = user
    return kwargs


def invoke_external(operation: Callable[..., Any], **kwargs: Any) -> dict:
    """Call one external API route function and return its JSON body."""
    try:
        user = require_mcp_user()
        with SessionLocal() as db:
            result = _run_route(operation, **_route_kwargs(operation, user=user, db=db, extra=kwargs))
    except McpAuthError as exc:
        return {"error": {"code": "unauthorized", "message": str(exc)}}
    except HTTPException as exc:
        code = _HTTP_ERROR_CODES.get(exc.status_code, "error")
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return {"error": {"code": code, "message": detail}}
    if result is None:
        return {}
    return result


def investments_summary() -> dict:
    """Same payload as GET /api/external/investments/summary."""
    return invoke_external(external.get_external_investments_summary)


def investments_composition(since: str | None = None) -> dict:
    """Same payload as GET /api/external/investments/composition."""
    return invoke_external(external.get_external_investments_composition, since=since)


def categories() -> dict:
    """Same payload as GET /api/external/categories."""
    return invoke_external(external_budget.get_external_categories)


def budget_summary() -> dict:
    """Same payload as GET /api/external/budget/summary."""
    return invoke_external(external_budget.get_external_budget_summary)


def budget_comparison(period: str | None = None) -> dict:
    """Same payload as GET /api/external/budget/comparison."""
    return invoke_external(external_budget.get_external_budget_comparison, period=period)


def transactions_link_candidates(credit_id: int) -> dict:
    """Same payload as GET /api/external/transactions/link-candidates."""
    return invoke_external(external_budget.get_external_link_candidates, credit_id=credit_id)


def list_transactions(
    from_date: str | None = None,
    to_date: str | None = None,
    category: list[str] | None = None,
    transaction_type: str | None = None,
    status: str | None = None,
    search: str | None = None,
    account_id: int | None = None,
    account_ids: list[int] | None = None,
    include_transfers: bool = False,
    include_hidden: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """Same payload as GET /api/external/transactions."""
    return invoke_external(
        external_budget.get_external_transactions,
        from_date=from_date,
        to_date=to_date,
        category=category,
        transaction_type=transaction_type,
        status=status,
        search=search,
        account_id=account_id,
        account_ids=account_ids,
        include_transfers=include_transfers,
        include_hidden=include_hidden,
        limit=limit,
        offset=offset,
    )


def get_transaction(transaction_id: int) -> dict:
    """Same payload as GET /api/external/transactions/{transaction_id}."""
    return invoke_external(external_budget.get_external_transaction, transaction_id=transaction_id)


def patch_transactions_categories(updates: list[dict]) -> dict:
    """Same payload as PATCH /api/external/transactions/categories."""
    return invoke_external(external_budget.patch_external_transaction_categories, body={"updates": updates})


def patch_transaction_category(transaction_id: int, category: str) -> dict:
    """Same payload as PATCH /api/external/transactions/{transaction_id}/category."""
    return invoke_external(
        external_budget.patch_external_transaction_category,
        transaction_id=transaction_id,
        body={"category": category},
    )


def patch_transaction_hidden(transaction_id: int, hidden: bool) -> dict:
    """Same payload as PATCH /api/external/transactions/{transaction_id}/hidden."""
    return invoke_external(
        external_budget.patch_external_transaction_hidden,
        transaction_id=transaction_id,
        body={"hidden": hidden},
    )


def post_apply_rules(
    rule_id: int | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    dry_run: bool = False,
) -> dict:
    """Same payload as POST /api/external/transactions/apply-rules."""
    body: dict[str, Any] = {"dry_run": dry_run}
    if rule_id is not None:
        body["rule_id"] = rule_id
    if from_date is not None:
        body["from_date"] = from_date
    if to_date is not None:
        body["to_date"] = to_date
    return invoke_external(external_budget.post_external_apply_rules, body=body)


def post_transaction_link(
    debit_transaction_id: int,
    credit_transaction_id: int,
    amount: float | None = None,
) -> dict:
    """Same payload as POST /api/external/transaction-links."""
    body = ExternalLinkCreate(
        debit_transaction_id=debit_transaction_id,
        credit_transaction_id=credit_transaction_id,
        amount=amount,
    )
    return invoke_external(external_budget.post_external_transaction_link, body=body)


def delete_transaction_link(link_id: int) -> dict:
    """Same payload as DELETE /api/external/transaction-links/{link_id}."""
    return invoke_external(external_budget.delete_external_transaction_link, link_id=link_id)


def list_manual_accounts() -> dict:
    """Same payload as GET /api/external/manual-accounts."""
    return invoke_external(external_manual_accounts.list_external_manual_accounts)


def get_manual_account(account_id: int) -> dict:
    """Same payload as GET /api/external/manual-accounts/{account_id}."""
    return invoke_external(external_manual_accounts.get_external_manual_account, account_id=account_id)


def post_manual_account(name: str, balance: float = 0, is_emergency_savings: bool = False) -> dict:
    """Same payload as POST /api/external/manual-accounts."""
    from app.routers.external_manual_accounts import ExternalManualAccountCreate

    data = ExternalManualAccountCreate(
        name=name,
        balance=balance,
        is_emergency_savings=is_emergency_savings,
    )
    return invoke_external(external_manual_accounts.create_external_manual_account, data=data)


def patch_manual_account(account_id: int, balance: float) -> dict:
    """Same payload as PATCH /api/external/manual-accounts/{account_id}."""
    from app.routers.external_manual_accounts import ExternalManualAccountUpdate

    data = ExternalManualAccountUpdate(balance=balance)
    return invoke_external(external_manual_accounts.update_external_manual_account, account_id=account_id, data=data)


TOOL_ROUTE_HANDLERS: dict[str, Callable[..., Any]] = {
    "investments_summary": external.get_external_investments_summary,
    "investments_composition": external.get_external_investments_composition,
    "categories": external_budget.get_external_categories,
    "budget_summary": external_budget.get_external_budget_summary,
    "budget_comparison": external_budget.get_external_budget_comparison,
    "transactions_link_candidates": external_budget.get_external_link_candidates,
    "list_transactions": external_budget.get_external_transactions,
    "get_transaction": external_budget.get_external_transaction,
    "patch_transactions_categories": external_budget.patch_external_transaction_categories,
    "patch_transaction_category": external_budget.patch_external_transaction_category,
    "patch_transaction_hidden": external_budget.patch_external_transaction_hidden,
    "post_apply_rules": external_budget.post_external_apply_rules,
    "post_transaction_link": external_budget.post_external_transaction_link,
    "delete_transaction_link": external_budget.delete_external_transaction_link,
    "list_manual_accounts": external_manual_accounts.list_external_manual_accounts,
    "get_manual_account": external_manual_accounts.get_external_manual_account,
    "post_manual_account": external_manual_accounts.create_external_manual_account,
    "patch_manual_account": external_manual_accounts.update_external_manual_account,
}


def register_external_tools(mcp: FastMCP) -> None:
    read_tools = [
        investments_summary,
        investments_composition,
        categories,
        budget_summary,
        budget_comparison,
        transactions_link_candidates,
        list_transactions,
        get_transaction,
        list_manual_accounts,
        get_manual_account,
    ]
    for tool in read_tools:
        mcp.tool(annotations=READ_ONLY)(tool)

    mcp.tool(annotations=PATCH)(patch_transactions_categories)
    mcp.tool(annotations=PATCH)(patch_transaction_category)
    mcp.tool(annotations=PATCH)(patch_transaction_hidden)
    mcp.tool(annotations=PATCH)(patch_manual_account)
    mcp.tool(annotations=WRITE)(post_apply_rules)
    mcp.tool(annotations=WRITE)(post_transaction_link)
    mcp.tool(annotations=WRITE)(post_manual_account)
    mcp.tool(annotations=DELETE)(delete_transaction_link)