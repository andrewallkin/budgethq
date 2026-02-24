from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from .. import models, database, auth

# EmergencySavings Pydantic Models
class EmergencySavingsData(BaseModel):
    current_fund: Optional[float] = 0
    monthly_deposit: Optional[float] = 0
    target_type: Optional[str] = None  # 'months' or 'target_value'
    target_months: Optional[int] = None  # 3, 6, or 12
    target_value: Optional[float] = None
    fund_source: Optional[str] = None  # 'manual' or 'bank_sync'

router = APIRouter(prefix="/emergency-savings", tags=["emergency-savings"])

@router.get("/default_user")
async def get_emergency_savings(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    es = db.query(models.EmergencySavings).filter(
        models.EmergencySavings.user_id == current_user.id
    ).first()

    if not es:
        return {
            "current_fund": 0,
            "monthly_deposit": 0,
            "target_type": None,
            "target_months": None,
            "target_value": None,
            "fund_source": "manual"
        }

    return {
        "current_fund": es.current_fund or 0,
        "monthly_deposit": es.monthly_deposit or 0,
        "target_type": es.target_type,
        "target_months": es.target_months,
        "target_value": es.target_value,
        "fund_source": es.fund_source or "manual"
    }

@router.post("/default_user")
async def save_emergency_savings(
    data: EmergencySavingsData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    es = db.query(models.EmergencySavings).filter(
        models.EmergencySavings.user_id == current_user.id
    ).first()

    if not es:
        es = models.EmergencySavings(user_id=current_user.id)
        db.add(es)

    es.current_fund = data.current_fund or 0
    es.monthly_deposit = data.monthly_deposit or 0
    es.target_type = data.target_type
    es.target_months = data.target_months
    es.target_value = data.target_value
    if data.fund_source is not None:
        es.fund_source = data.fund_source

    db.commit()
    return {"status": "success"}
