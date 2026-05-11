"""
Historical price tracking and portfolio value snapshots.
Contains core functions for recording and aggregating portfolio history data.
"""

import logging
import calendar
from datetime import datetime, date, timedelta
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from . import models
from .utils import get_sast_now, get_sa_financial_year_start


# Initialize logger
logger = logging.getLogger(__name__)


def calculate_total_contributions(db: Session, user_id: int, as_of_date: Optional[date] = None) -> float:
    """
    Calculate total TFSA contributions for a user up to a given date.
    Includes both historical contributions and current year deposits.
    """
    if as_of_date is None:
        as_of_date = get_sast_now().date()

    fy_start = get_sa_financial_year_start(as_of_date)
    fy_start_date = date(fy_start, 3, 1)
    next_fy_start_date = date(fy_start + 1, 3, 1)
    
    # Sum historical contributions for years before the active FY.
    # This prevents accidental double counting when a current FY value
    # exists in TFSAHistoricalContribution and deposits also exist for that FY.
    historical_rows = db.query(
        models.TFSAHistoricalContribution.financial_year,
        models.TFSAHistoricalContribution.amount
    ).filter(
        models.TFSAHistoricalContribution.user_id == user_id
    ).all()

    historical_total = 0.0
    for financial_year, amount in historical_rows:
        if amount is None:
            continue
        try:
            year_start = int(str(financial_year).split("/")[0])
            if year_start < fy_start:
                historical_total += float(amount)
        except (ValueError, TypeError, IndexError):
            # Keep backward compatibility for unexpected legacy labels.
            historical_total += float(amount)
    
    # Sum deposits in the active SA financial year up to the given date.
    # Use deposit_date bounds as source of truth so legacy/mismatched
    # financial_year_start values do not inflate totals.
    deposits_total = db.query(func.coalesce(func.sum(models.TFSADeposit.amount), 0)).filter(
        models.TFSADeposit.user_id == user_id,
        models.TFSADeposit.deposit_date <= as_of_date,
        models.TFSADeposit.deposit_date >= fy_start_date,
        models.TFSADeposit.deposit_date < next_fy_start_date
    ).scalar() or 0
    
    return float(historical_total) + float(deposits_total)


def update_cost_basis_for_transaction(db: Session, holding_id: int, transaction_id: int) -> float:
    """
    Update cost_basis based on a specific transaction.
    
    - BUY: Adds transaction value to existing cost_basis
    - SELL: Reduces cost_basis proportionally (weighted average method)
    
    This preserves any initial cost_basis set during CSV import.
    """
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == holding_id
    ).first()
    
    if not holding:
        return 0.0
    
    transaction = db.query(models.ETFTransaction).filter(
        models.ETFTransaction.id == transaction_id
    ).first()
    
    if not transaction:
        return holding.cost_basis or 0.0
    
    current_cost_basis = holding.cost_basis or 0.0
    
    if transaction.transaction_type == "BUY":
        # Add the purchase cost to existing cost_basis
        holding.cost_basis = current_cost_basis + (transaction.total_value or 0)
    
    elif transaction.transaction_type == "SELL":
        # Reduce cost_basis proportionally
        # If selling 20% of shares, reduce cost_basis by 20%
        shares_before_sale = holding.shares + transaction.shares  # shares already reduced
        if shares_before_sale > 0:
            proportion_sold = transaction.shares / shares_before_sale
            holding.cost_basis = current_cost_basis * (1 - proportion_sold)
        else:
            holding.cost_basis = 0
    
    return holding.cost_basis


def update_holding_cost_basis(db: Session, holding_id: int) -> float:
    """
    Legacy function: Recalculate cost_basis from all transaction history.
    Only use this for full recalculation, not for incremental updates.
    """
    transactions = db.query(models.ETFTransaction).filter(
        models.ETFTransaction.holding_id == holding_id
    ).all()
    
    total_buy_value = 0.0
    total_sell_value = 0.0
    
    for t in transactions:
        if t.transaction_type == "BUY":
            total_buy_value += t.total_value or 0
        elif t.transaction_type == "SELL":
            total_sell_value += t.total_value or 0
    
    cost_basis = max(0, total_buy_value - total_sell_value)
    
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == holding_id
    ).first()
    
    if holding:
        holding.cost_basis = cost_basis
    
    return cost_basis


