import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import timedelta
from .. import models, auth

logger = logging.getLogger(__name__)
from ..sheets_service import get_sheets_service
from ..scheduler import sync_all_prices, get_last_sync_time, set_last_sync_time
from ..utils import get_sast_now
from pydantic import BaseModel
from ..portfolio_service import resolve_user_portfolio

class AddETFToSheetRequest(BaseModel):
    jse_ticker: str
    etf_name: str

router = APIRouter(prefix="/etf", tags=["sheets-integration"])

@router.post("/sync-prices")
async def sync_etf_prices(
    portfolio_id: int | None = Query(default=None),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Manually trigger a price sync from Google Sheets."""
    from .. import database
    db = database.SessionLocal()
    try:
        portfolio = resolve_user_portfolio(db, current_user.id, portfolio_id=portfolio_id)
    finally:
        db.close()
    sheets_service = get_sheets_service(current_user.id, portfolio.id)

    if not sheets_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Google Sheets service is not available. Check credentials."
        )

    # Get all prices from sheets
    all_prices = sheets_service.get_all_etf_prices()
    prices_map = {p['jse_ticker']: p['current_price'] for p in all_prices}

    # Update all user holdings
    from .. import models, database
    from sqlalchemy.orm import Session

    # Create a new session for this operation
    db = database.SessionLocal()
    try:
        holdings = db.query(models.ETFHolding).filter(
            models.ETFHolding.user_id == current_user.id,
            models.ETFHolding.portfolio_id == portfolio.id,
        ).all()

        updated_count = 0
        now = get_sast_now()

        for holding in holdings:
            if holding.jse_ticker in prices_map:
                new_price = prices_map[holding.jse_ticker]
                if new_price is not None:
                    holding.current_price = new_price
                    holding.price_updated_at = now
                    updated_count += 1

        db.commit()

        # Update the global last sync time so the UI shows the correct time
        set_last_sync_time(now)
        logger.info(
            "Manual price sync completed",
            extra={"user_id": current_user.id, "updated_count": updated_count, "total_holdings": len(holdings)},
        )
        return {
            "status": "success",
            "updated_count": updated_count,
            "total_holdings": len(holdings),
            "sync_time": now.isoformat() + "Z"
        }
    finally:
        db.close()

@router.post("/add-to-sheet")
async def add_etf_to_sheet(
    request: AddETFToSheetRequest,
    portfolio_id: int | None = Query(default=None),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Add a new ETF to the Google Sheet (creates row with GOOGLEFINANCE formula)."""
    from .. import database
    db = database.SessionLocal()
    try:
        portfolio = resolve_user_portfolio(db, current_user.id, portfolio_id=portfolio_id)
    finally:
        db.close()
    sheets_service = get_sheets_service(current_user.id, portfolio.id)

    if not sheets_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Google Sheets service is not available. Check credentials."
        )

    # Check if ticker already exists
    if sheets_service.check_ticker_exists(request.jse_ticker):
        raise HTTPException(
            status_code=400,
            detail=f"Ticker {request.jse_ticker} already exists in the sheet"
        )

    success = sheets_service.add_etf_to_sheet(
        request.jse_ticker,
        request.etf_name
    )

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to add ETF to Google Sheet"
        )
    logger.info(
        "ETF added to sheet",
        extra={"user_id": current_user.id, "jse_ticker": request.jse_ticker},
    )
    return {
        "status": "success",
        "message": f"Added {request.jse_ticker} to Google Sheet"
    }

@router.get("/sheet-prices")
async def get_sheet_prices(
    portfolio_id: int | None = Query(default=None),
    current_user: models.User = Depends(auth.get_current_user)
):
    """Get all ETF prices directly from Google Sheets (for debugging/reference)."""
    from .. import database
    db = database.SessionLocal()
    try:
        portfolio = resolve_user_portfolio(db, current_user.id, portfolio_id=portfolio_id)
    finally:
        db.close()
    sheets_service = get_sheets_service(current_user.id, portfolio.id)

    if not sheets_service.is_available():
        raise HTTPException(
            status_code=503,
            detail="Google Sheets service is not available. Check credentials."
        )

    return sheets_service.get_all_etf_prices()

@router.get("/last-sync")
async def get_last_price_sync(
    current_user: models.User = Depends(auth.get_current_user)
):
    """Get the timestamp of the last price sync."""
    last_sync = get_last_sync_time()
    if last_sync:
        # Convert SAST time to UTC for API response
        utc_time = last_sync - timedelta(hours=2)  # SAST is UTC+2
        return {
            "last_sync": utc_time.isoformat() + "Z",
            "sync_interval_minutes": 5
        }
    return {
        "last_sync": None,
        "sync_interval_minutes": 5
    }
