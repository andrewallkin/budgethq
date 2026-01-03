from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from .. import models, database, auth

# TFSA Contribution Models
class TFSADepositBase(BaseModel):
    id: Optional[int] = None
    amount: float
    date: str  # ISO format date string

class TFSAHistoricalContributionBase(BaseModel):
    id: Optional[int] = None
    financial_year: str  # e.g., "2018/19"
    amount: float

class TFSAContributionData(BaseModel):
    historical_contributions: List[TFSAHistoricalContributionBase]
    deposits: List[TFSADepositBase]
    financial_year_start: int

router = APIRouter(prefix="/tfsa", tags=["tfsa"])

@router.get("/contributions")
async def get_tfsa_contributions(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Get SA financial year (March to February)
    now = datetime.now()
    if now.month < 3:  # Jan or Feb
        financial_year_start = now.year - 1
    else:
        financial_year_start = now.year

    # Get historical contributions by year
    historical_contributions = db.query(models.TFSAHistoricalContribution).filter(
        models.TFSAHistoricalContribution.user_id == current_user.id
    ).all()

    # Get deposits for current financial year
    deposits = db.query(models.TFSADeposit).filter(
        models.TFSADeposit.user_id == current_user.id,
        models.TFSADeposit.financial_year_start == financial_year_start
    ).all()

    return {
        "historical_contributions": [
            {
                "id": h.id,
                "financial_year": h.financial_year,
                "amount": h.amount
            }
            for h in historical_contributions
        ],
        "financial_year_start": financial_year_start,
        "deposits": [
            {
                "id": d.id,
                "amount": d.amount,
                "date": (d.deposit_date.isoformat() + "Z") if d.deposit_date else None
            }
            for d in deposits
        ]
    }

@router.post("/contributions")
async def save_tfsa_contributions(
    data: TFSAContributionData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Clear and update historical contributions
    db.query(models.TFSAHistoricalContribution).filter(
        models.TFSAHistoricalContribution.user_id == current_user.id
    ).delete()

    for hist in data.historical_contributions:
        db.add(models.TFSAHistoricalContribution(
            user_id=current_user.id,
            financial_year=hist.financial_year,
            amount=hist.amount
        ))

    # Clear existing deposits for this financial year and add new ones
    db.query(models.TFSADeposit).filter(
        models.TFSADeposit.user_id == current_user.id,
        models.TFSADeposit.financial_year_start == data.financial_year_start
    ).delete()

    for deposit in data.deposits:
        # Handle date strings with 'Z' suffix (e.g., '2025-09-16Z' -> '2025-09-16')
        deposit_date_str = deposit.date.replace('Z', '').split('T')[0] if deposit.date else None
        db.add(models.TFSADeposit(
            user_id=current_user.id,
            amount=deposit.amount,
            deposit_date=date.fromisoformat(deposit_date_str) if deposit_date_str else None,
            financial_year_start=data.financial_year_start
        ))

    db.commit()
    return {"status": "success"}