def calculate_portfolio_value(
    db: Session,
    user_id: int,
    portfolio_id: Optional[int] = None,
) -> Tuple[float, Dict[int, dict]]:
    """
    Calculate current portfolio value for a user.
    When portfolio_id is set, only holdings in that portfolio are included.
    When portfolio_id is None, all holdings for the user are included (aggregate).

    Returns (total_value, holdings_breakdown) where holdings_breakdown is:
    {holding_id: {shares, price, value, cost_basis, unrealized_gain, jse_ticker, type}}

    ETF-only portfolio value model.
    """
    q = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == user_id,
        models.ETFHolding.shares > 0,
    )
    if portfolio_id is not None:
        q = q.filter(models.ETFHolding.portfolio_id == portfolio_id)

    etf_holdings = q.all()

    total_value = 0.0
    holdings_breakdown = {}

    for h in etf_holdings:
        value = (h.shares or 0) * (h.current_price or 0)
        cost_basis = h.cost_basis or 0
        unrealized_gain = value - cost_basis

        holdings_breakdown[h.id] = {
            'type': 'ETF',
            'shares': h.shares or 0,
            'price': h.current_price or 0,
            'value': value,
            'cost_basis': cost_basis,
            'unrealized_gain': unrealized_gain,
            'jse_ticker': h.jse_ticker,
            'name': h.etf_name
        }
        total_value += value

    return total_value, holdings_breakdown


def snapshot_contributions_for_portfolio(
    db: Session,
    user_id: int,
    portfolio_id: int,
    as_of_date: date,
) -> float:
    """TFSA deposits/contributions line for charts; non-TFSA portfolios use 0."""
    portfolio_rec = db.query(models.InvestmentPortfolio).filter(
        models.InvestmentPortfolio.id == portfolio_id,
        models.InvestmentPortfolio.user_id == user_id,
    ).first()
    if portfolio_rec and portfolio_rec.is_default_tfsa:
        return calculate_total_contributions(db, user_id, as_of_date=as_of_date)
    return 0.0


def record_hourly_snapshot(db: Session) -> dict:
    """
    Record hourly snapshots for all users and all ETF prices.
    Called by scheduler every hour.
    Returns summary of what was recorded.
    """
    now = get_sast_now()
    STATS = {
        'prices_recorded': 0,
        'portfolios_processed': 0,
        'holdings_recorded': 0
    }
    
    # Get all unique tickers and their current prices from holdings
    tickers_prices = db.query(
        models.ETFHolding.jse_ticker,
        models.ETFHolding.current_price
    ).distinct(models.ETFHolding.jse_ticker).filter(
        models.ETFHolding.current_price.isnot(None)
    ).all()
    
    logger.info(
        "Price tickers found",
        extra={"ticker_count": len(tickers_prices)},
    )
    
    # Record price history for each ticker
    for jse_ticker, price in tickers_prices:
        if price is not None:
            price_record = models.ETFPriceHistory(
                jse_ticker=jse_ticker,
                price=price,
                recorded_at=now,
                snapshot_type="hourly"
            )
            db.add(price_record)
            STATS['prices_recorded'] += 1
            
    logger.info(
        "Price points recorded",
        extra={"prices_recorded": STATS["prices_recorded"]},
    )
    
    # Get all distinct user portfolios with holdings
    portfolio_keys = db.query(
        models.ETFHolding.user_id,
        models.ETFHolding.portfolio_id,
    ).filter(
        models.ETFHolding.shares > 0,
        models.ETFHolding.portfolio_id.isnot(None),
    ).distinct().all()

    logger.info(
        "Processing snapshots",
        extra={"portfolio_count": len(portfolio_keys)},
    )

    for user_id, portfolio_id in portfolio_keys:
        portfolio_rec = db.query(models.InvestmentPortfolio).filter(
            models.InvestmentPortfolio.id == portfolio_id,
            models.InvestmentPortfolio.user_id == user_id,
        ).first()
        if not portfolio_rec:
            continue

        total_value, holdings_breakdown = calculate_portfolio_value(
            db, user_id, portfolio_id=portfolio_id
        )
        total_contributions = snapshot_contributions_for_portfolio(
            db, user_id, portfolio_id, now.date()
        )
        total_growth = total_value - total_contributions

        portfolio_record = models.PortfolioValueHistory(
            user_id=user_id,
            portfolio_id=portfolio_id,
            total_value=total_value,
            total_contributions=total_contributions,
            total_growth=total_growth,
            recorded_at=now,
            snapshot_type="hourly"
        )
        db.add(portfolio_record)

        for holding_id, data in holdings_breakdown.items():
            holding_record = models.HoldingValueHistory(
                user_id=user_id,
                holding_id=holding_id,
                jse_ticker=data['jse_ticker'],
                shares=data['shares'],
                price=data['price'],
                value=data['value'],
                cost_basis=data['cost_basis'],
                unrealized_gain=data['unrealized_gain'],
                recorded_at=now,
                snapshot_type="hourly"
            )
            db.add(holding_record)
            STATS['holdings_recorded'] += 1

        STATS['portfolios_processed'] += 1
        logger.debug(
            "Portfolio snapshot recorded",
            extra={"user_id": user_id, "portfolio_id": portfolio_id, "total_value": total_value},
        )
    
    db.commit()
    logger.info("Snapshot complete", extra=dict(STATS))
    return STATS


