from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..fx_service import aggregate_portfolios_base, get_fx_rates_cached
from ..portfolio_service import ensure_default_tfsa_portfolio
from .investments import build_investments_summary

router = APIRouter(prefix="/external", tags=["external"])


def _build_external_investments_response(summary: dict) -> dict:
    fx = get_fx_rates_cached()
    base_currency = summary["base_currency"]
    accounts = []

    for portfolio in summary["portfolios"]:
        native_value = float(portfolio["total_value"])
        currency = portfolio["currency_code"] or "ZAR"
        total_base, _ = aggregate_portfolios_base([(native_value, currency)], fx)
        accounts.append({
            "name": portfolio["name"],
            "slug": portfolio["slug"],
            "currency": currency,
            "value": round(native_value, 2),
            "value_base": round(total_base, 2) if total_base is not None else None,
            "is_retirement_annuity": bool(portfolio.get("is_retirement_annuity")),
        })

    as_of = summary.get("fx", {}).get("as_of")
    if as_of is None:
        as_of = datetime.now(timezone.utc).isoformat()

    return {
        "as_of": as_of,
        "base_currency": base_currency,
        "total_value_base": summary.get("total_value_base_currency"),
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
    return _build_external_investments_response(summary)
