from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from .. import models, database, auth
from ..tax_engine import calculate_salary_breakdown

# Pydantic Models for Budget
class CategoryBase(BaseModel):
    name: str
    amount: float
    group: Optional[str] = None

class BudgetData(BaseModel):
    salary: float
    needs: List[CategoryBase]
    wants: List[CategoryBase]
    savings: List[CategoryBase]

router = APIRouter(prefix="/budget", tags=["budget"])

@router.get("/default_user")
async def get_budget(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()

    if not budget:
        return {}

    # Get net salary from Salary table (now stored, not calculated on fly)
    net_salary = budget.salary # Default to stored value (backward compatibility)

    salary_record = db.query(models.Salary).filter(models.Salary.user_id == current_user.id).first()
    if salary_record:
        # Use the stored net_salary if available
        if hasattr(salary_record, 'net_salary') and salary_record.net_salary:
            net_salary = salary_record.net_salary
        # Fallback to old calculation if needed for backward compatibility
        elif salary_record.items:
            breakdown = calculate_salary_breakdown(salary_record, salary_record.age or 30, save_to_db=False)
            net_salary = breakdown["net_pay"]

    needs = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'needs').all()
    wants = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'wants').all()
    savings = db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id, models.BudgetCategory.type == 'savings').all()

    return {
        "salary": net_salary,
        "needs": [{"name": c.name, "amount": c.amount, "group": c.group} for c in needs],
        "wants": [{"name": c.name, "amount": c.amount, "group": c.group} for c in wants],
        "savings": [{"name": c.name, "amount": c.amount, "group": c.group} for c in savings]
    }

@router.post("/default_user")
async def save_budget(data: BudgetData, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    budget = db.query(models.Budget).filter(models.Budget.user_id == current_user.id).first()

    if not budget:
        budget = models.Budget(user_id=current_user.id)
        db.add(budget)
        db.commit()
        db.refresh(budget)


    # Salary is now derived from the Salary module/table.
    # We ignore the incoming salary value to prevent overwriting the calculated source of truth.
    # budget.salary = data.salary
    # Age is now only stored in Salary table, not Budget

    # Clear existing categories
    db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id == budget.id).delete()

    # Add new categories
    for item in data.needs:
        db.add(models.BudgetCategory(budget_id=budget.id, type='needs', name=item.name, amount=item.amount, group=item.group))
    for item in data.wants:
        db.add(models.BudgetCategory(budget_id=budget.id, type='wants', name=item.name, amount=item.amount, group=item.group))
    for item in data.savings:
        db.add(models.BudgetCategory(budget_id=budget.id, type='savings', name=item.name, amount=item.amount, group=item.group))

    db.commit()
    return {"status": "success"}