def record_transaction_snapshot(db: Session, user_id: int, transaction_id: int) -> dict:
    """
    Record a snapshot when a transaction occurs.
    This captures the portfolio state at the moment of a buy/sell.
    """
    now = get_sast_now()
    
    # Update cost basis for the holding involved (incremental update)
    transaction = db.query(models.ETFTransaction).filter(
        models.ETFTransaction.id == transaction_id
    ).first()
    
    if transaction:
        update_cost_basis_for_transaction(db, transaction.holding_id, transaction_id)

    if not transaction or transaction.portfolio_id is None:
        db.commit()
        return {
            'total_value': 0,
            'total_contributions': 0,
            'total_growth': 0,
            'holdings_count': 0
        }

    portfolio_id = transaction.portfolio_id

    total_value, holdings_breakdown = calculate_portfolio_value(
        db, user_id, portfolio_id=portfolio_id
    )
    total_contributions = snapshot_contributions_for_portfolio(
        db, user_id, portfolio_id, now.date()
    )
    total_growth = total_value - total_contributions

    portfolio_record = models.PortfolioValueHistory(
        user_id=user_id,
        portfolio_id=portfolio_id,
        total_value=total_value,
        total_contributions=total_contributions,
        total_growth=total_growth,
        recorded_at=now,
        snapshot_type="transaction"
    )
    db.add(portfolio_record)

    for holding_id, data in holdings_breakdown.items():
        holding_record = models.HoldingValueHistory(
            user_id=user_id,
            holding_id=holding_id,
            jse_ticker=data['jse_ticker'],
            shares=data['shares'],
            price=data['price'],
            value=data['value'],
            cost_basis=data['cost_basis'],
            unrealized_gain=data['unrealized_gain'],
            recorded_at=now,
            snapshot_type="transaction"
        )
        db.add(holding_record)
    
    db.commit()
    
    return {
        'total_value': total_value,
        'total_contributions': total_contributions,
        'total_growth': total_growth,
        'holdings_count': len(holdings_breakdown)
    }


