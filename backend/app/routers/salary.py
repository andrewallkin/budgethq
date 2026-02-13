"""
Salary router for RA Tax Calculator - returns gross income from latest payslip.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import MonthlyPayslip
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/salary", tags=["salary"])


@router.get("")
def get_salary_for_ra_calculator(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns gross_income (total income from latest payslip) for RA tax calculator.
    Total income = gross_salary + company_contributions + additional_income.
    Age defaults to 30 (no age storage in current schema).
    """
    latest_payslip = (
        db.query(MonthlyPayslip)
        .filter(MonthlyPayslip.user_id == current_user.id)
        .order_by(MonthlyPayslip.year.desc(), MonthlyPayslip.month.desc())
        .options(
            selectinload(MonthlyPayslip.items),
            selectinload(MonthlyPayslip.additional_income),
        )
        .first()
    )
    if not latest_payslip:
        return {"gross_income": 0, "age": 30}

    company_contrib = sum(
        i.amount for i in latest_payslip.items
        if i.item_type == "company_contribution"
    )
    additional_income = sum(
        i.amount for i in (latest_payslip.additional_income or [])
    )
    gross_income = (
        latest_payslip.gross_salary + company_contrib + additional_income
    )
    return {"gross_income": round(gross_income, 2), "age": 30}
