from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from .. import models, database, auth

# RetirementAnnuity Pydantic Models
class RetirementAnnuityData(BaseModel):
    current_value: Optional[float] = 0
    monthly_contribution: Optional[float] = 0

router = APIRouter(prefix="/ra", tags=["retirement-annuity"])

@router.get("/default_user")
async def get_retirement_annuity(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    ra = db.query(models.RetirementAnnuity).filter(
        models.RetirementAnnuity.user_id == current_user.id
    ).first()

    if not ra:
        return {
            "current_value": 0,
            "monthly_contribution": 0
        }

    return {
        "current_value": ra.current_value or 0,
        "monthly_contribution": ra.monthly_contribution or 0
    }

@router.post("/default_user")
async def save_retirement_annuity(
    data: RetirementAnnuityData,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    ra = db.query(models.RetirementAnnuity).filter(
        models.RetirementAnnuity.user_id == current_user.id
    ).first()

    if not ra:
        ra = models.RetirementAnnuity(user_id=current_user.id)
        db.add(ra)

    ra.current_value = data.current_value or 0
    ra.monthly_contribution = data.monthly_contribution or 0

    db.commit()
    return {"status": "success"}