def create_daily_summary(db: Session, target_date: Optional[date] = None) -> dict:
    """
    Create end-of-day summaries from hourly snapshots for all users.
    Called daily at 17:30 SAST (after market close).
    """
    if target_date is None:
        target_date = date.today()

    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date, datetime.max.time())

    STATS = {'summaries_created': 0}

    pairs_with_data = db.query(
        models.PortfolioValueHistory.user_id,
        models.PortfolioValueHistory.portfolio_id,
    ).filter(
        models.PortfolioValueHistory.recorded_at >= start_of_day,
        models.PortfolioValueHistory.recorded_at <= end_of_day
    ).distinct().all()

    logger.info(
        "Creating daily summaries",
        extra={"portfolio_count": len(pairs_with_data), "target_date": str(target_date)},
    )

    for user_id, portfolio_id in pairs_with_data:
        existing = db.query(models.DailyPortfolioSummary).filter(
            models.DailyPortfolioSummary.user_id == user_id,
            models.DailyPortfolioSummary.portfolio_id == portfolio_id,
            models.DailyPortfolioSummary.date == target_date
        ).first()

        if existing:
            logger.debug(
                "Summary already exists, skipping",
                extra={
                    "user_id": user_id,
                    "portfolio_id": portfolio_id,
                    "target_date": str(target_date),
                },
            )
            continue

        snapshots = db.query(models.PortfolioValueHistory).filter(
            models.PortfolioValueHistory.user_id == user_id,
            models.PortfolioValueHistory.portfolio_id == portfolio_id,
            models.PortfolioValueHistory.recorded_at >= start_of_day,
            models.PortfolioValueHistory.recorded_at <= end_of_day
        ).order_by(models.PortfolioValueHistory.recorded_at).all()

        if not snapshots:
            continue

        portfolio_rec = db.query(models.InvestmentPortfolio).filter(
            models.InvestmentPortfolio.id == portfolio_id,
            models.InvestmentPortfolio.user_id == user_id,
        ).first()

        values = [s.total_value for s in snapshots]
        opening_value = values[0]
        closing_value = values[-1]
        high_value = max(values)
        low_value = min(values)

        total_contributions = snapshots[-1].total_contributions
        total_growth = snapshots[-1].total_growth

        if portfolio_rec and portfolio_rec.is_default_tfsa:
            contributions_today = db.query(func.coalesce(func.sum(models.TFSADeposit.amount), 0)).filter(
                models.TFSADeposit.user_id == user_id,
                models.TFSADeposit.deposit_date == target_date
            ).scalar() or 0
        else:
            contributions_today = 0

        daily_change = closing_value - opening_value
        daily_change_percent = (daily_change / opening_value * 100) if opening_value > 0 else 0

        summary = models.DailyPortfolioSummary(
            user_id=user_id,
            portfolio_id=portfolio_id,
            date=target_date,
            opening_value=opening_value,
            closing_value=closing_value,
            high_value=high_value,
            low_value=low_value,
            total_contributions=total_contributions,
            contributions_today=float(contributions_today),
            total_growth=total_growth,
            daily_change=daily_change,
            daily_change_percent=daily_change_percent
        )
        db.add(summary)
        STATS['summaries_created'] += 1

    db.commit()
    logger.info("Daily summary complete", extra=dict(STATS))
    return STATS


def create_monthly_summary(db: Session, year: int, month: int) -> dict:
    """
    Create monthly summary from daily summaries.
    Called on the 1st of each month for the previous month.
    """
    stats = {'summaries_created': 0}
    
    pairs_with_data = db.query(
        models.DailyPortfolioSummary.user_id,
        models.DailyPortfolioSummary.portfolio_id,
    ).filter(
        func.extract('year', models.DailyPortfolioSummary.date) == year,
        func.extract('month', models.DailyPortfolioSummary.date) == month
    ).distinct().all()

    for user_id, portfolio_id in pairs_with_data:
        existing = db.query(models.MonthlyPortfolioSummary).filter(
            models.MonthlyPortfolioSummary.user_id == user_id,
            models.MonthlyPortfolioSummary.portfolio_id == portfolio_id,
            models.MonthlyPortfolioSummary.year == year,
            models.MonthlyPortfolioSummary.month == month
        ).first()

        if existing:
            continue

        daily_summaries = db.query(models.DailyPortfolioSummary).filter(
            models.DailyPortfolioSummary.user_id == user_id,
            models.DailyPortfolioSummary.portfolio_id == portfolio_id,
            func.extract('year', models.DailyPortfolioSummary.date) == year,
            func.extract('month', models.DailyPortfolioSummary.date) == month
        ).order_by(models.DailyPortfolioSummary.date).all()
        
        if not daily_summaries:
            continue
        
        # Calculate monthly metrics
        opening_value = daily_summaries[0].opening_value
        closing_value = daily_summaries[-1].closing_value
        high_value = max(d.high_value for d in daily_summaries)
        low_value = min(d.low_value for d in daily_summaries)
        average_value = sum(d.closing_value for d in daily_summaries) / len(daily_summaries)
        
        # Get contributions data from most recent day
        total_contributions = daily_summaries[-1].total_contributions
        total_growth = daily_summaries[-1].total_growth
        
        # Sum contributions made this month
        contributions_this_month = sum(d.contributions_today or 0 for d in daily_summaries)
        
        # Calculate monthly change
        monthly_change = closing_value - opening_value
        monthly_change_percent = (monthly_change / opening_value * 100) if opening_value > 0 else 0
        
        # Create summary
        summary = models.MonthlyPortfolioSummary(
            user_id=user_id,
            portfolio_id=portfolio_id,
            year=year,
            month=month,
            opening_value=opening_value,
            closing_value=closing_value,
            high_value=high_value,
            low_value=low_value,
            average_value=average_value,
            total_contributions=total_contributions,
            contributions_this_month=contributions_this_month,
            total_growth=total_growth,
            monthly_change=monthly_change,
            monthly_change_percent=monthly_change_percent
        )
        db.add(summary)
        stats['summaries_created'] += 1
    
    db.commit()
    return stats


