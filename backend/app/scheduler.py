"""
Background scheduler for periodic ETF price updates.
Fetches prices from Google Sheets every 5 minutes and updates all holdings.
"""

from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from .database import SessionLocal
from .sheets_service import get_sheets_service
from . import models


# Global scheduler instance
scheduler: AsyncIOScheduler = None

# Track last sync time globally
last_sync_time: datetime = None


def get_last_sync_time() -> datetime:
    """Get the last successful sync time."""
    global last_sync_time
    return last_sync_time


async def sync_all_prices():
    """
    Background task to sync prices from Google Sheets for all users.
    This runs every 5 minutes.
    """
    global last_sync_time
    
    print(f"[{datetime.utcnow().isoformat()}] Starting scheduled price sync...")
    
    sheets_service = get_sheets_service()
    
    if not sheets_service.is_available():
        print("Google Sheets service not available, skipping sync")
        return
    
    # Get all prices from Google Sheets
    all_prices = sheets_service.get_all_etf_prices()
    
    if not all_prices:
        print("No prices retrieved from Google Sheets")
        return
    
    prices_map = {p['jse_ticker']: p['current_price'] for p in all_prices}
    
    # Create database session
    db: Session = SessionLocal()
    
    try:
        # Get all holdings across all users
        holdings = db.query(models.ETFHolding).all()
        
        updated_count = 0
        now = datetime.utcnow()
        
        for holding in holdings:
            if holding.jse_ticker in prices_map:
                new_price = prices_map[holding.jse_ticker]
                if new_price is not None:
                    holding.current_price = new_price
                    holding.price_updated_at = now
                    updated_count += 1
        
        db.commit()
        last_sync_time = now
        
        print(f"[{now.isoformat()}] Price sync complete: {updated_count} holdings updated")
        
    except Exception as e:
        print(f"Error during price sync: {e}")
        db.rollback()
    finally:
        db.close()


def start_scheduler():
    """Start the background scheduler."""
    global scheduler
    
    if scheduler is not None:
        print("Scheduler already running")
        return
    
    scheduler = AsyncIOScheduler()
    
    # Add job to sync prices every 5 minutes
    scheduler.add_job(
        sync_all_prices,
        trigger=IntervalTrigger(minutes=5),
        id='sync_etf_prices',
        name='Sync ETF prices from Google Sheets',
        replace_existing=True
    )
    
    scheduler.start()
    print("Background scheduler started - prices will sync every 5 minutes")


def stop_scheduler():
    """Stop the background scheduler."""
    global scheduler
    
    if scheduler:
        scheduler.shutdown()
        scheduler = None
        print("Background scheduler stopped")

