import re
from fastapi import HTTPException
from sqlalchemy.orm import Session
from . import models


def slugify_portfolio_name(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return slug or "portfolio"


def ensure_default_tfsa_portfolio(db: Session, user_id: int) -> models.InvestmentPortfolio:
    portfolio = db.query(models.InvestmentPortfolio).filter(
        models.InvestmentPortfolio.user_id == user_id,
        models.InvestmentPortfolio.is_default_tfsa.is_(True),
    ).first()
    if portfolio:
        return portfolio

    portfolio = db.query(models.InvestmentPortfolio).filter(
        models.InvestmentPortfolio.user_id == user_id,
        models.InvestmentPortfolio.slug == "tfsa",
    ).first()
    if portfolio:
        portfolio.is_default_tfsa = True
        portfolio.target_allocation_enabled = True
        db.commit()
        db.refresh(portfolio)
        return portfolio

    portfolio = models.InvestmentPortfolio(
        user_id=user_id,
        name="TFSA",
        slug="tfsa",
        is_default_tfsa=True,
        is_active=True,
        currency_code="ZAR",
    )
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio


def resolve_user_portfolio(
    db: Session,
    user_id: int,
    portfolio_id: int | None = None,
    portfolio_slug: str | None = None,
) -> models.InvestmentPortfolio:
    if portfolio_id is not None:
        portfolio = db.query(models.InvestmentPortfolio).filter(
            models.InvestmentPortfolio.id == portfolio_id,
            models.InvestmentPortfolio.user_id == user_id,
            models.InvestmentPortfolio.is_active.is_(True),
        ).first()
        if not portfolio:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return portfolio

    if portfolio_slug:
        portfolio = db.query(models.InvestmentPortfolio).filter(
            models.InvestmentPortfolio.slug == portfolio_slug,
            models.InvestmentPortfolio.user_id == user_id,
            models.InvestmentPortfolio.is_active.is_(True),
        ).first()
        if not portfolio:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return portfolio

    return ensure_default_tfsa_portfolio(db, user_id)
