import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from .. import models, database, auth

logger = logging.getLogger(__name__)
from ..scheduler import sync_all_prices, record_hourly_snapshot

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/trigger-sync")
async def trigger_manual_sync(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Manually trigger a price sync and portfolio snapshot.
    Useful for debugging or forcing an update.
    """
    try:
        # 1. Sync prices
        await sync_all_prices()

        # 2. Record snapshot
        await record_hourly_snapshot()

        logger.info("Manual sync triggered", extra={"user_id": current_user.id})
        return {"status": "success", "message": "Manual sync and snapshot completed"}

    except Exception as e:
        logger.exception("Manual sync failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=500, detail=f"Error during manual sync: {str(e)}")

@router.get("/history/etf-prices")
async def get_admin_etf_price_history(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get raw ETF price history table data for ETFs the user holds."""
    # Get tickers that this user holds
    user_tickers = db.query(models.ETFHolding.jse_ticker).filter(
        models.ETFHolding.user_id == current_user.id
    ).distinct().subquery()

    # Only return price history for those tickers
    prices = db.query(models.ETFPriceHistory).filter(
        models.ETFPriceHistory.jse_ticker.in_(user_tickers)
    ).order_by(
        models.ETFPriceHistory.recorded_at.desc()
    ).limit(limit).all()
    return prices

@router.get("/history/portfolio-values")
async def get_admin_portfolio_history(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get raw portfolio value history table data."""
    values = db.query(models.PortfolioValueHistory).filter(
        models.PortfolioValueHistory.user_id == current_user.id
    ).order_by(
        models.PortfolioValueHistory.recorded_at.desc()
    ).limit(limit).all()
    return values

@router.get("/history/holding-values")
async def get_admin_holding_history(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get raw holding value history table data."""
    values = db.query(models.HoldingValueHistory).filter(
        models.HoldingValueHistory.user_id == current_user.id
    ).order_by(
        models.HoldingValueHistory.recorded_at.desc()
    ).limit(limit).all()
    return values

@router.get("/history/daily-summaries")
async def get_admin_daily_summaries(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get raw daily summary table data."""
    summaries = db.query(models.DailyPortfolioSummary).filter(
        models.DailyPortfolioSummary.user_id == current_user.id
    ).order_by(
        models.DailyPortfolioSummary.date.desc()
    ).limit(limit).all()
    return summaries
