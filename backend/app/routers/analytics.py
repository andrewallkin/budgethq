from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date
from .. import models, database, auth
from .. import history
from ..utils import get_sast_now

router = APIRouter(tags=["analytics"])

@router.put("/etf/holdings/{holding_id}/cost-basis")
async def update_etf_cost_basis(
    holding_id: int,
    data: dict,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update the cost basis for an ETF holding."""
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="ETF holding not found")

    cost_basis = data.get('cost_basis')
    if cost_basis is None or not isinstance(cost_basis, (int, float)) or cost_basis < 0:
        raise HTTPException(status_code=400, detail="Invalid cost basis value")

    holding.cost_basis = float(cost_basis)

    # Recalculate gain/loss
    total_value = (holding.shares * holding.current_price) if holding.current_price else None
    gain_loss_percentage = None
    gain_loss_amount = None
    if total_value is not None and holding.cost_basis > 0:
        gain_loss_amount = total_value - holding.cost_basis
        gain_loss_percentage = (gain_loss_amount / holding.cost_basis) * 100

    db.commit()

    return {
        "id": holding.id,
        "cost_basis": holding.cost_basis,
        "gain_loss_percentage": gain_loss_percentage,
        "gain_loss_amount": gain_loss_amount
    }

@router.put("/bond/holdings/{holding_id}/cost-basis")
async def update_bond_cost_basis(
    holding_id: int,
    data: dict,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update the cost basis for a bond holding."""
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Bond holding not found")

    cost_basis = data.get('cost_basis')
    if cost_basis is None or not isinstance(cost_basis, (int, float)) or cost_basis < 0:
        raise HTTPException(status_code=400, detail="Invalid cost basis value")

    holding.cost_basis = float(cost_basis)

    # Recalculate gain/loss
    gain_loss_percentage = None
    gain_loss_amount = None
    if holding.current_value is not None and holding.cost_basis > 0:
        gain_loss_amount = holding.current_value - holding.cost_basis
        gain_loss_percentage = (gain_loss_amount / holding.cost_basis) * 100

    holding.updated_at = get_sast_now()
    db.commit()

    return {
        "id": holding.id,
        "cost_basis": holding.cost_basis,
        "gain_loss_percentage": gain_loss_percentage,
        "gain_loss_amount": gain_loss_amount
    }

@router.post("/portfolio/initialize-cost-basis")
async def initialize_cost_basis(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    One-time initialization: Set cost_basis = current_value for all holdings.
    Use this when you have existing holdings but don't know the original purchase price.
    This sets your starting point at 0% gain/loss.

    Works for both ETFs (cost_basis = shares × price) and Bonds (cost_basis = current_value).
    """
    # Initialize ETF holdings
    etf_holdings = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == current_user.id
    ).all()

    etf_updated = []
    for h in etf_holdings:
        if h.shares and h.current_price:
            h.cost_basis = h.shares * h.current_price
            etf_updated.append({
                'type': 'ETF',
                'holding_id': h.id,
                'name': h.etf_name,
                'jse_ticker': h.jse_ticker,
                'value': h.shares * h.current_price,
                'cost_basis': h.cost_basis
            })

    # Initialize Bond holdings
    bond_holdings = db.query(models.BondHolding).filter(
        models.BondHolding.user_id == current_user.id
    ).all()

    bond_updated = []
    for b in bond_holdings:
        if b.current_value:
            b.cost_basis = b.current_value
            bond_updated.append({
                'type': 'BOND',
                'holding_id': b.id,
                'name': b.bond_name,
                'value': b.current_value,
                'cost_basis': b.cost_basis
            })

    db.commit()

    all_updated = etf_updated + bond_updated

    return {
        'status': 'success',
        'message': f'Initialized cost_basis for {len(etf_updated)} ETFs and {len(bond_updated)} Bonds',
        'etf_count': len(etf_updated),
        'bond_count': len(bond_updated),
        'holdings': all_updated
    }

@router.post("/portfolio/trigger-snapshot")
async def trigger_snapshot(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Manually trigger a portfolio snapshot for debugging.
    Records current portfolio state to history tables.
    """
    now = get_sast_now()

    # Calculate portfolio value and contributions
    total_value, holdings_breakdown = history.calculate_portfolio_value(db, current_user.id)
    total_contributions = history.calculate_total_contributions(db, current_user.id, as_of_date=now.date())
    total_growth = total_value - total_contributions

    # Record portfolio value history
    portfolio_record = models.PortfolioValueHistory(
        user_id=current_user.id,
        total_value=total_value,
        total_contributions=total_contributions,
        total_growth=total_growth,
        recorded_at=now,
        snapshot_type="manual"
    )
    db.add(portfolio_record)

    # Record holding value history for each ETF (skip bonds - they have negative IDs)
    holdings_recorded = 0
    for holding_id, data in holdings_breakdown.items():
        # Skip bonds (negative IDs) - HoldingValueHistory only tracks ETFs
        if holding_id < 0 or data.get('type') == 'BOND':
            continue

        holding_record = models.HoldingValueHistory(
            user_id=current_user.id,
            holding_id=holding_id,
            jse_ticker=data['jse_ticker'],
            shares=data['shares'],
            price=data['price'],
            value=data['value'],
            cost_basis=data['cost_basis'],
            unrealized_gain=data['unrealized_gain'],
            recorded_at=now,
            snapshot_type="manual"
        )
        db.add(holding_record)
        holdings_recorded += 1

    # Record ETF prices
    prices_recorded = 0
    tickers_seen = set()
    for data in holdings_breakdown.values():
        if data.get('jse_ticker') and data['jse_ticker'] not in tickers_seen and data.get('price'):
            price_record = models.ETFPriceHistory(
                jse_ticker=data['jse_ticker'],
                price=data['price'],
                recorded_at=now,
                snapshot_type="manual"
            )
            db.add(price_record)
            tickers_seen.add(data['jse_ticker'])
            prices_recorded += 1

    db.commit()

    return {
        'status': 'success',
        'snapshot_time': now.isoformat() + 'Z',
        'total_value': round(total_value, 2),
        'total_contributions': round(total_contributions, 2),
        'total_growth': round(total_growth, 2),
        'holdings_recorded': holdings_recorded,
        'prices_recorded': prices_recorded
    }

@router.get("/portfolio/history")
async def get_portfolio_history(
    range: str = "1m",
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get portfolio value history for charting.
    Returns data formatted for stacked area chart (contributions vs gains).

    Range options: "1m", "3m", "6m", "1y", "all"
    """
    if range not in ["1m", "3m", "6m", "1y", "all"]:
        raise HTTPException(status_code=400, detail="Invalid range. Use: 1m, 3m, 6m, 1y, all")

    data = history.get_portfolio_history(db, current_user.id, range)

    # Calculate summary statistics
    if data:
        period_start_value = data[0]['total']
        period_end_value = data[-1]['total']
        period_change = period_end_value - period_start_value
        period_change_percent = (period_change / period_start_value * 100) if period_start_value > 0 else 0
    else:
        period_start_value = period_end_value = period_change = period_change_percent = 0

    return {
        "range": range,
        "data": data,
        "summary": {
            "period_start_value": round(period_start_value, 2),
            "period_end_value": round(period_end_value, 2),
            "period_change": round(period_change, 2),
            "period_change_percent": round(period_change_percent, 2)
        }
    }

@router.get("/portfolio/attribution")
async def get_portfolio_attribution(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get per-holding gain/loss attribution.
    Shows which holdings are driving portfolio gains/losses.
    """
    return history.get_holding_attribution(db, current_user.id)

@router.get("/portfolio/growth-breakdown")
async def get_growth_breakdown(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get breakdown of contributions vs growth.
    Shows total deposited vs total investment returns.
    """
    return history.get_growth_breakdown(db, current_user.id)

@router.get("/portfolio/daily-summary")
async def get_daily_summaries(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get daily EOD summaries for a date range.
    """
    query = db.query(models.DailyPortfolioSummary).filter(
        models.DailyPortfolioSummary.user_id == current_user.id
    )

    if start_date:
        try:
            start = date.fromisoformat(start_date)
            query = query.filter(models.DailyPortfolioSummary.date >= start)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")

    if end_date:
        try:
            end = date.fromisoformat(end_date)
            query = query.filter(models.DailyPortfolioSummary.date <= end)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")

    summaries = query.order_by(models.DailyPortfolioSummary.date).all()

    return [
        {
            "date": str(s.date),
            "opening_value": s.opening_value,
            "closing_value": s.closing_value,
            "high_value": s.high_value,
            "low_value": s.low_value,
            "total_contributions": s.total_contributions,
            "contributions_today": s.contributions_today,
            "total_growth": s.total_growth,
            "daily_change": s.daily_change,
            "daily_change_percent": s.daily_change_percent
        }
        for s in summaries
    ]

@router.get("/portfolio/monthly-summary")
async def get_monthly_summaries(
    year: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get monthly summaries, optionally filtered by year.
    """
    query = db.query(models.MonthlyPortfolioSummary).filter(
        models.MonthlyPortfolioSummary.user_id == current_user.id
    )

    if year:
        query = query.filter(models.MonthlyPortfolioSummary.year == year)

    summaries = query.order_by(
        models.MonthlyPortfolioSummary.year,
        models.MonthlyPortfolioSummary.month
    ).all()

    return [
        {
            "year": s.year,
            "month": s.month,
            "opening_value": s.opening_value,
            "closing_value": s.closing_value,
            "high_value": s.high_value,
            "low_value": s.low_value,
            "average_value": s.average_value,
            "total_contributions": s.total_contributions,
            "contributions_this_month": s.contributions_this_month,
            "total_growth": s.total_growth,
            "monthly_change": s.monthly_change,
            "monthly_change_percent": s.monthly_change_percent
        }
        for s in summaries
    ]

@router.get("/etf/{ticker}/price-history")
async def get_etf_price_history(
    ticker: str,
    range: str = "1m",
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get price history for a specific ETF ticker.

    Range options: "1m", "3m", "6m", "1y", "all"
    """
    if range not in ["1m", "3m", "6m", "1y", "all"]:
        raise HTTPException(status_code=400, detail="Invalid range. Use: 1m, 3m, 6m, 1y, all")

    data = history.get_etf_price_history(db, ticker, range)

    return {
        "ticker": ticker,
        "range": range,
        "data": data
    }
