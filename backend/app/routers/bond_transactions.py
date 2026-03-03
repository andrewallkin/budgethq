import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from .. import models, database, auth

logger = logging.getLogger(__name__)
from ..utils import get_sast_now

class BondTransactionCreate(BaseModel):
    holding_id: int
    transaction_type: str  # "BUY" or "SELL"
    amount: float
    transaction_date: Optional[str] = None  # ISO format, defaults to now

class BondTransactionResponse(BaseModel):
    id: int
    holding_id: int
    bond_name: str
    transaction_type: str
    amount: float
    transaction_date: datetime
    created_at: datetime

router = APIRouter(prefix="/bond", tags=["bond-transactions"])

@router.get("/transactions")
async def get_bond_transactions(
    holding_id: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get bond transaction history, optionally filtered by holding."""
    query = db.query(models.BondTransaction).filter(
        models.BondTransaction.user_id == current_user.id
    )

    if holding_id:
        query = query.filter(models.BondTransaction.holding_id == holding_id)

    transactions = query.order_by(models.BondTransaction.created_at.desc()).all()

    result = []
    for t in transactions:
        holding = db.query(models.BondHolding).filter(
            models.BondHolding.id == t.holding_id
        ).first()

        result.append({
            "id": t.id,
            "holding_id": t.holding_id,
            "bond_name": holding.bond_name if holding else "Unknown",
            "transaction_type": t.transaction_type,
            "amount": t.amount,
            "transaction_date": (t.transaction_date.isoformat() + "Z") if t.transaction_date else None,
            "created_at": (t.created_at.isoformat() + "Z") if t.created_at else None
        })

    return result

@router.post("/transactions")
async def create_bond_transaction(
    transaction: BondTransactionCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Record a buy or sell transaction for a bond.
    This updates the holding's current value.
    """
    # Verify holding exists and belongs to user
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == transaction.holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Bond holding not found")

    if transaction.transaction_type not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="Transaction type must be 'BUY' or 'SELL'")

    if transaction.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # For SELL, ensure user has enough value
    if transaction.transaction_type == "SELL" and holding.current_value < transaction.amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient value. Current value is R{holding.current_value}, trying to sell R{transaction.amount}"
        )

    # Parse transaction date
    trans_date = get_sast_now()
    if transaction.transaction_date:
        try:
            trans_date = datetime.fromisoformat(transaction.transaction_date.replace('Z', '+00:00'))
        except ValueError:
            trans_date = get_sast_now()

    # Create transaction record
    new_transaction = models.BondTransaction(
        user_id=current_user.id,
        holding_id=transaction.holding_id,
        transaction_type=transaction.transaction_type,
        amount=transaction.amount,
        transaction_date=trans_date
    )

    db.add(new_transaction)

    # Update holding value and cost_basis
    current_cost_basis = holding.cost_basis or 0

    if transaction.transaction_type == "BUY":
        holding.current_value += transaction.amount
        # Add to cost_basis
        holding.cost_basis = current_cost_basis + transaction.amount
    else:  # SELL
        # Reduce cost_basis proportionally
        if holding.current_value > 0:
            proportion_sold = transaction.amount / holding.current_value
            holding.cost_basis = current_cost_basis * (1 - proportion_sold)
        else:
            holding.cost_basis = 0
        holding.current_value -= transaction.amount

    holding.updated_at = get_sast_now()

    db.commit()
    db.refresh(new_transaction)
    logger.info(
        "Bond transaction created",
        extra={"user_id": current_user.id, "transaction_id": new_transaction.id, "holding_id": transaction.holding_id},
    )
    # Calculate unrealized gain for the bond
    unrealized_gain = (holding.current_value or 0) - (holding.cost_basis or 0)

    return {
        "id": new_transaction.id,
        "holding_id": new_transaction.holding_id,
        "bond_name": holding.bond_name,
        "transaction_type": new_transaction.transaction_type,
        "amount": new_transaction.amount,
        "transaction_date": new_transaction.transaction_date.isoformat() + "Z",
        "updated_value": holding.current_value,
        "cost_basis": holding.cost_basis,
        "unrealized_gain": round(unrealized_gain, 2)
    }

@router.delete("/transactions/{transaction_id}")
async def delete_bond_transaction(
    transaction_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Delete a bond transaction and reverse its effects on the holding.
    """
    # Verify transaction exists and belongs to user
    transaction = db.query(models.BondTransaction).filter(
        models.BondTransaction.id == transaction_id,
        models.BondTransaction.user_id == current_user.id
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Get the holding
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == transaction.holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    # Reverse the transaction effects
    current_cost_basis = holding.cost_basis or 0

    if transaction.transaction_type == "BUY":
        # Reverse BUY: subtract amount from value and cost_basis
        if holding.current_value < transaction.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete transaction: would result in negative value"
            )
        holding.current_value -= transaction.amount
        holding.cost_basis = max(0, current_cost_basis - transaction.amount)
    else:  # SELL
        # Reverse SELL: add amount back to value
        # For SELL, we need to recalculate cost_basis from remaining transactions
        # since the original calculation was proportional
        holding.current_value += transaction.amount
        # Recalculate cost_basis from all remaining transactions
        transactions = db.query(models.BondTransaction).filter(
            models.BondTransaction.holding_id == holding.id,
            models.BondTransaction.id != transaction_id
        ).all()
        total_buy_value = sum(t.amount for t in transactions if t.transaction_type == "BUY")
        total_sell_value = sum(t.amount for t in transactions if t.transaction_type == "SELL")
        holding.cost_basis = max(0, total_buy_value - total_sell_value)

    holding.updated_at = get_sast_now()

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

    # Delete the transaction
    db.delete(transaction)
    db.commit()
    logger.info(
        "Bond transaction deleted",
        extra={"user_id": current_user.id, "transaction_id": transaction_id, "holding_id": transaction.holding_id},
    )

    return {"message": "Transaction deleted successfully", "updated_value": holding.current_value}
