"""External (Grok bot) budget, transaction, and taxonomy endpoints.

Auth: Authorization: Bearer bhq_... (read-only keys OK on GETs; writes need
the full-access key). Router pattern mirrors routers/external.py.
"""
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..budget_period import get_current_period, get_period_dates_for_end_month
from ..payslip_budget import monthly_budget_income_for_user
from ..transaction_budget_summary import build_budget_comparison
from ..transaction_categories import (
    BUDGET_LINKABLE_CATEGORIES,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_EXAMPLES,
    CATEGORY_LABELS,
    VALID_TRANSACTION_CATEGORIES,
)
from ..transaction_query import build_transactions_query

router = APIRouter(prefix="/external", tags=["external"])

# Task 10 ordering constraint: the future GET /transactions/link-candidates
# route MUST be registered above any later /transactions/{transaction_id}
# routes added to this router, or the {transaction_id} path param will
# shadow "link-candidates".
#
# (Task 10 will append transaction routes here.)

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
        year, month = (int(p) for p in period.split("-"))
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
