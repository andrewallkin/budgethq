import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from .. import models, database, auth
from datetime import date
from ..budget_period import get_period_dates_for_end_month, get_current_period

logger = logging.getLogger(__name__)

BUDGET_TRANSACTION_CATEGORIES = [
    "groceries_household", "bills", "subscriptions", "transport",
    "lifestyle_misc", "savings", "loan_repayment", "transfers", "uncategorized"
]

# Pydantic Models for Budget
class CategoryBase(BaseModel):
    name: str
    amount: float
    transaction_category: Optional[str] = "uncategorized"
    excluded: Optional[bool] = False

class BudgetData(BaseModel):
    salary: float
    needs: List[CategoryBase]
    wants: List[CategoryBase]
    savings: List[CategoryBase]
    budget_period_start_day: Optional[int] = None


class BudgetSettingsUpdate(BaseModel):
    budget_period_start_day: Optional[int] = None


router = APIRouter(prefix="/budget", tags=["budget"])

@router.get("/default_user")
async def get_budget(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()

    # Get net salary from latest payslip
    net_salary = None  # Default to None if no data exists
    
    latest_payslip = (
        db.query(models.MonthlyPayslip)
        .filter(models.MonthlyPayslip.user_id == current_user.id)
        .order_by(models.MonthlyPayslip.year.desc(), models.MonthlyPayslip.month.desc())
        .first()
    )
    
    if latest_payslip:
        net_salary = latest_payslip.net_pay
    elif budget and budget.salary:
        # Only use stored budget.salary if it's explicitly set and no payslip exists
        net_salary = budget.salary

    if not budget:
        return {
            "salary": net_salary,
            "needs": [],
            "wants": [],
            "savings": [],
            "budget_period_start_day": 1
        }

    needs = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'needs').all()
    wants = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'wants').all()
    savings = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'savings').all()

    start_day = budget.budget_period_start_day if budget.budget_period_start_day is not None else 1

    return {
        "salary": net_salary,
        "needs": [{"name": c.name, "amount": c.amount, "transaction_category": c.transaction_category or "uncategorized", "excluded": c.excluded or False} for c in needs],
        "wants": [{"name": c.name, "amount": c.amount, "transaction_category": c.transaction_category or "uncategorized", "excluded": c.excluded or False} for c in wants],
        "savings": [{"name": c.name, "amount": c.amount, "transaction_category": c.transaction_category or "uncategorized", "excluded": c.excluded or False} for c in savings],
        "budget_period_start_day": start_day
    }

@router.post("/default_user")
async def save_budget(data: BudgetData, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()

    if not budget:
        budget = models.Budget(user_id=current_user.id)
        db.add(budget)
        db.commit()
        db.refresh(budget)

    # Salary is now derived from payslip data
    # We ignore the incoming salary value

    # Update budget_period_start_day if provided
    if data.budget_period_start_day is not None:
        start_day = data.budget_period_start_day
        if 1 <= start_day <= 31:
            budget.budget_period_start_day = start_day
        else:
            budget.budget_period_start_day = 1

    # Clear existing categories
    db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id).delete()

    def _normalize_category(cat: Optional[str]) -> str:
        if not cat or cat not in BUDGET_TRANSACTION_CATEGORIES:
            return "uncategorized"
        return cat

    # Add new categories
    for item in data.needs:
        tc = _normalize_category(item.transaction_category)
        excluded = item.excluded or False
        db.add(models.BudgetCategory(budget_id=budget.id, type='needs', name=item.name, amount=item.amount, transaction_category=tc, excluded=excluded))
    for item in data.wants:
        tc = _normalize_category(item.transaction_category)
        excluded = item.excluded or False
        db.add(models.BudgetCategory(budget_id=budget.id, type='wants', name=item.name, amount=item.amount, transaction_category=tc, excluded=excluded))
    for item in data.savings:
        tc = _normalize_category(item.transaction_category)
        excluded = item.excluded or False
        db.add(models.BudgetCategory(budget_id=budget.id, type='savings', name=item.name, amount=item.amount, transaction_category=tc, excluded=excluded))

    db.commit()
    logger.info("Budget saved", extra={"user_id": current_user.id})
    return {"status": "success"}


@router.patch("/default_user")
async def update_budget_settings(
    data: BudgetSettingsUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update budget settings (e.g. budget_period_start_day) without replacing categories."""
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()
    if not budget:
        budget = models.Budget(user_id=current_user.id)
        db.add(budget)
        db.commit()
        db.refresh(budget)

    if data.budget_period_start_day is not None:
        start_day = data.budget_period_start_day
        budget.budget_period_start_day = start_day if 1 <= start_day <= 31 else 1

    db.commit()
    logger.info("Budget settings updated", extra={"user_id": current_user.id})
    return {"status": "success"}


@router.get("/period")
async def get_budget_period(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Get from_date and to_date for the budget period that ends in the given month.
    Uses the user's budget_period_start_day (default 1 = calendar month).
    """
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()
    start_day = budget.budget_period_start_day if budget and budget.budget_period_start_day is not None else 1
    from_date, to_date = get_period_dates_for_end_month(year, month, start_day)
    return {"from_date": from_date.isoformat(), "to_date": to_date.isoformat()}


@router.get("/period/current")
async def get_current_budget_period(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Get from_date and to_date for the budget period containing today.
    Also returns end_year and end_month for the period (for month picker display).
    """
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()
    start_day = budget.budget_period_start_day if budget and budget.budget_period_start_day is not None else 1
    from_date, to_date = get_current_period(date.today(), start_day)
    return {
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "end_year": to_date.year,
        "end_month": to_date.month,
    }
