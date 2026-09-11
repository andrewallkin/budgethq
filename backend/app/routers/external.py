from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..external_composition_service import (
    SHEETS_SOURCE,
    SHEETS_SOURCE_ID,
    build_external_composition,
    build_playwright_summary_accounts,
)
from ..fx_service import aggregate_portfolios_base, get_fx_rates_cached
from ..portfolio_service import ensure_default_tfsa_portfolio
from .investments import build_investments_summary

router = APIRouter(prefix="/external", tags=["external"])

_EXTERNAL_INVESTMENTS_DOCS_CANDIDATES = (
    Path(__file__).resolve().parents[2] / "docs" / "external-investments-api.md",
    Path(__file__).resolve().parents[3] / "docs" / "external-investments-api.md",
)


def _external_investments_docs_path() -> Path:
    for path in _EXTERNAL_INVESTMENTS_DOCS_CANDIDATES:
        if path.is_file():
            return path
    raise HTTPException(status_code=404, detail="External investments API documentation not found")


def _build_external_investments_response(db, current_user, summary: dict) -> dict:
    fx = get_fx_rates_cached()
    base_currency = summary["base_currency"]
    accounts = []

    for portfolio in summary["portfolios"]:
        if portfolio.get("is_retirement_annuity"):
            continue
        native_value = float(portfolio["total_value"])
        currency = portfolio["currency_code"] or "ZAR"
        total_base, _ = aggregate_portfolios_base([(native_value, currency)], fx)
        accounts.append({
            "name": portfolio["name"],
            "slug": portfolio["slug"],
            "currency": currency,
            "value": round(native_value, 2),
            "value_base": round(total_base, 2) if total_base is not None else None,
            "is_retirement_annuity": False,
            "source": SHEETS_SOURCE,
            "source_id": SHEETS_SOURCE_ID,
        })

    accounts.extend(build_playwright_summary_accounts(db, current_user.id))

    as_of = summary.get("fx", {}).get("as_of")
    if as_of is None:
        as_of = datetime.now(timezone.utc).isoformat()

    value_bases = [account["value_base"] for account in accounts if account.get("value_base") is not None]
    total_value_base = round(sum(value_bases), 2) if value_bases else 0.0

    return {
        "as_of": as_of,
        "base_currency": base_currency,
        "total_value_base": total_value_base,
        "accounts": accounts,
        "fx": {
            "configured": summary.get("fx", {}).get("configured"),
            "aggregate_error": summary.get("fx", {}).get("aggregate_error"),
        },
    }


@router.get("/investments/summary")
async def get_external_investments_summary(
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    """
    Read-only investment totals for external integrations (e.g. Grok).

    Authenticate with: Authorization: Bearer bhq_...
    """
    ensure_default_tfsa_portfolio(db, current_user.id)
    summary = build_investments_summary(db, current_user)
    return _build_external_investments_response(db, current_user, summary)


@router.get("/investments/composition")
async def get_external_investments_composition(
    since: Optional[str] = Query(
        default=None,
        description="ISO datetime for cashflow deltas (e.g. last 08:00 note). Defaults to previous daily EOD.",
    ),
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    db: Session = Depends(database.get_db),
):
    """
    Read-only per-sleeve holdings and cashflows for external integrations (e.g. Grok).

    Authenticate with: Authorization: Bearer bhq_...
    """
    return build_external_composition(db, current_user, since_param=since)


@router.get("/investments/docs", response_class=PlainTextResponse)
async def get_external_investments_docs():
    """Markdown documentation for the external investments API."""
    return PlainTextResponse(
        _external_investments_docs_path().read_text(encoding="utf-8"),
        media_type="text/markdown; charset=utf-8",
    )
