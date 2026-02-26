from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from ..logic import calculate_monthly_tax_with_age, calculate_uif, calculate_rebalancing, calculate_ra_tax_scenarios

class TaxRequest(BaseModel):
    salary: float
    age: int

class RATaxRequest(BaseModel):
    salary: float
    age: int
    monthly_ra_contribution: float
    financial_year_start: Optional[int] = None

class RebalanceRequest(BaseModel):
    etfs: List[dict]  # Using dict since ETFBase is defined elsewhere
    threshold: float

router = APIRouter(prefix="/calculate", tags=["calculations"])

@router.post("/tax")
async def calculate_tax_endpoint(req: TaxRequest):
    if req.age < 65:
        age_group = "under_65"
    elif req.age < 75:
        age_group = "65_to_74"
    else:
        age_group = "75_and_over"

    monthly_tax = calculate_monthly_tax_with_age(req.salary, age_group)
    monthly_uif = calculate_uif(req.salary)

    return {
        "monthly_tax": monthly_tax,
        "monthly_uif": monthly_uif
    }

@router.post("/ra-tax")
async def calculate_ra_tax_endpoint(req: RATaxRequest):
    """Calculate RA tax scenarios for current, 10%, and 15% contribution rates."""
    result = calculate_ra_tax_scenarios(
        req.salary,
        req.age,
        req.monthly_ra_contribution,
        financial_year_start=req.financial_year_start
    )
    return result

@router.post("/rebalance")
async def calculate_rebalance_endpoint(req: RebalanceRequest):
    etfs_dicts = [etf for etf in req.etfs]
    actions, over, under = calculate_rebalancing(etfs_dicts, req.threshold)
    return {
        "actions": actions,
        "over_allocated": over,
        "under_allocated": under
    }
