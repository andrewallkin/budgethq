"""Budget vs actual spending summary for transaction exports."""

from dataclasses import dataclass
from typing import Iterable, List, Optional

from sqlalchemy.orm import Session

from . import models
from .transaction_categories import EARNINGS_CATEGORIES, category_label
from .transaction_links import (
    apply_linked_offsets_to_spending,
    compute_offset_totals,
    load_user_transaction_links,
)

COMPARISON_CATEGORIES = [
    "groceries",
    "household_home",
    "dining_takeaways",
    "shopping_clothing",
    "travel_accommodation",
    "entertainment",
    "health_wellness",
    "bills",
    "subscriptions",
    "transport",
    "savings",
    "loan_repayment",
    "uncategorized",
]


@dataclass
class BudgetComparisonRow:
    category_key: str
    label: str
    budgeted: float
    actual: float
    remaining: float


@dataclass
class BudgetComparisonSummary:
    rows: List[BudgetComparisonRow]
    total_budgeted: float
    total_spent: float
    remaining: float
    unlinked_refund_total: float
    unlinked_reimbursement_total: float
    linked_offset_total: float
    reimbursements_total: float

    @property
    def refund_credit_total(self) -> float:
        """Backward-compatible alias for unlinked refund envelope boost."""
        return self.unlinked_refund_total

    @property
    def unlinked_offset_total(self) -> float:
        return self.unlinked_refund_total + self.unlinked_reimbursement_total


def _empty_category_totals() -> dict[str, float]:
    return {key: 0.0 for key in COMPARISON_CATEGORIES + ["income", "transfers"]}


def get_budgeted_amounts_by_category(db: Session, user_id: int) -> dict[str, float]:
    """Sum non-excluded budget line items by transaction_category."""
    totals = _empty_category_totals()

    budget = db.query(models.Budget).filter(models.Budget.user_id == user_id).first()
    if not budget:
        return totals

    latest_payslip = (
        db.query(models.MonthlyPayslip)
        .filter(models.MonthlyPayslip.user_id == user_id)
        .order_by(models.MonthlyPayslip.year.desc(), models.MonthlyPayslip.month.desc())
        .first()
    )
    if latest_payslip:
        totals["income"] = latest_payslip.net_pay or 0.0
    elif budget.salary:
        totals["income"] = budget.salary

    categories = (
        db.query(models.BudgetCategory)
        .filter(models.BudgetCategory.budget_id == budget.id)
        .all()
    )
    for item in categories:
        if item.excluded:
            continue
        if (item.cadence or "monthly") != "monthly":
            continue
        cat = item.transaction_category or "uncategorized"
        if cat in totals:
            totals[cat] += item.amount or 0.0

    return totals


def compute_actual_spending(
    transactions: Iterable,
    links: Optional[Iterable] = None,
) -> dict[str, float]:
    """Aggregate debit spending per category, optionally netting linked offsets."""
    totals = _empty_category_totals()

    for txn in transactions:
        if not txn.category:
            if txn.transaction_type == "DEBIT":
                totals["uncategorized"] += abs(txn.amount)
        elif txn.category in EARNINGS_CATEGORIES:
            if txn.transaction_type == "CREDIT":
                totals["income"] += txn.amount
        elif txn.category in totals:
            if txn.transaction_type == "DEBIT":
                totals[txn.category] += abs(txn.amount)

    if links is not None:
        totals = apply_linked_offsets_to_spending(totals, transactions, links)

    return totals


def build_budget_comparison(
    db: Session,
    user_id: int,
    transactions: Iterable,
) -> Optional[BudgetComparisonSummary]:
    """Build budget vs actual rows matching Budget Analysis comparison table."""
    transaction_list = list(transactions)
    links = load_user_transaction_links(db, user_id)

    budgeted = get_budgeted_amounts_by_category(db, user_id)
    actual = compute_actual_spending(transaction_list, links)

    has_budget = any(budgeted[cat] > 0 for cat in COMPARISON_CATEGORIES) or budgeted["income"] > 0
    if not has_budget:
        return None

    rows = []
    for cat in COMPARISON_CATEGORIES:
        budget_amount = budgeted[cat]
        actual_amount = actual[cat]
        if budget_amount == 0 and actual_amount == 0:
            continue
        rows.append(
            BudgetComparisonRow(
                category_key=cat,
                label=category_label(cat),
                budgeted=budget_amount,
                actual=actual_amount,
                remaining=budget_amount - actual_amount,
            )
        )

    total_budgeted = (
        sum(budgeted[cat] for cat in COMPARISON_CATEGORIES)
        - budgeted["uncategorized"]
    )
    total_spent = sum(actual[cat] for cat in COMPARISON_CATEGORIES)

    (
        unlinked_refund_total,
        unlinked_reimbursement_total,
        linked_offset_total,
        reimbursements_total,
    ) = compute_offset_totals(transaction_list, links)

    unlinked_offset_total = unlinked_refund_total + unlinked_reimbursement_total
    total_budgeted_display = total_budgeted + unlinked_offset_total

    return BudgetComparisonSummary(
        rows=rows,
        total_budgeted=total_budgeted_display,
        total_spent=total_spent,
        remaining=total_budgeted_display - total_spent,
        unlinked_refund_total=unlinked_refund_total,
        unlinked_reimbursement_total=unlinked_reimbursement_total,
        linked_offset_total=linked_offset_total,
        reimbursements_total=reimbursements_total,
    )