def cleanup_old_hourly_data(db: Session, retention_days: int = 90) -> dict:
    """
    Delete hourly snapshots older than retention_days where daily summary exists.
    Transaction snapshots are never deleted.
    Called weekly (e.g., Sunday 3am).
    """
    cutoff_date = get_sast_now() - timedelta(days=retention_days)
    
    stats = {
        'portfolio_deleted': 0,
        'holding_deleted': 0,
        'price_deleted': 0
    }
    
    # Delete old portfolio value history (hourly only, not transactions)
    deleted = db.query(models.PortfolioValueHistory).filter(
        models.PortfolioValueHistory.snapshot_type == 'hourly',
        models.PortfolioValueHistory.recorded_at < cutoff_date
    ).delete(synchronize_session=False)
    stats['portfolio_deleted'] = deleted
    
    # Delete old holding value history (hourly only)
    deleted = db.query(models.HoldingValueHistory).filter(
        models.HoldingValueHistory.snapshot_type == 'hourly',
        models.HoldingValueHistory.recorded_at < cutoff_date
    ).delete(synchronize_session=False)
    stats['holding_deleted'] = deleted
    
    # Delete old price history (hourly only)
    deleted = db.query(models.ETFPriceHistory).filter(
        models.ETFPriceHistory.snapshot_type == 'hourly',
        models.ETFPriceHistory.recorded_at < cutoff_date
    ).delete(synchronize_session=False)
    stats['price_deleted'] = deleted
    
    db.commit()
    return stats


def get_portfolio_history(
    db: Session,
    user_id: int,
    range_param: str = "1m",
    portfolio_id: int | None = None,
    include_tfsa_contribution_overlay: bool = False,
) -> List[Dict]:
    """
    Get portfolio history data for charting.
    portfolio_id: required scope for series (callers should pass resolved portfolio id).

    include_tfsa_contribution_overlay: when True, contributions/gain use TFSA deposit logic;
    when False (non-TFSA portfolios), contributions line is 0 and gain equals total value.
    """
    now = get_sast_now()

    if range_param == "1m":
        start_date = now - timedelta(days=30)
        return _get_daily_from_hourly(
            db, user_id, portfolio_id, start_date, now, include_tfsa_contribution_overlay
        )

    elif range_param == "3m":
        start_date = now - timedelta(days=90)
        return _get_daily_from_hourly(
            db, user_id, portfolio_id, start_date, now, include_tfsa_contribution_overlay
        )

    elif range_param == "6m":
        start_date = now - timedelta(days=180)
        return _get_weekly_from_daily(
            db, user_id, portfolio_id, start_date, now, include_tfsa_contribution_overlay
        )

    elif range_param == "1y":
        start_date = now - timedelta(days=365)
        return _get_weekly_from_daily(
            db, user_id, portfolio_id, start_date, now, include_tfsa_contribution_overlay
        )

    else:
        return _get_from_monthly_summary(db, user_id, portfolio_id, include_tfsa_contribution_overlay)


