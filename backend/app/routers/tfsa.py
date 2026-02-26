from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from .. import models, database, auth, utils
from ..tax_engine import get_tax_config

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
    # Optional client-provided financial year start kept for backward compatibility;
    # server will always derive the correct FY from deposit dates / current date.
    financial_year_start: Optional[int] = None
    current_financial_year_start: Optional[int] = None

router = APIRouter(prefix="/tfsa", tags=["tfsa"])

@router.get("/contributions")
async def get_tfsa_contributions(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Determine current SA financial year start using shared utility
    financial_year_start = utils.get_sa_financial_year_start()

    # Get historical contributions by year
    historical_contributions = db.query(models.TFSAHistoricalContribution).filter(
        models.TFSAHistoricalContribution.user_id == current_user.id
    ).all()

    # Get deposits for current financial year
    deposits = db.query(models.TFSADeposit).filter(
        models.TFSADeposit.user_id == current_user.id,
        models.TFSADeposit.financial_year_start == financial_year_start
    ).all()

    tax_config = get_tax_config(financial_year_start)

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
        "current_financial_year_label": utils.format_sa_financial_year_label(financial_year_start),
        "annual_limit": tax_config["tfsa_annual_limit"],
        "deposits": [
            {
                "id": d.id,
                "amount": d.amount,
                "date": d.deposit_date.isoformat() if d.deposit_date else None
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

    # Clear existing deposits for each financial year present in the payload
    # and re-insert them with server-derived financial_year_start.
    # This keeps behavior similar (replace this FY's data) but makes FY logic date-aware.
    fy_starts_seen = set()

    for deposit in data.deposits:
        # Handle date strings with 'Z' suffix (e.g., '2025-09-16Z' -> '2025-09-16')
        deposit_date_str = deposit.date.replace('Z', '').split('T')[0] if deposit.date else None
        deposit_date = date.fromisoformat(deposit_date_str) if deposit_date_str else None

        # Derive financial year from deposit date; if no date, fall back to current FY
        if deposit_date:
            fy_start = utils.get_sa_financial_year_start(deposit_date)
        else:
            fy_start = utils.get_sa_financial_year_start()

        if fy_start not in fy_starts_seen:
            fy_starts_seen.add(fy_start)
            db.query(models.TFSADeposit).filter(
                models.TFSADeposit.user_id == current_user.id,
                models.TFSADeposit.financial_year_start == fy_start
            ).delete()

        db.add(models.TFSADeposit(
            user_id=current_user.id,
            amount=deposit.amount,
            deposit_date=deposit_date,
            financial_year_start=fy_start
        ))

    db.commit()
    return {"status": "success"}
