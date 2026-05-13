import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..fx_service import (
    FxRatesResult,
    aggregate_portfolios_base,
    get_fx_rates_cached,
)
from ..portfolio_service import ensure_default_tfsa_portfolio, slugify_portfolio_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/investments", tags=["investments"])

ALLOWED_CURRENCY_CODES = frozenset({"ZAR", "USD", "EUR", "GBP"})
# Synthetic RA portfolio uses slug "ra"; user-created portfolios must not take it.
RESERVED_INVESTMENT_SLUGS = frozenset({"ra"})


def _normalize_currency_code(code: str | None) -> str:
    normalized = (code or "ZAR").strip().upper()
    if normalized not in ALLOWED_CURRENCY_CODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid currency_code. Allowed: {', '.join(sorted(ALLOWED_CURRENCY_CODES))}",
        )
    return normalized


class InvestmentCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    currency_code: str | None = Field(default=None, max_length=3)


class InvestmentUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    currency_code: str | None = Field(default=None, max_length=3)
    target_allocation_enabled: bool | None = Field(default=None)


def _portfolio_value(db: Session, portfolio_id: int) -> float:
    return float(
        db.query(func.coalesce(func.sum(models.ETFHolding.shares * models.ETFHolding.current_price), 0))
        .filter(models.ETFHolding.portfolio_id == portfolio_id)
        .scalar()
        or 0
    )


def _latest_ra_value_zar(db: Session, user_id: int) -> float:
    """Latest RA portfolio value from RAValueHistory (same rule as /api/ra/default_user)."""
    latest = (
        db.query(models.RAValueHistory)
        .filter(models.RAValueHistory.user_id == user_id)
        .order_by(models.RAValueHistory.record_date.desc())
        .first()
    )
    return round(latest.portfolio_value or 0, 2) if latest else 0.0


def _allocate_portfolio_slug(db: Session, user_id: int, base_slug: str) -> str:
    slug = base_slug
    suffix = 2
    while slug in RESERVED_INVESTMENT_SLUGS or db.query(models.InvestmentPortfolio).filter(
        models.InvestmentPortfolio.user_id == user_id,
        models.InvestmentPortfolio.slug == slug,
    ).first():
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


def _fx_public_snapshot(fx: FxRatesResult) -> dict:
    as_of = None
    if fx.fetched_at_unix is not None:
        as_of = datetime.fromtimestamp(fx.fetched_at_unix, tz=timezone.utc).isoformat()
    return {
        "base_currency": fx.base_currency,
        "rates": fx.rates,
        "source": fx.source,
        "configured": fx.configured,
        "as_of": as_of,
        "sheet_error": fx.error_message,
    }


@router.get("/fx-rates")
async def get_investment_fx_rates(
    current_user: models.User = Depends(auth.get_current_user),
):
    """Latest cached FX snapshot from the configured Google Sheet (same auth as portfolios)."""
    _ = current_user
    fx = get_fx_rates_cached()
    return _fx_public_snapshot(fx)