def _get_daily_from_hourly(
    db: Session,
    user_id: int,
    portfolio_id: int | None,
    start_date: datetime,
    end_date: datetime,
    include_tfsa_contribution_overlay: bool,
) -> List[Dict]:
    """Aggregate hourly data to daily points (using last value of the day)."""
    q = db.query(
        models.PortfolioValueHistory.recorded_at,
        models.PortfolioValueHistory.total_value,
        models.PortfolioValueHistory.total_contributions,
        models.PortfolioValueHistory.total_growth,
    ).filter(
        models.PortfolioValueHistory.user_id == user_id,
        models.PortfolioValueHistory.recorded_at >= start_date,
        models.PortfolioValueHistory.recorded_at <= end_date,
    )
    if portfolio_id is not None:
        q = q.filter(models.PortfolioValueHistory.portfolio_id == portfolio_id)

    results = q.order_by(models.PortfolioValueHistory.recorded_at).all()

    daily_map = {}
    for r in results:
        point_date = r.recorded_at.date()
        day_str = str(point_date)
        if include_tfsa_contribution_overlay:
            contributions = calculate_total_contributions(db, user_id, as_of_date=point_date)
        else:
            contributions = 0.0
        total_value = float(r.total_value or 0)
        daily_map[day_str] = {
            'date': day_str,
            'contributions': round(contributions, 2),
            'gain': round(total_value - contributions, 2),
            'total': round(total_value, 2)
        }

    return sorted(daily_map.values(), key=lambda x: x['date'])


def _get_from_daily_summary(
    db: Session,
    user_id: int,
    portfolio_id: int | None,
    start_date: datetime,
    end_date: datetime,
    include_tfsa_contribution_overlay: bool,
) -> List[Dict]:
    """Get data from daily summaries."""
    q = db.query(models.DailyPortfolioSummary).filter(
        models.DailyPortfolioSummary.user_id == user_id,
        models.DailyPortfolioSummary.date >= start_date.date(),
        models.DailyPortfolioSummary.date <= end_date.date(),
    )
    if portfolio_id is not None:
        q = q.filter(models.DailyPortfolioSummary.portfolio_id == portfolio_id)

    results = q.order_by(models.DailyPortfolioSummary.date).all()

    points = []
    for r in results:
        point_date = r.date
        if include_tfsa_contribution_overlay:
            contributions = calculate_total_contributions(db, user_id, as_of_date=point_date)
        else:
            contributions = 0.0
        total_value = float(r.closing_value or 0)
        points.append({
            'date': str(point_date),
            'contributions': round(contributions, 2),
            'gain': round(total_value - contributions, 2),
            'total': round(total_value, 2)
        })
    return points


def _get_weekly_from_daily(
    db: Session,
    user_id: int,
    portfolio_id: int | None,
    start_date: datetime,
    end_date: datetime,
    include_tfsa_contribution_overlay: bool,
) -> List[Dict]:
    """Aggregate daily summaries to weekly points."""
    daily_data = _get_from_daily_summary(
        db, user_id, portfolio_id, start_date, end_date, include_tfsa_contribution_overlay
    )

    if not daily_data:
        return []

    weekly_data = {}
    for d in daily_data:
        date_obj = datetime.strptime(d['date'], '%Y-%m-%d')
        week_key = date_obj.strftime('%Y-W%W')

        if week_key not in weekly_data:
            weekly_data[week_key] = {
                'date': d['date'],
                'contributions': [],
                'gain': [],
                'total': []
            }

        weekly_data[week_key]['contributions'].append(d['contributions'])
        weekly_data[week_key]['gain'].append(d['gain'])
        weekly_data[week_key]['total'].append(d['total'])

    result = []
    for week_key in sorted(weekly_data.keys()):
        week = weekly_data[week_key]
        result.append({
            'date': week['date'],
            'contributions': round(sum(week['contributions']) / len(week['contributions']), 2),
            'gain': round(sum(week['gain']) / len(week['gain']), 2),
            'total': round(sum(week['total']) / len(week['total']), 2)
        })

    return result


