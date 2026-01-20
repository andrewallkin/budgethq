from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import csv
import io
from .. import models, database, auth
from ..sheets_service import get_sheets_service
from ..utils import get_sast_now

# ETF Holdings Models (New System)
class ETFHoldingCreate(BaseModel):
    jse_ticker: str
    etf_name: str
    region: str
    shares: float
    target_percentage: float
    cost_basis: Optional[float] = None


class ETFHoldingUpdate(BaseModel):
    shares: Optional[float] = None
    target_percentage: Optional[float] = None
    region: Optional[str] = None

class ETFHoldingResponse(BaseModel):
    id: int
    jse_ticker: str
    etf_name: str
    region: str
    shares: float
    target_percentage: float
    current_price: Optional[float]
    total_value: Optional[float]
    price_updated_at: Optional[datetime]

class AddETFToSheetRequest(BaseModel):
    jse_ticker: str
    etf_name: str

class BulkImportResult(BaseModel):
    success: int
    failed: int
    errors: List[str]

router = APIRouter(prefix="/etf", tags=["etf-holdings"])

@router.get("/holdings")
async def get_etf_holdings(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get all ETF holdings for the current user with computed total values."""
    holdings = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == current_user.id,
        # Include holdings with shares > 0 OR target_percentage > 0
        or_(models.ETFHolding.shares > 0, models.ETFHolding.target_percentage > 0)
    ).all()

    result = []
    for h in holdings:
        total_value = (h.shares * h.current_price) if h.current_price else None

        # Calculate gain/loss
        gain_loss_percentage = None
        gain_loss_amount = None
        if total_value is not None and h.cost_basis > 0:
            gain_loss_amount = total_value - h.cost_basis
            gain_loss_percentage = (gain_loss_amount / h.cost_basis) * 100

        result.append({
            "id": h.id,
            "jse_ticker": h.jse_ticker,
            "etf_name": h.etf_name,
            "region": h.region,
            "shares": h.shares,
            "target_percentage": h.target_percentage,
            "current_price": h.current_price,
            "total_value": total_value,
            "cost_basis": h.cost_basis,
            "gain_loss_percentage": gain_loss_percentage,
            "gain_loss_amount": gain_loss_amount,
            "price_updated_at": (h.price_updated_at.isoformat()) if h.price_updated_at else None
        })

    return result

@router.post("/holdings")
async def create_etf_holding(
    holding: ETFHoldingCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Create a new ETF holding."""
    # Check if holding already exists for this ticker
    existing = db.query(models.ETFHolding).filter(
        models.ETFHolding.user_id == current_user.id,
        models.ETFHolding.jse_ticker == holding.jse_ticker
    ).first()

    if existing:
        # If it exists but has 0 shares, allow re-adding it (reactivate)
        if existing.shares > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Holding for {holding.jse_ticker} already exists with {existing.shares} shares. Use transaction system to buy more shares."
            )
        # If shares == 0, we'll update it below instead of creating new

    # Get current price from Google Sheets (user-specific sheet)
    sheets_service = get_sheets_service(current_user.id)
    current_price = None
    price_updated_at = None

    if sheets_service.is_available():
        current_price = sheets_service.get_price_for_ticker(holding.jse_ticker)
        if current_price:
            price_updated_at = get_sast_now()

    # Handle existing holding with 0 shares (reactivate it)
    if existing and existing.shares == 0:
        existing.shares = holding.shares
        existing.target_percentage = holding.target_percentage
        existing.region = holding.region
        existing.etf_name = holding.etf_name  # Update name in case it changed
        existing.current_price = current_price
        existing.price_updated_at = price_updated_at

        # Initialize or override cost_basis
        if holding.cost_basis is not None:
            if holding.cost_basis < 0:
                raise HTTPException(status_code=400, detail="cost_basis must be non-negative")
            existing.cost_basis = float(holding.cost_basis)
        elif existing.shares and existing.current_price:
            # Fallback: initialize to current market value
            existing.cost_basis = existing.shares * existing.current_price

        # Re-add to Google Sheet if not already there
        sheet_added = False
        if sheets_service.is_available() and not sheets_service.check_ticker_exists(holding.jse_ticker):
            sheet_added = sheets_service.add_etf_to_sheet(holding.jse_ticker, holding.etf_name)

        db.commit()
        db.refresh(existing)

        total_value = (existing.shares * existing.current_price) if existing.current_price else None

        return {
            "id": existing.id,
            "jse_ticker": existing.jse_ticker,
            "etf_name": existing.etf_name,
            "region": existing.region,
            "shares": existing.shares,
            "target_percentage": existing.target_percentage,
            "current_price": existing.current_price,
            "total_value": total_value,
            "cost_basis": existing.cost_basis,
            "price_updated_at": (existing.price_updated_at.isoformat() + "Z") if existing.price_updated_at else None,
            "reactivated": True,
            "sheet_added": sheet_added
        }

    new_holding = models.ETFHolding(
        user_id=current_user.id,
        jse_ticker=holding.jse_ticker,
        etf_name=holding.etf_name,
        region=holding.region,
        shares=holding.shares,
        target_percentage=holding.target_percentage,
        current_price=current_price,
        price_updated_at=price_updated_at
    )

    # Initialize cost_basis: respect user-provided value if present, otherwise fall back
    if holding.cost_basis is not None:
        if holding.cost_basis < 0:
            raise HTTPException(status_code=400, detail="cost_basis must be non-negative")
        new_holding.cost_basis = float(holding.cost_basis)
    elif new_holding.shares and new_holding.current_price:
        new_holding.cost_basis = new_holding.shares * new_holding.current_price

    db.add(new_holding)
    db.commit()
    db.refresh(new_holding)

    total_value = (new_holding.shares * new_holding.current_price) if new_holding.current_price else None

    return {
        "id": new_holding.id,
        "jse_ticker": new_holding.jse_ticker,
        "etf_name": new_holding.etf_name,
        "region": new_holding.region,
        "shares": new_holding.shares,
        "target_percentage": new_holding.target_percentage,
        "current_price": new_holding.current_price,
        "total_value": total_value,
        "cost_basis": new_holding.cost_basis,
        "price_updated_at": (new_holding.price_updated_at.isoformat() + "Z") if new_holding.price_updated_at else None
    }

