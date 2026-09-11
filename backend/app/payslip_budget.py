"""Monthly budget income from payslips.

If the latest payslip has additional income (bonus, backpay), skip it and use
the most recent payslip that does not. A once-a-year bonus should not change
how the month is budgeted, and SARS does not split PAYE in a way we can undo.
"""

from dataclasses import dataclass
from typing import Any, Optional, Sequence

from sqlalchemy.orm import Session

from . import models


@dataclass(frozen=True)
class MonthlyBudgetIncome:
    amount: float
    year: Optional[int]
    month: Optional[int]
    skipped_additional: bool


def additional_income_total(payslip: Optional[Any]) -> float:
    if payslip is None:
        return 0.0
    items = getattr(payslip, "additional_income", None) or []
    return float(sum((getattr(item, "amount", 0) or 0) for item in items))


def load_user_payslips_newest_first(db: Session, user_id: int) -> list:
    return (
        db.query(models.MonthlyPayslip)
        .filter(models.MonthlyPayslip.user_id == user_id)
        .order_by(models.MonthlyPayslip.year.desc(), models.MonthlyPayslip.month.desc())
        .all()
    )


def monthly_budget_income(payslips: Sequence[Any]) -> Optional[MonthlyBudgetIncome]:
    if not payslips:
        return None

    latest = payslips[0]
    latest_has_additional = additional_income_total(latest) > 0
    chosen = latest

    if latest_has_additional:
        for payslip in payslips:
            if additional_income_total(payslip) <= 0:
                chosen = payslip
                break

    skipped = latest_has_additional and additional_income_total(chosen) <= 0
    return MonthlyBudgetIncome(
        amount=round(float(getattr(chosen, "net_pay", 0) or 0), 2),
        year=getattr(chosen, "year", None),
        month=getattr(chosen, "month", None),
        skipped_additional=skipped,
    )


def monthly_budget_income_for_user(db: Session, user_id: int) -> Optional[MonthlyBudgetIncome]:
    return monthly_budget_income(load_user_payslips_newest_first(db, user_id))
