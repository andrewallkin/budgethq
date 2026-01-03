from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from .. import models, database, auth

class ETFBase(BaseModel):
    ETF: str
    Region: str
    Target_Percentage: float
    Current_Value: float

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

@router.get("")
async def get_portfolio(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    etfs = db.query(models.ETF).filter(models.ETF.user_id == current_user.id).all()
    return [{"ETF": e.ticker, "Region": e.region, "Target_Percentage": e.target_percentage, "Current_Value": e.current_value} for e in etfs]

@router.post("")
async def save_portfolio(etfs: List[ETFBase], current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    # Clear existing
    db.query(models.ETF).filter(models.ETF.user_id == current_user.id).delete()

    # Add new
    for etf in etfs:
        db.add(models.ETF(
            user_id=current_user.id,
            ticker=etf.ETF,
            region=etf.Region,
            target_percentage=etf.Target_Percentage,
            current_value=etf.Current_Value
        ))

    db.commit()
    return {"status": "success"}
