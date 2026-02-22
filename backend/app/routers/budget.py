from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from .. import models, database, auth

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
            "savings": []
        }

    needs = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'needs').all()
    wants = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'wants').all()
    savings = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'savings').all()

    return {
        "salary": net_salary,
        "needs": [{"name": c.name, "amount": c.amount, "transaction_category": c.transaction_category or "uncategorized", "excluded": c.excluded or False} for c in needs],
        "wants": [{"name": c.name, "amount": c.amount, "transaction_category": c.transaction_category or "uncategorized", "excluded": c.excluded or False} for c in wants],
        "savings": [{"name": c.name, "amount": c.amount, "transaction_category": c.transaction_category or "uncategorized", "excluded": c.excluded or False} for c in savings]
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
    return {"status": "success"}
