from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from .. import models, database, auth
from ..utils import get_sast_now

# Bond Holdings Models
class BondHoldingCreate(BaseModel):
    bond_name: str
    region: str
    current_value: float
    target_percentage: float

class BondHoldingUpdate(BaseModel):
    current_value: Optional[float] = None
    target_percentage: Optional[float] = None
    region: Optional[str] = None

class BondHoldingResponse(BaseModel):
    id: int
    bond_name: str
    region: str
    current_value: float
    target_percentage: float
    updated_at: Optional[datetime]

router = APIRouter(prefix="/bond", tags=["bond-holdings"])

@router.get("/holdings")
async def get_bond_holdings(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Get all bond holdings for the current user."""
    holdings = db.query(models.BondHolding).filter(
        models.BondHolding.user_id == current_user.id,
        # Include holdings with current_value > 0 OR target_percentage > 0
        or_(models.BondHolding.current_value > 0, models.BondHolding.target_percentage > 0)
    ).all()

    result = []
    for h in holdings:
        # Calculate gain/loss
        gain_loss_percentage = None
        gain_loss_amount = None
        if h.current_value is not None and h.cost_basis > 0:
            gain_loss_amount = h.current_value - h.cost_basis
            gain_loss_percentage = (gain_loss_amount / h.cost_basis) * 100

        result.append({
            "id": h.id,
            "bond_name": h.bond_name,
            "region": h.region,
            "current_value": h.current_value,
            "target_percentage": h.target_percentage,
            "cost_basis": h.cost_basis,
            "gain_loss_percentage": gain_loss_percentage,
            "gain_loss_amount": gain_loss_amount,
            "updated_at": (h.updated_at.isoformat() + "Z") if h.updated_at else None
        })

    return result

@router.post("/holdings")
async def create_bond_holding(
    holding: BondHoldingCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Create a new bond holding."""
    # Check if holding with same name already exists
    existing = db.query(models.BondHolding).filter(
        models.BondHolding.user_id == current_user.id,
        models.BondHolding.bond_name == holding.bond_name
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Bond holding '{holding.bond_name}' already exists. Use PUT to update."
        )

    new_holding = models.BondHolding(
        user_id=current_user.id,
        bond_name=holding.bond_name,
        region=holding.region,
        current_value=holding.current_value,
        target_percentage=holding.target_percentage
    )

    db.add(new_holding)
    db.commit()
    db.refresh(new_holding)

    return {
        "id": new_holding.id,
        "bond_name": new_holding.bond_name,
        "region": new_holding.region,
        "current_value": new_holding.current_value,
        "target_percentage": new_holding.target_percentage,
        "updated_at": (new_holding.updated_at.isoformat() + "Z") if new_holding.updated_at else None
    }

@router.put("/holdings/{holding_id}")
async def update_bond_holding(
    holding_id: int,
    update: BondHoldingUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Update an existing bond holding."""
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Bond holding not found")

    if update.current_value is not None:
        holding.current_value = update.current_value
    if update.target_percentage is not None:
        holding.target_percentage = update.target_percentage
    if update.region is not None:
        holding.region = update.region

    holding.updated_at = get_sast_now()

    db.commit()
    db.refresh(holding)

    return {
        "id": holding.id,
        "bond_name": holding.bond_name,
        "region": holding.region,
        "current_value": holding.current_value,
        "target_percentage": holding.target_percentage,
        "updated_at": (holding.updated_at.isoformat() + "Z") if holding.updated_at else None
    }

@router.delete("/holdings/{holding_id}")
async def delete_bond_holding(
    holding_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """Delete a bond holding and all associated transactions."""
    holding = db.query(models.BondHolding).filter(
        models.BondHolding.id == holding_id,
        models.BondHolding.user_id == current_user.id
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Bond holding not found")

    bond_name = holding.bond_name

    # Delete associated transactions first
    db.query(models.BondTransaction).filter(
        models.BondTransaction.holding_id == holding_id
    ).delete()

    db.delete(holding)
    db.commit()

    return {
        "status": "success",
        "message": f"Bond holding '{bond_name}' deleted"
    }
