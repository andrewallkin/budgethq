"""External (Grok bot) budget, transaction, and taxonomy endpoints.

Auth: Authorization: Bearer bhq_... (read-only keys OK on GETs; writes need
the full-access key). Router pattern mirrors routers/external.py.
"""
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..budget_period import get_current_period, get_period_dates_for_end_month
from ..external_transactions import (
    get_transaction,
    list_transactions,
    transaction_payload,
)
from ..payslip_budget import monthly_budget_income_for_user
from ..refund_matching import find_link_candidates
from ..transaction_budget_summary import build_budget_comparison
from ..transaction_categories import (
    BUDGET_LINKABLE_CATEGORIES,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_EXAMPLES,
    CATEGORY_LABELS,
    VALID_TRANSACTION_CATEGORIES,
)
from ..transaction_links import (
    create_transaction_link,
    delete_transaction_link,
    get_links_for_transaction,
)
from ..transaction_mutations import set_transaction_category, set_transaction_hidden
from ..transaction_query import build_transactions_query

router = APIRouter(prefix="/external", tags=["external"])

# Task 10 ordering constraint: GET /transactions/link-candidates MUST stay
# registered above the /transactions/{transaction_id} routes, or the
# {transaction_id} path param will shadow "link-candidates".
#
# (Transaction read routes are registered at the end of this module, in the
# required order: link-candidates, list, then {transaction_id}. Write PATCH
# routes follow the reads, with the batch /transactions/categories route
# registered above the /transactions/{transaction_id}/... PATCH routes.)

_DOCS_CANDIDATES = (
    Path(__file__).resolve().parents[2] / "docs" / "external-budget-transactions-api.md",
    Path(__file__).resolve().parents[3] / "docs" / "external-budget-transactions-api.md",
)


def _category_group(slug: str) -> str:
    from ..transaction_categories import EARNINGS_CATEGORIES, NEUTRAL_CATEGORIES

    if slug in EARNINGS_CATEGORIES or slug in {"reimbursements"}:
        return "income"
    if slug in NEUTRAL_CATEGORIES or slug == "uncategorized":
        return "neutral"
    return "expense"