@router.get("")
async def list_investments(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    ensure_default_tfsa_portfolio(db, current_user.id)

    portfolios = db.query(models.InvestmentPortfolio).filter(
        models.InvestmentPortfolio.user_id == current_user.id,
        models.InvestmentPortfolio.is_active.is_(True),
    ).order_by(models.InvestmentPortfolio.is_default_tfsa.desc(), models.InvestmentPortfolio.name.asc()).all()

    result = []
    total_investments = 0.0
    for portfolio in portfolios:
        value = _portfolio_value(db, portfolio.id)
        total_investments += value
        sheet = db.query(models.UserSheet).filter(
            models.UserSheet.user_id == current_user.id,
            models.UserSheet.portfolio_id == portfolio.id,
        ).first()
        result.append({
            "id": portfolio.id,
            "name": portfolio.name,
            "slug": portfolio.slug,
            "is_default_tfsa": portfolio.is_default_tfsa,
            "target_allocation_enabled": portfolio.target_allocation_enabled,
            "currency_code": portfolio.currency_code,
            "sheet_name": sheet.sheet_name if sheet else None,
            "total_value": value,
        })

    ra_value_zar = 0.0
    if bool(getattr(current_user, "show_ra_under_investments", None)):
        ra_value_zar = _latest_ra_value_zar(db, current_user.id)
        ra_entry = {
            "id": None,
            "name": "Retirement Annuity",
            "slug": "ra",
            "is_default_tfsa": False,
            "target_allocation_enabled": False,
            "currency_code": "ZAR",
            "sheet_name": None,
            "total_value": ra_value_zar,
            "is_retirement_annuity": True,
        }
        if result and result[0].get("is_default_tfsa"):
            result.insert(1, ra_entry)
        else:
            result.insert(0, ra_entry)

    fx = get_fx_rates_cached()
    value_currency_pairs = [
        (_portfolio_value(db, p.id), p.currency_code or "ZAR") for p in portfolios
    ]
    if bool(getattr(current_user, "show_ra_under_investments", None)):
        value_currency_pairs.append((ra_value_zar, "ZAR"))
    total_base, agg_err = aggregate_portfolios_base(value_currency_pairs, fx)
    fx_snap = _fx_public_snapshot(fx)
    fx_snap["aggregate_error"] = agg_err

    return {
        "portfolios": result,
        "total_investments": total_investments,
        "total_value_base_currency": total_base,
        "base_currency": fx.base_currency,
        "fx": fx_snap,
    }


@router.get("/slug/{portfolio_slug}")
async def get_investment_by_slug(
    portfolio_slug: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    ensure_default_tfsa_portfolio(db, current_user.id)
    portfolio = db.query(models.InvestmentPortfolio).filter(
        models.InvestmentPortfolio.user_id == current_user.id,
        models.InvestmentPortfolio.slug == portfolio_slug,
        models.InvestmentPortfolio.is_active.is_(True),
    ).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    sheet = db.query(models.UserSheet).filter(
        models.UserSheet.user_id == current_user.id,
        models.UserSheet.portfolio_id == portfolio.id,
    ).first()
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "slug": portfolio.slug,
        "is_default_tfsa": portfolio.is_default_tfsa,
        "target_allocation_enabled": portfolio.target_allocation_enabled,
        "currency_code": portfolio.currency_code,
        "sheet_name": sheet.sheet_name if sheet else None,
        "total_value": _portfolio_value(db, portfolio.id),
    }


@router.patch("/{portfolio_id}")
async def patch_investment(
    portfolio_id: int,
    request: InvestmentUpdateRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    if request.name is None and request.currency_code is None and request.target_allocation_enabled is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    portfolio = db.query(models.InvestmentPortfolio).filter(
        models.InvestmentPortfolio.id == portfolio_id,
        models.InvestmentPortfolio.user_id == current_user.id,
        models.InvestmentPortfolio.is_active.is_(True),
    ).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    if request.name is not None:
        nm = request.name.strip()
        if len(nm) < 1:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        portfolio.name = nm

    if request.currency_code is not None:
        new_cc = _normalize_currency_code(request.currency_code)
        if portfolio.is_default_tfsa and new_cc != "ZAR":
            raise HTTPException(
                status_code=400,
                detail="TFSA portfolio currency must be ZAR",
            )
        portfolio.currency_code = new_cc

    if request.target_allocation_enabled is not None:
        if portfolio.is_default_tfsa and not request.target_allocation_enabled:
            raise HTTPException(
                status_code=400,
                detail="TFSA portfolio always uses target allocation",
            )
        if not portfolio.is_default_tfsa:
            portfolio.target_allocation_enabled = bool(request.target_allocation_enabled)

    db.commit()
    db.refresh(portfolio)

    sheet = db.query(models.UserSheet).filter(
        models.UserSheet.user_id == current_user.id,
        models.UserSheet.portfolio_id == portfolio.id,
    ).first()

    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "slug": portfolio.slug,
        "is_default_tfsa": portfolio.is_default_tfsa,
        "target_allocation_enabled": portfolio.target_allocation_enabled,
        "currency_code": portfolio.currency_code,
        "sheet_name": sheet.sheet_name if sheet else None,
        "total_value": _portfolio_value(db, portfolio.id),
    }


@router.post("")
async def create_investment(
    request: InvestmentCreateRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    base_slug = slugify_portfolio_name(request.name)
    slug = _allocate_portfolio_slug(db, current_user.id, base_slug)

    cc = _normalize_currency_code(request.currency_code)

    portfolio = models.InvestmentPortfolio(
        user_id=current_user.id,
        name=request.name.strip(),
        slug=slug,
        is_default_tfsa=False,
        is_active=True,
        currency_code=cc,
    )
    db.add(portfolio)
    db.flush()

    sheet_name = models.UserSheet.generate_sheet_name(current_user.id, slug).strip()
    existing_sheet = db.query(models.UserSheet).filter(models.UserSheet.sheet_name == sheet_name).first()
    if existing_sheet:
        raise HTTPException(status_code=400, detail="Sheet tab name already exists")

    db.add(
        models.UserSheet(
            user_id=current_user.id,
            portfolio_id=portfolio.id,
            sheet_name=sheet_name,
        )
    )
    db.commit()
    db.refresh(portfolio)
    logger.info(
        "Investment portfolio created",
        extra={"user_id": current_user.id, "portfolio_id": portfolio.id, "slug": portfolio.slug},
    )
    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "slug": portfolio.slug,
        "sheet_name": sheet_name,
        "is_default_tfsa": portfolio.is_default_tfsa,
        "target_allocation_enabled": portfolio.target_allocation_enabled,
        "currency_code": portfolio.currency_code,
    }


@router.delete("/{portfolio_id}")
async def delete_investment(
    portfolio_id: int,
    confirm: bool = Query(default=False),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    if not confirm:
        raise HTTPException(status_code=400, detail="Deletion requires confirm=true")

    portfolio = db.query(models.InvestmentPortfolio).filter(
        models.InvestmentPortfolio.id == portfolio_id,
        models.InvestmentPortfolio.user_id == current_user.id,
        models.InvestmentPortfolio.is_active.is_(True),
    ).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if portfolio.is_default_tfsa:
        raise HTTPException(status_code=400, detail="TFSA portfolio cannot be deleted")

    has_holdings = db.query(models.ETFHolding.id).filter(
        models.ETFHolding.user_id == current_user.id,
        models.ETFHolding.portfolio_id == portfolio.id,
    ).first()
    if has_holdings:
        raise HTTPException(status_code=400, detail="Portfolio still has holdings. Remove holdings before deleting.")

    db.query(models.UserSheet).filter(
        models.UserSheet.user_id == current_user.id,
        models.UserSheet.portfolio_id == portfolio.id,
    ).delete()
    portfolio.is_active = False
    db.commit()

    logger.info(
        "Investment portfolio deleted",
        extra={"user_id": current_user.id, "portfolio_id": portfolio.id},
    )
    return {"status": "success"}
