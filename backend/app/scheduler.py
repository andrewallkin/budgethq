"""
Background scheduler for periodic ETF price updates and historical tracking.
- Fetches prices from Google Sheets every 5 minutes
- Records hourly portfolio snapshots
- Creates daily and monthly summaries
- Cleans up old hourly data
"""

from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from .database import SessionLocal
from .sheets_service import get_sheets_service
from . import models
from . import history


# Global scheduler instance
scheduler: AsyncIOScheduler = None

# Track last sync time globally
last_sync_time: datetime = None


def get_last_sync_time() -> datetime:
    """Get the last successful sync time."""
    global last_sync_time
    return last_sync_time


def set_last_sync_time(time: datetime = None):
    """Set the last sync time. If no time provided, uses current UTC time."""
    global last_sync_time
    last_sync_time = time if time else datetime.utcnow()


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
    
    # Always update last sync time, even if no prices found
    now = datetime.utcnow()
    last_sync_time = now
    
    if not all_prices:
        print(f"[{now.isoformat()}] Price sync complete: No prices retrieved from Google Sheets")
        return
    
    prices_map = {p['jse_ticker']: p['current_price'] for p in all_prices}
    
    # Create database session
    db: Session = SessionLocal()
    
    try:
        # Get all holdings across all users
        holdings = db.query(models.ETFHolding).all()
        
        updated_count = 0
        
        for holding in holdings:
            if holding.jse_ticker in prices_map:
                new_price = prices_map[holding.jse_ticker]
                if new_price is not None:
                    holding.current_price = new_price
                    holding.price_updated_at = now
                    updated_count += 1
        
        db.commit()
        
        print(f"[{now.isoformat()}] Price sync complete: {updated_count} holdings updated")
        
    except Exception as e:
        print(f"Error during price sync: {e}")
        db.rollback()
    finally:
        db.close()


async def record_hourly_snapshot():
    """
    Record hourly snapshots of ETF prices and portfolio values.
    Runs every hour on the hour.
    """
    print(f"[{datetime.utcnow().isoformat()}] Recording hourly snapshot...")
    
    db: Session = SessionLocal()
    
    try:
        stats = history.record_hourly_snapshot(db)
        print(f"[{datetime.utcnow().isoformat()}] Hourly snapshot complete: "
              f"{stats['prices_recorded']} prices, "
              f"{stats['users_processed']} users, "
              f"{stats['holdings_recorded']} holdings")
    except Exception as e:
        print(f"Error during hourly snapshot: {e}")
        db.rollback()
    finally:
        db.close()


async def create_daily_summary():
    """
    Create end-of-day summary from hourly snapshots.
    Runs daily at 17:30 SAST (15:30 UTC) after JSE market close.
    """
    print(f"[{datetime.utcnow().isoformat()}] Creating daily summary...")
    
    db: Session = SessionLocal()
    
    try:
        stats = history.create_daily_summary(db)
        print(f"[{datetime.utcnow().isoformat()}] Daily summary complete: "
              f"{stats['summaries_created']} summaries created")
    except Exception as e:
        print(f"Error during daily summary: {e}")
        db.rollback()
    finally:
        db.close()


async def create_monthly_summary():
    """
    Create monthly summary from daily summaries for the previous month.
    Runs on the 1st of each month at 00:00 UTC.
    """
    print(f"[{datetime.utcnow().isoformat()}] Creating monthly summary...")
    
    db: Session = SessionLocal()
    
    try:
        # Get previous month
        now = datetime.utcnow()
        if now.month == 1:
            year = now.year - 1
            month = 12
        else:
            year = now.year
            month = now.month - 1
        
        stats = history.create_monthly_summary(db, year, month)
        print(f"[{datetime.utcnow().isoformat()}] Monthly summary complete: "
              f"{stats['summaries_created']} summaries created for {year}-{month:02d}")
    except Exception as e:
        print(f"Error during monthly summary: {e}")
        db.rollback()
    finally:
        db.close()


async def cleanup_old_data():
    """
    Clean up old hourly data (older than 90 days).
    Runs weekly on Sunday at 03:00 SAST (01:00 UTC).
    """
    print(f"[{datetime.utcnow().isoformat()}] Cleaning up old hourly data...")
    
    db: Session = SessionLocal()
    
    try:
        stats = history.cleanup_old_hourly_data(db, retention_days=90)
        print(f"[{datetime.utcnow().isoformat()}] Cleanup complete: "
              f"deleted {stats['portfolio_deleted']} portfolio records, "
              f"{stats['holding_deleted']} holding records, "
              f"{stats['price_deleted']} price records")
    except Exception as e:
        print(f"Error during cleanup: {e}")
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
    
    # Job 1: Sync prices every 5 minutes (existing)
    scheduler.add_job(
        sync_all_prices,
        trigger=IntervalTrigger(minutes=5),
        id='sync_etf_prices',
        name='Sync ETF prices from Google Sheets',
        replace_existing=True
    )
    
    # Job 2: Record hourly snapshot at the top of every hour
    scheduler.add_job(
        record_hourly_snapshot,
        trigger=CronTrigger(minute=0),  # Every hour at :00
        id='record_hourly_snapshot',
        name='Record hourly portfolio snapshot',
        replace_existing=True
    )
    
    # Job 3: Create daily summary at 17:30 SAST (15:30 UTC) after JSE close
    scheduler.add_job(
        create_daily_summary,
        trigger=CronTrigger(hour=15, minute=30),  # 15:30 UTC = 17:30 SAST
        id='create_daily_summary',
        name='Create daily portfolio summary',
        replace_existing=True
    )
    
    # Job 4: Create monthly summary on 1st of each month at midnight UTC
    scheduler.add_job(
        create_monthly_summary,
        trigger=CronTrigger(day=1, hour=0, minute=0),
        id='create_monthly_summary',
        name='Create monthly portfolio summary',
        replace_existing=True
    )
    
    # Job 5: Cleanup old data every Sunday at 01:00 UTC (03:00 SAST)
    scheduler.add_job(
        cleanup_old_data,
        trigger=CronTrigger(day_of_week='sun', hour=1, minute=0),
        id='cleanup_old_data',
        name='Clean up old hourly data (90 day retention)',
        replace_existing=True
    )
    
    scheduler.start()
    print("Background scheduler started with the following jobs:")
    print("  - Price sync: every 5 minutes")
    print("  - Hourly snapshot: every hour at :00")
    print("  - Daily summary: daily at 17:30 SAST (15:30 UTC)")
    print("  - Monthly summary: 1st of month at 00:00 UTC")
    print("  - Data cleanup: Sundays at 03:00 SAST (01:00 UTC)")


def stop_scheduler():
    """Stop the background scheduler."""
    global scheduler
    
    if scheduler:
        scheduler.shutdown()
        scheduler = None
        print("Background scheduler stopped")

