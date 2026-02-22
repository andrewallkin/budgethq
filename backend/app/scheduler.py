"""
Background scheduler for periodic ETF price updates and historical tracking.
- Fetches prices from Google Sheets every 5 minutes
- Records hourly portfolio snapshots
- Creates daily and monthly summaries
- Cleans up old hourly data
"""

import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from .database import SessionLocal
from .sheets_service import get_sheets_service
from .utils import get_sast_now
from . import models
from . import history
from .investec_sync import sync_investec_accounts, sync_investec_transactions


# Initialize logger
logger = logging.getLogger(__name__)

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
    last_sync_time = time if time else get_sast_now()


async def sync_all_prices():
    """
    Background task to sync prices from each user's Google Sheets.
    This runs every 5 minutes and processes each user individually.
    """
    global last_sync_time

    logger.info("Starting scheduled price sync...")

    # Always update last sync time, even if no prices found
    now = get_sast_now()
    last_sync_time = now

    # Create database session
    db: Session = SessionLocal()

    try:
        # Get all users who have ETF holdings
        users_with_holdings = db.query(models.ETFHolding.user_id).distinct().all()
        user_ids = [u[0] for u in users_with_holdings]

        if not user_ids:
            logger.info("Price sync complete: No users with holdings found")
            return

        logger.info(f"Syncing prices for {len(user_ids)} users")
        total_updated = 0

        for user_id in user_ids:
            try:
                # Get user's specific sheets service
                sheets_service = get_sheets_service(user_id)

                if not sheets_service.is_available():
                    logger.warning(f"Google Sheets service not available for user {user_id}, skipping")
                    continue

                # Get prices from this user's sheet
                user_prices = sheets_service.get_all_etf_prices()

                if not user_prices:
                    logger.debug(f"No prices found in user {user_id}'s sheet")
                    continue

                prices_map = {p['jse_ticker']: p['current_price'] for p in user_prices}

                # Update only this user's holdings
                user_holdings = db.query(models.ETFHolding).filter(
                    models.ETFHolding.user_id == user_id
                ).all()

                user_updated = 0
                for holding in user_holdings:
                    if holding.jse_ticker in prices_map:
                        new_price = prices_map[holding.jse_ticker]
                        if new_price is not None:
                            holding.current_price = new_price
                            holding.price_updated_at = now
                            user_updated += 1

                logger.debug(f"User {user_id}: Updated {user_updated} holdings")
                total_updated += user_updated

            except Exception as e:
                logger.error(f"Error syncing prices for user {user_id}: {e}")
                continue

        db.commit()
        logger.info(f"Price sync complete: {total_updated} holdings updated across {len(user_ids)} users")

    except Exception as e:
        logger.error(f"Error during price sync: {e}")
        db.rollback()
    finally:
        db.close()


async def record_hourly_snapshot():
    """
    Record hourly snapshots of ETF prices and portfolio values.
    Runs every hour on the hour.
    """

    logger.info("Recording hourly snapshot...")
    
    db: Session = SessionLocal()
    
    try:
        stats = history.record_hourly_snapshot(db)
        logger.info(f"Hourly snapshot complete: "
              f"{stats['prices_recorded']} prices, "
              f"{stats['users_processed']} users, "
              f"{stats['holdings_recorded']} holdings")
    except Exception as e:
        logger.error(f"Error during hourly snapshot: {e}")
        db.rollback()
    finally:
        db.close()


async def create_daily_summary():
    """
    Create end-of-day summary from hourly snapshots.
    Runs daily at 17:30 SAST (15:30 UTC) after JSE market close.
    """

    logger.info("Creating daily summary...")
    
    db: Session = SessionLocal()
    
    try:
        stats = history.create_daily_summary(db)

        logger.info(f"Daily summary complete: "
              f"{stats['summaries_created']} summaries created")
    except Exception as e:
        logger.error(f"Error during daily summary: {e}")
        db.rollback()
    finally:
        db.close()


async def create_monthly_summary():
    """
    Create monthly summary from daily summaries for the previous month.
    Runs on the 1st of each month at 00:00 UTC.
    """
    logger.info("Creating monthly summary...")
    
    db: Session = SessionLocal()
    
    try:
        # Get previous month
        now = get_sast_now()
        if now.month == 1:
            year = now.year - 1
            month = 12
        else:
            year = now.year
            month = now.month - 1
        
        stats = history.create_monthly_summary(db, year, month)

        logger.info(f"Monthly summary complete: "
              f"{stats['summaries_created']} summaries created for {year}-{month:02d}")
    except Exception as e:
        logger.error(f"Error during monthly summary: {e}")
        db.rollback()
    finally:
        db.close()


async def cleanup_old_data():
    """
    Clean up old hourly data (older than 90 days).
    Runs weekly on Sunday at 03:00 SAST (01:00 UTC).
    """

    logger.info("Cleaning up old hourly data...")
    
    db: Session = SessionLocal()
    
    try:
        stats = history.cleanup_old_hourly_data(db, retention_days=90)
        logger.info(f"Cleanup complete: "
              f"deleted {stats['portfolio_deleted']} portfolio records, "
              f"{stats['holding_deleted']} holding records, "
              f"{stats['price_deleted']} price records")
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()


def start_scheduler():
    """Start the background scheduler."""
    global scheduler
    
    if scheduler is not None:
        logger.warning("Scheduler already running")
        return
    
    scheduler = AsyncIOScheduler()
    
    # Job 1: Sync prices every 5 minutes (on the clock: :00, :05, :10...)
    scheduler.add_job(
        sync_all_prices,
        trigger=CronTrigger(minute='*/5'),
        id='sync_etf_prices',
        name='Sync ETF prices from Google Sheets',
        replace_existing=True
    )
    
    # Job 2: Record snapshot every hour on the hour
    scheduler.add_job(
        record_hourly_snapshot,
        trigger=CronTrigger(minute='0'),
        id='record_hourly_snapshot',
        name='Record portfolio snapshot',
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

    # Job 6: Sync Investec account balances every hour
    scheduler.add_job(
        sync_investec_accounts,
        trigger=CronTrigger(hour='*/1'),
        id='sync_investec_accounts',
        name='Sync Investec account balances',
        replace_existing=True
    )

    # Job 7: Sync Investec transactions every 15 minutes
    scheduler.add_job(
        sync_investec_transactions,
        trigger=CronTrigger(minute='*/15'),
        id='sync_investec_transactions',
        name='Sync Investec transactions',
        replace_existing=True
    )

    scheduler.start()

    logger.info("Background scheduler started with the following jobs:")
    logger.info("  - Price sync: every 5 minutes (on the clock)")
    logger.info("  - Portfolio snapshot: every hour (on the clock)")
    logger.info("  - Daily summary: daily at 17:30 SAST (15:30 UTC)")
    logger.info("  - Monthly summary: 1st of month at 00:00 UTC")
    logger.info("  - Data cleanup: Sundays at 03:00 SAST (01:00 UTC)")
    logger.info("  - Investec account sync: every hour")
    logger.info("  - Investec transaction sync: every 15 minutes")


def stop_scheduler():
    """Stop the background scheduler."""
    global scheduler
    
    if scheduler:
        scheduler.shutdown()
        scheduler = None
        logger.info("Background scheduler stopped")