@router.get("/categories")
async def get_external_categories(
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    """Full classification taxonomy with descriptions — the bot's reference."""
    slugs = list(VALID_TRANSACTION_CATEGORIES) + ["uncategorized"]
    return {
        "categories": [
            {
                "slug": slug,
                "label": CATEGORY_LABELS.get(slug, slug),
                "group": _category_group(slug),
                "description": CATEGORY_DESCRIPTIONS.get(slug, ""),
                "examples": CATEGORY_EXAMPLES.get(slug, ""),
                "budget_linkable": slug in BUDGET_LINKABLE_CATEGORIES,
            }
            for slug in slugs
        ]
    }


@router.get("/budget/summary")
async def get_external_budget_summary(
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    income = monthly_budget_income_for_user(db, current_user.id)
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()

    def _item(c: models.BudgetCategory) -> dict:
        return {
            "type": c.type,
            "name": c.name,
            "amount": c.amount or 0.0,
            "transaction_category": c.transaction_category or "uncategorized",
            "excluded": bool(c.excluded),
        }

    items = []
    if budget:
        items = [
            _item(c)
            for c in db.query(models.BudgetCategory)
            .filter(models.BudgetCategory.budget_id == budget.id)
            .all()
        ]

    start_day = (budget.budget_period_start_day if budget else 1) or 1
    # get_current_period(reference_date, start_day) — see budget_period.py:43
    from_date, to_date = get_current_period(date.today(), start_day)

    included = [i for i in items if not i["excluded"]]
    excluded = [i for i in items if i["excluded"]]
    expected_totals = {"needs": 0.0, "wants": 0.0, "savings": 0.0}
    for item in included:
        expected_totals[item["type"]] = expected_totals.get(item["type"], 0.0) + item["amount"]

    return {
        "income": income.amount if income else None,
        "income_payslip_year": income.year if income else None,
        "income_payslip_month": income.month if income else None,
        "income_skipped_additional": bool(income.skipped_additional) if income else False,
        "budget_period_start_day": start_day,
        "current_period": {"from_date": from_date.isoformat(), "to_date": to_date.isoformat()},
        "expected_totals": expected_totals,
        "included_items": included,
        "excluded_items": excluded,
    }


@router.get("/budget/comparison")
async def get_external_budget_comparison(
    period: Optional[str] = Query(default=None, description="End month YYYY-MM; defaults to current period"),
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()
    start_day = (budget.budget_period_start_day if budget else 1) or 1

    if period:
        try:
            year, month = (int(p) for p in period.split("-"))
        except ValueError:
            raise HTTPException(status_code=400, detail="period must be YYYY-MM") from None
        if not (2000 <= year <= 2100 and 1 <= month <= 12):
            raise HTTPException(status_code=400, detail="period must be YYYY-MM")
        from_date, to_date = get_period_dates_for_end_month(year, month, start_day)
    else:
        from_date, to_date = get_current_period(date.today(), start_day)

    transactions = build_transactions_query(
        db, current_user.id, from_date=from_date.isoformat(), to_date=to_date.isoformat()
    ).all()
    summary = build_budget_comparison(db, current_user.id, transactions)

    rows = [] if summary is None else [
        {
            "category_key": r.category_key,
            "label": r.label,
            "budgeted": r.budgeted,
            "actual": r.actual,
            "remaining": r.remaining,
        }
        for r in summary.rows
    ]
    zeros = {"budgeted": 0.0, "spent": 0.0, "remaining": 0.0}
    refund_zeros = {
        "unlinked_refund_total": 0.0,
        "unlinked_reimbursement_total": 0.0,
        "linked_offset_total": 0.0,
    }
    totals = zeros if summary is None else {
        "budgeted": summary.total_budgeted,
        "spent": summary.total_spent,
        "remaining": summary.remaining,
    }
    refunds = refund_zeros if summary is None else {
        "unlinked_refund_total": summary.unlinked_refund_total,
        "unlinked_reimbursement_total": summary.unlinked_reimbursement_total,
        "linked_offset_total": summary.linked_offset_total,
    }
    return {
        "period": {
            "year": to_date.year,
            "month": to_date.month,
            "from_date": from_date.isoformat(),
            "to_date": to_date.isoformat(),
        },
        "rows": rows,
        "totals": totals,
        "refunds": refunds,
    }


@router.get("/budget-transactions/docs", response_class=PlainTextResponse)
async def get_external_budget_docs():
    """Markdown documentation for the external budget/transactions API."""
    for path in _DOCS_CANDIDATES:
        if path.is_file():
            return PlainTextResponse(
                path.read_text(encoding="utf-8"),
                media_type="text/markdown; charset=utf-8",
            )
    raise HTTPException(status_code=404, detail="External budget API documentation not found")


@router.get("/transactions/link-candidates")
async def get_external_link_candidates(
    credit_id: int = Query(...),
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    """Debit candidates that a refund/reimbursement credit could offset."""
    candidates = find_link_candidates(db, current_user.id, credit_id)
    return {
        "candidates": [
            {
                **transaction_payload(c["transaction"]),
                "match_score": c["match_score"],
                "match_reasons": c["match_reasons"],
                "debit_remaining": c["debit_remaining"],
            }
            for c in candidates
        ]
    }


@router.get("/transactions")
async def get_external_transactions(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    category: Optional[list[str]] = Query(None),
    transaction_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    account_id: Optional[int] = None,
    include_transfers: bool = False,
    include_hidden: bool = False,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    account_ids = [account_id] if account_id else None
    return list_transactions(
        db, current_user.id, from_date=from_date, to_date=to_date, category=category,
        transaction_type=transaction_type, status=status, search=search,
        account_ids=account_ids, include_transfers=include_transfers,
        include_hidden=include_hidden, limit=limit, offset=offset,
    )


# NOTE: /transactions/{transaction_id} routes MUST stay below the literal
# "link-candidates" route above (FastAPI registration order).
@router.get("/transactions/{transaction_id}")
async def get_external_transaction(
    transaction_id: int,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    return get_transaction(db, current_user.id, transaction_id)


# --- External write routes (classify single + batch, hide, refund links) ----
# Ordering constraint: PATCH /transactions/categories (batch) MUST stay
# registered above the /transactions/{transaction_id}/... PATCH routes below.
# (Task 13 adds POST /transactions/apply-rules — keep writes in this block.
# The /transaction-links routes below are on a distinct path, so they have no
# ordering interaction with the /transactions/{transaction_id} routes.)


async def _serialized_after_mutation(db, user_id, transaction_id) -> dict:
    txn = (
        db.query(models.BankTransaction)
        .filter(
            models.BankTransaction.id == transaction_id,
            models.BankTransaction.user_id == user_id,
        )
        .first()
    )
    links = get_links_for_transaction(db, user_id, transaction_id)
    return transaction_payload(txn, links)


@router.patch("/transactions/categories")
async def patch_external_transaction_categories(
    body: dict,
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
    db: Session = Depends(database.get_db),
):
    """Batch classification. Per-item results; max 100 updates per call."""
    updates = (body or {}).get("updates") or []
    if not updates or len(updates) > 100:
        raise HTTPException(status_code=400, detail="updates must contain 1..100 items")
    results = []
    for update in updates[:100]:
        txn_id = update.get("id")
        category = update.get("category")
        try:
            set_transaction_category(db, current_user.id, txn_id, category)
            txn = (
                db.query(models.BankTransaction)
                .filter(
                    models.BankTransaction.id == txn_id,
                    models.BankTransaction.user_id == current_user.id,
                )
                .first()
            )
            links = get_links_for_transaction(db, current_user.id, txn_id)
            results.append({
                "id": txn_id,
                "status": "ok",
                "transaction": transaction_payload(txn, links),
            })
        except HTTPException as exc:
            db.rollback()
            results.append({"id": txn_id, "status": "error", "detail": str(exc.detail)})
    return {"results": results}


@router.patch("/transactions/{transaction_id}/category")
async def patch_external_transaction_category(
    transaction_id: int,
    body: dict,
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
    db: Session = Depends(database.get_db),
):
    category = (body or {}).get("category")
    set_transaction_category(db, current_user.id, transaction_id, category)
    return await _serialized_after_mutation(db, current_user.id, transaction_id)


@router.patch("/transactions/{transaction_id}/hidden")
async def patch_external_transaction_hidden(
    transaction_id: int,
    body: dict,
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
    db: Session = Depends(database.get_db),
):
    hidden = (body or {}).get("hidden")
    if not isinstance(hidden, bool):
        raise HTTPException(status_code=400, detail="hidden must be true or false")
    set_transaction_hidden(db, current_user.id, transaction_id, hidden)
    return await _serialized_after_mutation(db, current_user.id, transaction_id)


class ExternalLinkCreate(BaseModel):
    debit_transaction_id: Optional[int] = None
    credit_transaction_id: Optional[int] = None
    amount: Optional[float] = None


@router.post("/transaction-links")
async def post_external_transaction_link(
    body: ExternalLinkCreate,
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
    db: Session = Depends(database.get_db),
):
    if body.debit_transaction_id is None or body.credit_transaction_id is None:
        raise HTTPException(status_code=400, detail="debit_transaction_id and credit_transaction_id are required")
    link = create_transaction_link(
        db,
        current_user.id,
        debit_transaction_id=body.debit_transaction_id,
        credit_transaction_id=body.credit_transaction_id,
        amount=body.amount,
    )
    return {
        "link_id": link.id,
        "debit_transaction_id": link.debit_transaction_id,
        "credit_transaction_id": link.credit_transaction_id,
        "amount": link.amount,
    }


@router.delete("/transaction-links/{link_id}", status_code=204)
async def delete_external_transaction_link(
    link_id: int,
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
    db: Session = Depends(database.get_db),
):
    delete_transaction_link(db, current_user.id, link_id)
    return None
