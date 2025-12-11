"""
Historical price tracking and portfolio value snapshots.
Contains core functions for recording and aggregating portfolio history data.
"""

from datetime import datetime, date, timedelta
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from . import models


def calculate_total_contributions(db: Session, user_id: int, as_of_date: Optional[date] = None) -> float:
    """
    Calculate total TFSA contributions for a user up to a given date.
    Includes both historical contributions and current year deposits.
    """
    if as_of_date is None:
        as_of_date = date.today()
    
    # Sum historical contributions (full years)
    historical_total = db.query(func.coalesce(func.sum(models.TFSAHistoricalContribution.amount), 0)).filter(
        models.TFSAHistoricalContribution.user_id == user_id
    ).scalar() or 0
    
    # Sum deposits up to the given date
    deposits_total = db.query(func.coalesce(func.sum(models.TFSADeposit.amount), 0)).filter(
        models.TFSADeposit.user_id == user_id,
        models.TFSADeposit.deposit_date <= as_of_date
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


def calculate_portfolio_value(db: Session, user_id: int) -> Tuple[float, Dict[int, dict]]:
    """
    Calculate current portfolio value for a user.
    Returns (total_value, holdings_breakdown) where holdings_breakdown is:
    {holding_id: {shares, price, value, cost_basis, unrealized_gain, jse_ticker, type}}
    
    Note: ETF holding_ids are positive, Bond holding_ids use negative offset to avoid collision.
    """
    etf_holdings = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == user_id
    ).all()
    
    bond_holdings = db.query(models.BondHolding).filter(
        models.BondHolding.user_id == user_id
    ).all()
    
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
    
    # Add bond values with cost_basis tracking
    for b in bond_holdings:
        value = b.current_value or 0
        cost_basis = b.cost_basis or 0
        unrealized_gain = value - cost_basis
        
        # Use negative ID offset for bonds to avoid collision with ETF IDs
        bond_key = -b.id
        holdings_breakdown[bond_key] = {
            'type': 'BOND',
            'shares': None,
            'price': None,
            'value': value,
            'cost_basis': cost_basis,
            'unrealized_gain': unrealized_gain,
            'jse_ticker': None,
            'name': b.bond_name,
            'bond_id': b.id
        }
        total_value += value
    
    return total_value, holdings_breakdown


def record_hourly_snapshot(db: Session) -> dict:
    """
    Record hourly snapshots for all users and all ETF prices.
    Called by scheduler every hour.
    Returns summary of what was recorded.
    """
    now = datetime.utcnow()
    stats = {
        'prices_recorded': 0,
        'users_processed': 0,
        'holdings_recorded': 0
    }
    
    # Get all unique tickers and their current prices from holdings
    tickers_prices = db.query(
        models.ETFHolding.jse_ticker,
        models.ETFHolding.current_price
    ).distinct(models.ETFHolding.jse_ticker).filter(
        models.ETFHolding.current_price.isnot(None)
    ).all()
    
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
            stats['prices_recorded'] += 1
    
    # Get all users with holdings
    users_with_holdings = db.query(models.ETFHolding.user_id).distinct().all()
    user_ids = [u[0] for u in users_with_holdings]
    
    for user_id in user_ids:
        # Calculate portfolio value and contributions
        total_value, holdings_breakdown = calculate_portfolio_value(db, user_id)
        total_contributions = calculate_total_contributions(db, user_id)
        total_growth = total_value - total_contributions
        
        # Record portfolio value history
        portfolio_record = models.PortfolioValueHistory(
            user_id=user_id,
            total_value=total_value,
            total_contributions=total_contributions,
            total_growth=total_growth,
            recorded_at=now,
            snapshot_type="hourly"
        )
        db.add(portfolio_record)
        
        # Record holding value history for each ETF (skip bonds - they have negative IDs)
        for holding_id, data in holdings_breakdown.items():
            # Skip bonds (negative IDs) - HoldingValueHistory only tracks ETFs
            if holding_id < 0 or data.get('type') == 'BOND':
                continue
            
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
            stats['holdings_recorded'] += 1
        
        stats['users_processed'] += 1
    
    db.commit()
    return stats


