"""
Migration script to migrate existing ETF data from the old schema to the new ETFHolding schema.

Run this script once after deploying the new schema:
    python -m app.migrate_etf_data

This will:
1. Read all existing ETFs from the old `etfs` table
2. Create corresponding ETFHolding records
3. Map old fields to new fields:
   - ticker -> jse_ticker (with JSE: prefix if not present)
   - region -> region
   - target_percentage -> target_percentage
   - current_value -> shares (set to 0, needs manual update) + current_price
"""

from sqlalchemy.orm import Session
from datetime import datetime
from . import models
from .database import SessionLocal, engine


def migrate_etf_data():
    """Migrate data from old ETF table to new ETFHolding table."""
    
    # Ensure tables exist
    models.Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()
    
    try:
        # Get all existing ETFs from the old table
        old_etfs = db.query(models.ETF).all()
        
        if not old_etfs:
            print("No existing ETF data to migrate.")
            return
        
        print(f"Found {len(old_etfs)} ETF records to migrate...")
        
        migrated = 0
        skipped = 0
        
        for old_etf in old_etfs:
            # Check if already migrated (same user + ticker)
            jse_ticker = old_etf.ticker
            if not jse_ticker.startswith('JSE:'):
                # Try to format as JSE ticker if it looks like one
                jse_ticker = f"JSE:{jse_ticker}"
            
            existing = db.query(models.ETFHolding).filter(
                models.ETFHolding.user_id == old_etf.user_id,
                models.ETFHolding.jse_ticker == jse_ticker
            ).first()
            
            if existing:
                print(f"  Skipping {old_etf.ticker} for user {old_etf.user_id} - already exists")
                skipped += 1
                continue
            
            # Create new ETFHolding record
            new_holding = models.ETFHolding(
                user_id=old_etf.user_id,
                jse_ticker=jse_ticker,
                etf_name=old_etf.ticker,  # Use ticker as name, user can update later
                region=old_etf.region or "Unknown",
                shares=0,  # User needs to set this manually
                target_percentage=old_etf.target_percentage or 0,
                current_price=None,  # Will be populated by price sync
                price_updated_at=None,
                created_at=datetime.utcnow()
            )
            
            # If there was a current_value, we can estimate price as the total value
            # This assumes shares=1 which is wrong, but gives a starting point
            if old_etf.current_value and old_etf.current_value > 0:
                new_holding.current_price = old_etf.current_value
            
            db.add(new_holding)
            migrated += 1
            print(f"  Migrated {old_etf.ticker} for user {old_etf.user_id}")
        
        db.commit()
        
        print(f"\nMigration complete!")
        print(f"  Migrated: {migrated}")
        print(f"  Skipped: {skipped}")
        print(f"\nNOTE: Migrated holdings have shares=0 and need manual updates:")
        print("  1. Update 'etf_name' with proper display names")
        print("  2. Update 'shares' with actual share counts")
        print("  3. Run a price sync to populate current_price from Google Sheets")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def verify_migration():
    """Verify the migration by comparing old and new tables."""
    db: Session = SessionLocal()
    
    try:
        old_count = db.query(models.ETF).count()
        new_count = db.query(models.ETFHolding).count()
        
        print(f"Old ETF table: {old_count} records")
        print(f"New ETFHolding table: {new_count} records")
        
        # List new holdings
        holdings = db.query(models.ETFHolding).all()
        print("\nNew ETFHolding records:")
        for h in holdings:
            print(f"  - {h.jse_ticker}: {h.etf_name} ({h.shares} shares @ {h.current_price})")
            
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        verify_migration()
    else:
        migrate_etf_data()

