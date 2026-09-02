"""Build read-only external investment composition payloads for bot integrations."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import models
from .fx_service import FxRatesResult, amount_in_base, get_fx_rates_cached
from .portfolio_service import ensure_default_tfsa_portfolio
from .routers.investments import _fx_public_snapshot, _portfolio_value
from .tax_engine import get_tax_config
from .utils import get_sa_financial_year_start, get_sast_now


def _parse_since_param(since_raw: Optional[str]) -> Optional[datetime]:
    if not since_raw or not since_raw.strip():
        return None
    text = since_raw.strip()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone(timedelta(hours=2))).replace(tzinfo=None)
    return parsed


def _default_since_anchor(db: Session, user_id: int) -> datetime:
    """Previous daily EOD: latest DailyPortfolioSummary date before today, end of that day SAST."""
    today = get_sast_now().date()
    latest = (
        db.query(func.max(models.DailyPortfolioSummary.date))
        .filter(
            models.DailyPortfolioSummary.user_id == user_id,
            models.DailyPortfolioSummary.date < today,
        )
        .scalar()
    )
    anchor_date = latest if latest is not None else (today - timedelta(days=1))
    return datetime.combine(anchor_date, time(23, 59, 59))


def resolve_since_anchor(
    db: Session,
    user_id: int,
    since_param: Optional[str],
) -> tuple[datetime, str]:
    parsed = _parse_since_param(since_param)
    if parsed is not None:
        return parsed, "parameter"
    return _default_since_anchor(db, user_id), "previous_daily_eod"


def _round(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), 2)


def _tfsa_deposits_this_fy(db: Session, user_id: int) -> float:
    financial_year_start = get_sa_financial_year_start()
    return float(
        db.query(func.coalesce(func.sum(models.TFSADeposit.amount), 0))
        .filter(
            models.TFSADeposit.user_id == user_id,
            models.TFSADeposit.financial_year_start == financial_year_start,
        )
        .scalar()
        or 0
    )


def _tfsa_remaining_fy_allowance(db: Session, user_id: int) -> float:
    financial_year_start = get_sa_financial_year_start()
    tax_config = get_tax_config(financial_year_start)
    annual_limit = float(tax_config["tfsa_annual_limit"])
    deposits_this_fy = _tfsa_deposits_this_fy(db, user_id)
    return max(0.0, round(annual_limit - deposits_this_fy, 2))


def _tfsa_deposits_since(db: Session, user_id: int, since_anchor: datetime) -> float:
    return float(
        db.query(func.coalesce(func.sum(models.TFSADeposit.amount), 0))
        .filter(
            models.TFSADeposit.user_id == user_id,
            models.TFSADeposit.deposit_date >= since_anchor.date(),
        )
        .scalar()
        or 0
    )


def _foreign_cashflows_since(
    db: Session,
    user_id: int,
    portfolio_id: int,
    since_anchor: datetime,
) -> dict:
    base_filter = (
        models.ETFTransaction.user_id == user_id,
        models.ETFTransaction.portfolio_id == portfolio_id,
        models.ETFTransaction.transaction_date > since_anchor,
    )
    buys = float(
        db.query(func.coalesce(func.sum(models.ETFTransaction.total_value), 0))
        .filter(*base_filter, models.ETFTransaction.transaction_type == "BUY")
        .scalar()
        or 0
    )
    sells = float(
        db.query(func.coalesce(func.sum(models.ETFTransaction.total_value), 0))
        .filter(*base_filter, models.ETFTransaction.transaction_type == "SELL")
        .scalar()
        or 0
    )
    return {
        "buys_since": _round(buys),
        "sells_since": _round(sells),
        "net_invested_since": _round(buys - sells),
    }


def _ra_cashflows(db: Session, user_id: int, since_anchor: datetime) -> dict:
    fy_start_year = get_sa_financial_year_start()
    fy_start_date = date(fy_start_year, 3, 1)
    fy_end_date = date(fy_start_year + 1, 2, 28)

    contributions_this_fy = float(
        db.query(func.coalesce(func.sum(models.RAContribution.amount), 0))
        .filter(
            models.RAContribution.user_id == user_id,
            models.RAContribution.contribution_date >= fy_start_date,
            models.RAContribution.contribution_date <= fy_end_date,
        )
        .scalar()
        or 0
    )
    contributions_since = float(
        db.query(func.coalesce(func.sum(models.RAContribution.amount), 0))
        .filter(
            models.RAContribution.user_id == user_id,
            models.RAContribution.contribution_date >= since_anchor.date(),
        )
        .scalar()
        or 0
    )
    cumulative_contributions = float(
        db.query(func.coalesce(func.sum(models.RAContribution.amount), 0))
        .filter(models.RAContribution.user_id == user_id)
        .scalar()
        or 0
    )
    return {
        "contributions_this_fy": _round(contributions_this_fy),
        "contributions_since": _round(contributions_since),
        "cumulative_contributions": _round(cumulative_contributions),
    }


def _latest_ra_snapshot(db: Session, user_id: int) -> Optional[models.RAValueHistory]:
    return (
        db.query(models.RAValueHistory)
        .filter(models.RAValueHistory.user_id == user_id)
        .order_by(models.RAValueHistory.record_date.desc())
        .first()
    )


def _build_holdings(
    db: Session,
    user_id: int,
    portfolio: models.InvestmentPortfolio,
    sleeve_total: float,
    fx: FxRatesResult,
    include_target_weights: bool,
) -> tuple[list[dict], Optional[str]]:
    holdings = (
        db.query(models.ETFHolding)
        .filter(
            models.ETFHolding.user_id == user_id,
            models.ETFHolding.portfolio_id == portfolio.id,
            or_(models.ETFHolding.shares > 0, models.ETFHolding.target_percentage > 0),
        )
        .all()
    )

    result = []
    latest_price_at: Optional[datetime] = None

    for holding in holdings:
        native_value = None
        if holding.current_price is not None:
            native_value = holding.shares * holding.current_price

        value_base = None
        if native_value is not None:
            value_base = amount_in_base(native_value, portfolio.currency_code or "ZAR", fx)

        weight_actual = None
        if native_value is not None and sleeve_total > 0:
            weight_actual = round((native_value / sleeve_total) * 100, 2)

        unrealized_gain = None
        if native_value is not None and (holding.cost_basis or 0) > 0:
            unrealized_gain = round(native_value - holding.cost_basis, 2)

        entry = {
            "ticker": holding.jse_ticker,
            "name": holding.etf_name,
            "instrument_type": holding.instrument_type or "etf",
            "region": holding.region,
            "shares": holding.shares,
            "price": _round(holding.current_price),
            "price_updated_at": holding.price_updated_at.isoformat() if holding.price_updated_at else None,
            "value": _round(native_value),
            "value_base": _round(value_base),
            "weight_actual": weight_actual,
            "cost_basis": _round(holding.cost_basis),
            "unrealized_gain": unrealized_gain,
        }

        if include_target_weights:
            target = holding.target_percentage
            entry["weight_target"] = target
            entry["weight_drift"] = (
                round(weight_actual - target, 2) if weight_actual is not None and target is not None else None
            )

        result.append(entry)

        if holding.price_updated_at and (latest_price_at is None or holding.price_updated_at > latest_price_at):
            latest_price_at = holding.price_updated_at

    as_of = latest_price_at.isoformat() if latest_price_at else None
    return result, as_of


def _build_sheets_account(
    db: Session,
    user: models.User,
    portfolio: models.InvestmentPortfolio,
    fx: FxRatesResult,
    since_anchor: datetime,
) -> dict:
    native_value = _portfolio_value(db, portfolio.id)
    currency = portfolio.currency_code or "ZAR"
    value_base = amount_in_base(native_value, currency, fx)

    holdings, as_of = _build_holdings(
        db,
        user.id,
        portfolio,
        native_value,
        fx,
        include_target_weights=bool(portfolio.is_default_tfsa),
    )

    account = {
        "name": portfolio.name,
        "slug": portfolio.slug,
        "currency": currency,
        "source": "sheets",
        "composition_available": True,
        "value": _round(native_value),
        "value_base": _round(value_base),
        "as_of": as_of,
        "is_retirement_annuity": False,
        "holdings": holdings,
    }

    if portfolio.is_default_tfsa:
        account["cashflows"] = {
            "deposits_this_fy": _round(_tfsa_deposits_this_fy(db, user.id)),
            "remaining_fy_allowance": _round(_tfsa_remaining_fy_allowance(db, user.id)),
            "deposits_since": _round(_tfsa_deposits_since(db, user.id, since_anchor)),
        }
    else:
        account["cashflows"] = _foreign_cashflows_since(db, user.id, portfolio.id, since_anchor)

    return account


def _build_ra_account(db: Session, user_id: int, since_anchor: datetime) -> dict:
    latest = _latest_ra_snapshot(db, user_id)
    native_value = round(latest.portfolio_value or 0, 2) if latest else 0.0
    as_of = latest.record_date.isoformat() if latest else None

    return {
        "name": "Retirement Annuity",
        "slug": "ra",
        "currency": "ZAR",
        "source": "ra_manual",
        "composition_available": False,
        "value": native_value,
        "value_base": native_value,
        "as_of": as_of,
        "is_retirement_annuity": True,
        "cashflows": _ra_cashflows(db, user_id, since_anchor),
    }


def build_external_composition(
    db: Session,
    user: models.User,
    since_param: Optional[str] = None,
) -> dict:
    ensure_default_tfsa_portfolio(db, user.id)
    since_anchor, since_source = resolve_since_anchor(db, user.id, since_param)

    fx = get_fx_rates_cached()
    fx_snap = _fx_public_snapshot(fx)

    portfolios = (
        db.query(models.InvestmentPortfolio)
        .filter(
            models.InvestmentPortfolio.user_id == user.id,
            models.InvestmentPortfolio.is_active.is_(True),
        )
        .order_by(
            models.InvestmentPortfolio.is_default_tfsa.desc(),
            models.InvestmentPortfolio.name.asc(),
        )
        .all()
    )

    accounts = [_build_sheets_account(db, user, portfolio, fx, since_anchor) for portfolio in portfolios]

    if bool(getattr(user, "show_ra_under_investments", None)):
        ra_account = _build_ra_account(db, user.id, since_anchor)
        if accounts and accounts[0].get("slug") == "tfsa":
            accounts.insert(1, ra_account)
        else:
            accounts.insert(0, ra_account)

    as_of_values = [account["as_of"] for account in accounts if account.get("as_of")]
    response_as_of = max(as_of_values) if as_of_values else None
    if response_as_of is None and fx_snap.get("as_of"):
        response_as_of = fx_snap["as_of"]

    return {
        "as_of": response_as_of,
        "base_currency": fx.base_currency,
        "since": since_anchor.isoformat(),
        "since_source": since_source,
        "fx": {
            "base_currency": fx_snap["base_currency"],
            "rates": fx_snap["rates"],
            "as_of": fx_snap["as_of"],
            "configured": fx_snap["configured"],
        },
        "accounts": accounts,
    }
