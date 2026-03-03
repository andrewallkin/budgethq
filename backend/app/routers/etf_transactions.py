import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from .. import models, database, auth

logger = logging.getLogger(__name__)
from ..sheets_service import get_sheets_service
from ..utils import get_sast_now
from .. import history

class ETFTransactionCreate(BaseModel):
    holding_id: int
    transaction_type: str  # "BUY" or "SELL"
    shares: float
    price_per_share: float
    transaction_date: Optional[str] = None  # ISO format, defaults to now
    total_cost_basis: Optional[float] = None  # Optional override for this transaction's total value

class ETFTransactionResponse(BaseModel):
    id: int
    holding_id: int
    jse_ticker: str
    etf_name: str
    transaction_type: str
    shares: float
    price_per_share: float
    total_value: float
    transaction_date: datetime
    created_at: datetime

router = APIRouter(prefix="/etf", tags=["etf-transactions"])

@router.get("/transactions")
async def get_etf_transactions(
    holding_id: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get transaction history, optionally filtered by holding."""
    query = db.query(models.ETFTransaction).filter(
        models.ETFTransaction.user_id == current_user.id
    )

    if holding_id:
        query = query.filter(models.ETFTransaction.holding_id == holding_id)

    transactions = query.order_by(models.ETFTransaction.created_at.desc()).all()

    result = []
    for t in transactions:
        holding = db.query(models.ETFHolding).filter(
            models.ETFHolding.id == t.holding_id
        ).first()

        result.append({
            "id": t.id,
            "holding_id": t.holding_id,
            "jse_ticker": holding.jse_ticker if holding else "Unknown",
            "etf_name": holding.etf_name if holding else "Unknown",
            "transaction_type": t.transaction_type,
            "shares": t.shares,
            "price_per_share": t.price_per_share,
            "total_value": t.total_value,
            "transaction_date": (t.transaction_date.isoformat() + "Z") if t.transaction_date else None,
            "created_at": (t.created_at.isoformat() + "Z") if t.created_at else None
        })

    return result

@router.post("/transactions")
async def create_etf_transaction(
    transaction: ETFTransactionCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Record a buy or sell transaction.
    This also updates the holding's share count.
    """
    # Verify holding exists and belongs to user
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == transaction.holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    if transaction.transaction_type not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="Transaction type must be 'BUY' or 'SELL'")

    if transaction.shares <= 0:
        raise HTTPException(status_code=400, detail="Shares must be positive")

    if transaction.price_per_share <= 0:
        raise HTTPException(status_code=400, detail="Price per share must be positive")

    if transaction.total_cost_basis is not None and transaction.total_cost_basis < 0:
        raise HTTPException(status_code=400, detail="total_cost_basis must be non-negative")

    # For SELL, ensure user has enough shares
    if transaction.transaction_type == "SELL" and holding.shares < transaction.shares:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient shares. You have {holding.shares}, trying to sell {transaction.shares}"
        )

    # Parse transaction date
    trans_date = get_sast_now()
    if transaction.transaction_date:
        try:
            trans_date = datetime.fromisoformat(transaction.transaction_date.replace('Z', '+00:00'))
        except ValueError:
            trans_date = get_sast_now()

    # Determine total transaction value; allow user override via total_cost_basis
    inferred_total_value = transaction.shares * transaction.price_per_share
    total_value = (
        float(transaction.total_cost_basis)
        if transaction.total_cost_basis is not None
        else inferred_total_value
    )

    # Create transaction record
    new_transaction = models.ETFTransaction(
        user_id=current_user.id,
        holding_id=transaction.holding_id,
        transaction_type=transaction.transaction_type,
        shares=transaction.shares,
        price_per_share=transaction.price_per_share,
        total_value=total_value,
        transaction_date=trans_date
    )

    db.add(new_transaction)

    # Store original shares before transaction for comparison
    shares_before_transaction = holding.shares

    # Update holding share count
    if transaction.transaction_type == "BUY":
        holding.shares += transaction.shares
    else:  # SELL
        holding.shares -= transaction.shares

    # Check if shares reached 0 after sell - clean up but preserve transaction history
    holding_fully_sold = False
    sheet_deleted = False

    # Check if shares went from 0 to >0 after buy - re-add to Google Sheet
    holding_reactivated = False
    sheet_added = False

    if transaction.transaction_type == "SELL" and holding.shares <= 0:
        # Store values for response
        jse_ticker = holding.jse_ticker
        etf_name = holding.etf_name

        # Set shares to exactly 0 (in case it went negative due to rounding)
        holding.shares = 0

        # Delete from Google Sheet since it's no longer an active holding
        sheets_service = get_sheets_service(current_user.id)
        if sheets_service.is_available():
            sheet_deleted = sheets_service.delete_etf_from_sheet(jse_ticker)

        holding_fully_sold = True

    elif transaction.transaction_type == "BUY" and shares_before_transaction == 0 and holding.shares > 0:
        # Re-activate holding by adding back to Google Sheet
        sheets_service = get_sheets_service(current_user.id)
        if sheets_service.is_available():
            if not sheets_service.check_ticker_exists(holding.jse_ticker):
                sheet_added = sheets_service.add_etf_to_sheet(holding.jse_ticker, holding.etf_name)

        holding_reactivated = True

    db.commit()
    db.refresh(new_transaction)
    logger.info(
        "ETF transaction created",
        extra={"user_id": current_user.id, "transaction_id": new_transaction.id, "holding_id": transaction.holding_id},
    )

    # Record transaction snapshot for historical tracking
    try:
        snapshot_result = history.record_transaction_snapshot(db, current_user.id, new_transaction.id)
    except Exception as e:
        # Don't fail the transaction if snapshot fails
        print(f"Warning: Failed to record transaction snapshot: {e}")
        snapshot_result = None

    # Return appropriate response
    if holding_fully_sold:
        return {
            "id": new_transaction.id,
            "holding_id": new_transaction.holding_id,
            "jse_ticker": jse_ticker,
            "etf_name": etf_name,
            "transaction_type": new_transaction.transaction_type,
            "shares": new_transaction.shares,
            "price_per_share": new_transaction.price_per_share,
            "total_value": new_transaction.total_value,
            "transaction_date": new_transaction.transaction_date.isoformat() + "Z",
            "updated_share_count": 0,  # Now 0 since fully sold
            "cost_basis": holding.cost_basis,
            "holding_fully_sold": True,
            "sheet_deleted": sheet_deleted
        }
    elif holding_reactivated:
        return {
            "id": new_transaction.id,
            "holding_id": new_transaction.holding_id,
            "jse_ticker": holding.jse_ticker,
            "etf_name": holding.etf_name,
            "transaction_type": new_transaction.transaction_type,
            "shares": new_transaction.shares,
            "price_per_share": new_transaction.price_per_share,
            "total_value": new_transaction.total_value,
            "transaction_date": new_transaction.transaction_date.isoformat() + "Z",
            "updated_share_count": holding.shares,
            "cost_basis": holding.cost_basis,
            "holding_reactivated": True,
            "sheet_added": sheet_added
        }
    else:
        return {
            "id": new_transaction.id,
            "holding_id": new_transaction.holding_id,
            "jse_ticker": holding.jse_ticker,
            "etf_name": holding.etf_name,
            "transaction_type": new_transaction.transaction_type,
            "shares": new_transaction.shares,
            "price_per_share": new_transaction.price_per_share,
            "total_value": new_transaction.total_value,
            "transaction_date": new_transaction.transaction_date.isoformat() + "Z",
            "updated_share_count": holding.shares,
            "cost_basis": holding.cost_basis
        }