def _get_from_monthly_summary(
    db: Session,
    user_id: int,
    portfolio_id: int | None,
    include_tfsa_contribution_overlay: bool,
) -> List[Dict]:
    """Get data from monthly summaries."""
    q = db.query(models.MonthlyPortfolioSummary).filter(
        models.MonthlyPortfolioSummary.user_id == user_id,
    )
    if portfolio_id is not None:
        q = q.filter(models.MonthlyPortfolioSummary.portfolio_id == portfolio_id)

    results = q.order_by(
        models.MonthlyPortfolioSummary.year,
        models.MonthlyPortfolioSummary.month
    ).all()

    points = []
    for r in results:
        month_end_day = calendar.monthrange(r.year, r.month)[1]
        point_date = date(r.year, r.month, month_end_day)
        if include_tfsa_contribution_overlay:
            contributions = calculate_total_contributions(db, user_id, as_of_date=point_date)
        else:
            contributions = 0.0
        total_value = float(r.closing_value or 0)
        points.append({
            'date': f"{r.year}-{r.month:02d}-01",
            'contributions': round(contributions, 2),
            'gain': round(total_value - contributions, 2),
            'total': round(total_value, 2)
        })
    return points


def get_holding_attribution(db: Session, user_id: int) -> List[Dict]:
    """
    Get per-holding gain/loss attribution for the current portfolio state.
    Returns breakdown of which holdings are driving gains/losses.
    ETF-only attribution.
    """
    result = []
    
    # ETF holdings
    etf_holdings = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == user_id,
        models.ETFHolding.shares > 0  # Only include holdings with actual shares
    ).all()
    
    for h in etf_holdings:
        value = (h.shares or 0) * (h.current_price or 0)
        cost_basis = h.cost_basis or 0
        unrealized_gain = value - cost_basis
        gain_percent = (unrealized_gain / cost_basis * 100) if cost_basis > 0 else 0
        
        result.append({
            'type': 'ETF',
            'holding_id': h.id,
            'jse_ticker': h.jse_ticker,
            'name': h.etf_name,
            'shares': h.shares,
            'current_price': h.current_price,
            'value': round(value, 2),
            'cost_basis': round(cost_basis, 2),
            'unrealized_gain': round(unrealized_gain, 2),
            'gain_percent': round(gain_percent, 2)
        })
    
    # Sort by absolute gain (biggest movers first)
    result.sort(key=lambda x: abs(x['unrealized_gain']), reverse=True)
    
    return result


def get_growth_breakdown(db: Session, user_id: int) -> Dict:
    """
    Get breakdown of contributions vs growth for the current portfolio.
    """
    total_value, _ = calculate_portfolio_value(db, user_id)
    total_contributions = calculate_total_contributions(db, user_id)
    total_growth = total_value - total_contributions
    growth_percentage = (total_growth / total_contributions * 100) if total_contributions > 0 else 0
    
    return {
        'total_value': round(total_value, 2),
        'total_contributions': round(total_contributions, 2),
        'total_growth': round(total_growth, 2),
        'growth_percentage': round(growth_percentage, 2)
    }


def get_etf_price_history(db: Session, jse_ticker: str, range_param: str = "1m") -> List[Dict]:
    """
    Get price history for a specific ETF ticker.
    """
    now = get_sast_now()
    
    if range_param == "1m":
        start_date = now - timedelta(days=30)
    elif range_param == "3m":
        start_date = now - timedelta(days=90)
    elif range_param == "6m":
        start_date = now - timedelta(days=180)
    elif range_param == "1y":
        start_date = now - timedelta(days=365)
    else:
        start_date = datetime(2020, 1, 1)  # All time
    
    results = db.query(
        func.date(models.ETFPriceHistory.recorded_at).label('date'),
        func.avg(models.ETFPriceHistory.price).label('avg_price'),
        func.max(models.ETFPriceHistory.price).label('high'),
        func.min(models.ETFPriceHistory.price).label('low')
    ).filter(
        models.ETFPriceHistory.jse_ticker == jse_ticker,
        models.ETFPriceHistory.recorded_at >= start_date
    ).group_by(
        func.date(models.ETFPriceHistory.recorded_at)
    ).order_by(
        func.date(models.ETFPriceHistory.recorded_at)
    ).all()
    
    return [
        {
            'date': str(r.date),
            'price': round(r.avg_price or 0, 2),
            'high': round(r.high or 0, 2),
            'low': round(r.low or 0, 2)
        }
        for r in results
    ]