@router.put("/holdings/{holding_id}")
async def update_etf_holding(
    holding_id: int,
    update: ETFHoldingUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update an existing ETF holding."""
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    if update.shares is not None:
        holding.shares = update.shares
    if update.target_percentage is not None:
        holding.target_percentage = update.target_percentage
    if update.region is not None:
        holding.region = update.region

    db.commit()
    db.refresh(holding)

    total_value = (holding.shares * holding.current_price) if holding.current_price else None

    return {
        "id": holding.id,
        "jse_ticker": holding.jse_ticker,
        "etf_name": holding.etf_name,
        "region": holding.region,
        "shares": holding.shares,
        "target_percentage": holding.target_percentage,
        "current_price": holding.current_price,
        "total_value": total_value,
        "price_updated_at": (holding.price_updated_at.isoformat() + "Z") if holding.price_updated_at else None
    }

@router.delete("/holdings/{holding_id}")
async def delete_etf_holding(
    holding_id: int,
    delete_from_sheet: bool = True,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Delete an ETF holding. Optionally also removes from Google Sheet."""
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    jse_ticker = holding.jse_ticker

    # Delete associated transactions first
    db.query(models.ETFTransaction).filter(
        models.ETFTransaction.holding_id == holding_id
    ).delete()

    db.delete(holding)
    db.commit()

    # Also delete from Google Sheet if requested (user-specific sheet)
    sheet_deleted = False
    if delete_from_sheet:
        sheets_service = get_sheets_service(current_user.id)
        if sheets_service.is_available():
            sheet_deleted = sheets_service.delete_etf_from_sheet(jse_ticker)

    return {
        "status": "success",
        "message": f"Holding {holding_id} deleted",
        "sheet_deleted": sheet_deleted
    }

@router.post("/bulk-import")
async def bulk_import_holdings(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Bulk import ETF holdings from a CSV file (UPSERT mode).

    - If holding exists: Updates shares, target_percentage, and region
    - If holding doesn't exist: Creates new holding
    - Google Sheets: Adds ticker if not present, skips if exists

    Required columns: jse_ticker, etf_name, region, shares, target_percentage
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))

    required_columns = {'jse_ticker', 'etf_name', 'region', 'shares', 'target_percentage'}

    # Validate headers
    if not required_columns.issubset(set(reader.fieldnames or [])):
        missing = required_columns - set(reader.fieldnames or [])
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}"
        )

    # Get prices from Google Sheets (user-specific sheet)
    sheets_service = get_sheets_service(current_user.id)
    prices_map = {}
    sheets_available = sheets_service.is_available()

    if sheets_available:
        all_prices = sheets_service.get_all_etf_prices()
        prices_map = {p['jse_ticker']: p['current_price'] for p in all_prices}

    created_count = 0
    updated_count = 0
    failed_count = 0
    errors = []
    added_to_sheet = 0

    for row_num, row in enumerate(reader, start=2):
        try:
            jse_ticker = row['jse_ticker'].strip()
            etf_name = row['etf_name'].strip()

            # Check if already exists in database
            existing = db.query(models.ETFHolding).filter(
                models.ETFHolding.user_id == current_user.id,
                models.ETFHolding.jse_ticker == jse_ticker
            ).first()

            # Add to Google Sheet if not already there
            if sheets_available:
                if not sheets_service.check_ticker_exists(jse_ticker):
                    try:
                        if sheets_service.add_etf_to_sheet(jse_ticker, etf_name):
                            added_to_sheet += 1
                            # Refresh prices after adding
                            all_prices = sheets_service.get_all_etf_prices()
                            prices_map = {p['jse_ticker']: p['current_price'] for p in all_prices}
                    except Exception as sheet_err:
                        errors.append(f"Row {row_num}: Added to DB but failed to add to sheet - {str(sheet_err)}")

            # Handle empty shares (for ETFs you plan to buy)
            shares_str = row['shares'].strip()
            shares = float(shares_str) if shares_str else 0.0
            target_pct = float(row['target_percentage'])
            region = row['region'].strip()


            if shares < 0:
                errors.append(f"Row {row_num}: Shares cannot be negative")
                failed_count += 1
                continue

            current_price = prices_map.get(jse_ticker)
            price_updated_at = get_sast_now() if current_price else None

            # Calculate cost_basis as shares × current_price (initialize at current value)
            cost_basis = (shares * current_price) if (shares and current_price) else 0

            if existing:
                # UPDATE existing holding
                existing.shares = shares
                existing.target_percentage = target_pct
                existing.region = region
                existing.etf_name = etf_name  # Update name in case it changed
                if current_price:
                    existing.current_price = current_price
                    existing.price_updated_at = price_updated_at
                # Update cost_basis to match new share count (reset to current value)
                existing.cost_basis = cost_basis
                updated_count += 1
            else:
                # CREATE new holding
                new_holding = models.ETFHolding(
                    user_id=current_user.id,
                    jse_ticker=jse_ticker,
                    etf_name=etf_name,
                    region=region,
                    shares=shares,
                    target_percentage=target_pct,
                    current_price=current_price,
                    price_updated_at=price_updated_at,
                    cost_basis=cost_basis  # Initialize cost_basis
                )
                db.add(new_holding)
                created_count += 1

        except ValueError as e:
            errors.append(f"Row {row_num}: Invalid number format - {str(e)}")
            failed_count += 1
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
            failed_count += 1

    db.commit()

    return {
        "created": created_count,
        "updated": updated_count,
        "failed": failed_count,
        "errors": errors,
        "added_to_sheet": added_to_sheet
    }