def record_transaction_snapshot(db: Session, user_id: int, transaction_id: int) -> dict:
    """
    Record a snapshot when a transaction occurs.
    This captures the portfolio state at the moment of a buy/sell.
    """
    now = datetime.utcnow()
    
    # Update cost basis for the holding involved (incremental update)
    transaction = db.query(models.ETFTransaction).filter(
        models.ETFTransaction.id == transaction_id
    ).first()
    
    if transaction:
        update_cost_basis_for_transaction(db, transaction.holding_id, transaction_id)
    
    # Calculate portfolio state
    total_value, holdings_breakdown = calculate_portfolio_value(db, user_id)
    total_contributions = calculate_total_contributions(db, user_id)
    total_growth = total_value - total_contributions
    
    # Record portfolio value history with transaction type
    portfolio_record = models.PortfolioValueHistory(
        user_id=user_id,
        total_value=total_value,
        total_contributions=total_contributions,
        total_growth=total_growth,
        recorded_at=now,
        snapshot_type="transaction"
    )
    db.add(portfolio_record)
    
    # Record holding value history for each ETF
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
    
    stats = {'summaries_created': 0}
    
    # Get all users with portfolio history for this day
    users_with_data = db.query(models.PortfolioValueHistory.user_id).filter(
        models.PortfolioValueHistory.recorded_at >= start_of_day,
        models.PortfolioValueHistory.recorded_at <= end_of_day
    ).distinct().all()
    
    for (user_id,) in users_with_data:
        # Check if summary already exists
        existing = db.query(models.DailyPortfolioSummary).filter(
            models.DailyPortfolioSummary.user_id == user_id,
            models.DailyPortfolioSummary.date == target_date
        ).first()
        
        if existing:
            continue
        
        # Get all snapshots for this user today
        snapshots = db.query(models.PortfolioValueHistory).filter(
            models.PortfolioValueHistory.user_id == user_id,
            models.PortfolioValueHistory.recorded_at >= start_of_day,
            models.PortfolioValueHistory.recorded_at <= end_of_day
        ).order_by(models.PortfolioValueHistory.recorded_at).all()
        
        if not snapshots:
            continue
        
        # Calculate OHLC
        values = [s.total_value for s in snapshots]
        opening_value = values[0]
        closing_value = values[-1]
        high_value = max(values)
        low_value = min(values)
        
        # Get contributions data from most recent snapshot
        total_contributions = snapshots[-1].total_contributions
        total_growth = snapshots[-1].total_growth
        
        # Calculate contributions made today
        contributions_today = db.query(func.coalesce(func.sum(models.TFSADeposit.amount), 0)).filter(
            models.TFSADeposit.user_id == user_id,
            models.TFSADeposit.deposit_date == target_date
        ).scalar() or 0
        
        # Calculate daily change
        daily_change = closing_value - opening_value
        daily_change_percent = (daily_change / opening_value * 100) if opening_value > 0 else 0
        
        # Create summary
        summary = models.DailyPortfolioSummary(
            user_id=user_id,
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
        stats['summaries_created'] += 1
    
    db.commit()
    return stats


def create_monthly_summary(db: Session, year: int, month: int) -> dict:
    """
    Create monthly summary from daily summaries.
    Called on the 1st of each month for the previous month.
    """
    stats = {'summaries_created': 0}
    
    # Get all users with daily summaries for this month
    users_with_data = db.query(models.DailyPortfolioSummary.user_id).filter(
        func.extract('year', models.DailyPortfolioSummary.date) == year,
        func.extract('month', models.DailyPortfolioSummary.date) == month
    ).distinct().all()
    
    for (user_id,) in users_with_data:
        # Check if summary already exists
        existing = db.query(models.MonthlyPortfolioSummary).filter(
            models.MonthlyPortfolioSummary.user_id == user_id,
            models.MonthlyPortfolioSummary.year == year,
            models.MonthlyPortfolioSummary.month == month
        ).first()
        
        if existing:
            continue
        
        # Get all daily summaries for this month
        daily_summaries = db.query(models.DailyPortfolioSummary).filter(
            models.DailyPortfolioSummary.user_id == user_id,
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
    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
    
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
    range_param: str = "1m"
) -> List[Dict]:
    """
    Get portfolio history data for charting.
    Automatically selects the right granularity based on range.
    
    range_param options: "1m", "3m", "6m", "1y", "all"
    
    Returns list of {date, contributions, gain, total} for stacked area chart.
    """
    now = datetime.utcnow()
    
    # Determine date range and data source
    if range_param == "1m":
        # Use hourly data, aggregate to daily
        start_date = now - timedelta(days=30)
        return _get_daily_from_hourly(db, user_id, start_date, now)
    
    elif range_param == "3m":
        # Use daily summaries
        start_date = now - timedelta(days=90)
        return _get_from_daily_summary(db, user_id, start_date, now)
    
    elif range_param == "6m":
        # Use daily summaries, aggregate to weekly
        start_date = now - timedelta(days=180)
        return _get_weekly_from_daily(db, user_id, start_date, now)
    
    elif range_param == "1y":
        # Use daily summaries, aggregate to weekly
        start_date = now - timedelta(days=365)
        return _get_weekly_from_daily(db, user_id, start_date, now)
    
    else:  # "all"
        # Use monthly summaries
        return _get_from_monthly_summary(db, user_id)


def _get_daily_from_hourly(db: Session, user_id: int, start_date: datetime, end_date: datetime) -> List[Dict]:
    """Aggregate hourly data to daily points."""
    # Get daily aggregates from hourly data
    results = db.query(
        func.date(models.PortfolioValueHistory.recorded_at).label('date'),
        func.avg(models.PortfolioValueHistory.total_value).label('avg_value'),
        func.avg(models.PortfolioValueHistory.total_contributions).label('avg_contributions'),
        func.avg(models.PortfolioValueHistory.total_growth).label('avg_growth')
    ).filter(
        models.PortfolioValueHistory.user_id == user_id,
        models.PortfolioValueHistory.recorded_at >= start_date,
        models.PortfolioValueHistory.recorded_at <= end_date
    ).group_by(
        func.date(models.PortfolioValueHistory.recorded_at)
    ).order_by(
        func.date(models.PortfolioValueHistory.recorded_at)
    ).all()
    
    return [
        {
            'date': str(r.date),
            'contributions': round(r.avg_contributions or 0, 2),
            'gain': round(r.avg_growth or 0, 2),
            'total': round(r.avg_value or 0, 2)
        }
        for r in results
    ]


def _get_from_daily_summary(db: Session, user_id: int, start_date: datetime, end_date: datetime) -> List[Dict]:
    """Get data from daily summaries."""
    results = db.query(models.DailyPortfolioSummary).filter(
        models.DailyPortfolioSummary.user_id == user_id,
        models.DailyPortfolioSummary.date >= start_date.date(),
        models.DailyPortfolioSummary.date <= end_date.date()
    ).order_by(models.DailyPortfolioSummary.date).all()
    
    return [
        {
            'date': str(r.date),
            'contributions': round(r.total_contributions or 0, 2),
            'gain': round(r.total_growth or 0, 2),
            'total': round(r.closing_value or 0, 2)
        }
        for r in results
    ]


def _get_weekly_from_daily(db: Session, user_id: int, start_date: datetime, end_date: datetime) -> List[Dict]:
    """Aggregate daily summaries to weekly points."""
    # Get all daily data
    daily_data = _get_from_daily_summary(db, user_id, start_date, end_date)
    
    if not daily_data:
        return []
    
    # Group by week (ISO week)
    weekly_data = {}
    for d in daily_data:
        date_obj = datetime.strptime(d['date'], '%Y-%m-%d')
        week_key = date_obj.strftime('%Y-W%W')
        
        if week_key not in weekly_data:
            weekly_data[week_key] = {
                'date': d['date'],  # Use first day of week
                'contributions': [],
                'gain': [],
                'total': []
            }
        
        weekly_data[week_key]['contributions'].append(d['contributions'])
        weekly_data[week_key]['gain'].append(d['gain'])
        weekly_data[week_key]['total'].append(d['total'])
    
    # Average each week
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


def _get_from_monthly_summary(db: Session, user_id: int) -> List[Dict]:
    """Get data from monthly summaries."""
    results = db.query(models.MonthlyPortfolioSummary).filter(
        models.MonthlyPortfolioSummary.user_id == user_id
    ).order_by(
        models.MonthlyPortfolioSummary.year,
        models.MonthlyPortfolioSummary.month
    ).all()
    
    return [
        {
            'date': f"{r.year}-{r.month:02d}-01",
            'contributions': round(r.total_contributions or 0, 2),
            'gain': round(r.total_growth or 0, 2),
            'total': round(r.closing_value or 0, 2)
        }
        for r in results
    ]


def get_holding_attribution(db: Session, user_id: int) -> List[Dict]:
    """
    Get per-holding gain/loss attribution for the current portfolio state.
    Returns breakdown of which holdings are driving gains/losses.
    Includes both ETFs and Bonds.
    """
    result = []
    
    # ETF holdings
    etf_holdings = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == user_id
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
    
    # Bond holdings
    bond_holdings = db.query(models.BondHolding).filter(
        models.BondHolding.user_id == user_id
    ).all()
    
    for b in bond_holdings:
        value = b.current_value or 0
        cost_basis = b.cost_basis or 0
        unrealized_gain = value - cost_basis
        gain_percent = (unrealized_gain / cost_basis * 100) if cost_basis > 0 else 0
        
        result.append({
            'type': 'BOND',
            'holding_id': b.id,
            'jse_ticker': None,
            'name': b.bond_name,
            'shares': None,
            'current_price': None,
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
    now = datetime.utcnow()
    
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