@router.delete("/transactions/{transaction_id}")
async def delete_etf_transaction(
    transaction_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Delete an ETF transaction and reverse its effects on the holding.
    """
    # Verify transaction exists and belongs to user
    transaction = db.query(models.ETFTransaction).filter(
        models.ETFTransaction.id == transaction_id,
        models.ETFTransaction.user_id == current_user.id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get the holding
    holding = db.query(models.ETFHolding).filter(
        models.ETFHolding.id == transaction.holding_id,
        models.ETFHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    # Reverse the transaction effects
    if transaction.transaction_type == "BUY":
        # Reverse BUY: subtract shares
        if holding.shares < transaction.shares:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete transaction: would result in negative shares"
            )
        holding.shares -= transaction.shares
        # Reverse cost basis: subtract the transaction value
        holding.cost_basis = max(0, (holding.cost_basis or 0) - (transaction.total_value or 0))
    else:  # SELL
        # Reverse SELL: add shares back
        holding.shares += transaction.shares
        # For SELL, we need to recalculate cost_basis from remaining transactions
        # since the original calculation was proportional
        history.update_holding_cost_basis(db, holding.id)

    # Delete transaction snapshots created when this transaction was made
    # Snapshots are created at the same time as the transaction, so we match by timestamp
    transaction_time = transaction.transaction_date
    if transaction_time:
        # Delete portfolio value history snapshots for this transaction (within 1 second window)
        time_window_start = transaction_time - timedelta(seconds=1)
        time_window_end = transaction_time + timedelta(seconds=1)

        db.query(models.PortfolioValueHistory).filter(
            models.PortfolioValueHistory.user_id == current_user.id,
            models.PortfolioValueHistory.snapshot_type == "transaction",
            models.PortfolioValueHistory.recorded_at >= time_window_start,
            models.PortfolioValueHistory.recorded_at <= time_window_end
        ).delete(synchronize_session=False)

        # Delete holding value history snapshots for this holding (within 1 second window)
        db.query(models.HoldingValueHistory).filter(
            models.HoldingValueHistory.user_id == current_user.id,
            models.HoldingValueHistory.holding_id == transaction.holding_id,
            models.HoldingValueHistory.snapshot_type == "transaction",
            models.HoldingValueHistory.recorded_at >= time_window_start,
            models.HoldingValueHistory.recorded_at <= time_window_end
        ).delete(synchronize_session=False)

    # Delete the transaction
    db.delete(transaction)
    db.commit()
    logger.info(
        "ETF transaction deleted",
        extra={"user_id": current_user.id, "transaction_id": transaction.id, "holding_id": transaction.holding_id},
    )
    return {"message": "Transaction deleted successfully", "updated_share_count": holding.shares}
