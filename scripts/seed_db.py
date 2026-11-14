#!/usr/bin/env python3
"""Seed a local database with fictional South African demo data (no bank APIs)."""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import auth, database, models  # noqa: E402
from app.portfolio_service import ensure_default_tfsa_portfolio  # noqa: E402
from app.utils import get_sast_now  # noqa: E402

DEMO_USERNAME = "sandi.molefe@example.com"
DEMO_PASSWORD = "demo-local-only"

BUDGET_SALARY = 62_500.0  # monthly net aligned with payslip below

NEEDS = [
    ("Rent — Sandton flat", 14_500.0, "housing"),
    ("Groceries", 4_200.0, "groceries"),
    ("Electricity & water (City Power)", 1_850.0, "utilities"),
    ("Medical aid (Discovery)", 3_100.0, "health"),
    ("Vehicle finance", 5_800.0, "transport"),
]

WANTS = [
    ("Dining & takeaway", 2_400.0, "dining"),
    ("Streaming & mobile data", 980.0, "subscriptions"),
    ("Weekend trips", 1_750.0, "travel"),
]

SAVINGS = [
    ("TFSA contribution", 3_500.0, "investments"),
    ("Emergency fund", 2_000.0, "savings"),
    ("RA additional", 1_500.0, "retirement"),
]


def _clear_user_seed_data(db: Session, user_id: int) -> None:
    payslip_ids = [
        p.id for p in db.query(models.MonthlyPayslip).filter(models.MonthlyPayslip.user_id == user_id).all()
    ]
    if payslip_ids:
        db.query(models.PayslipItem).filter(models.PayslipItem.payslip_id.in_(payslip_ids)).delete(
            synchronize_session=False
        )
        db.query(models.PayslipAdditionalIncome).filter(
            models.PayslipAdditionalIncome.payslip_id.in_(payslip_ids)
        ).delete(synchronize_session=False)
    budget_ids = [b.id for b in db.query(models.Budget).filter(models.Budget.user_id == user_id).all()]
    if budget_ids:
        db.query(models.BudgetCategory).filter(models.BudgetCategory.budget_id.in_(budget_ids)).delete(
            synchronize_session=False
        )
    for model, field in [
        (models.MonthlyPayslip, "user_id"),
        (models.Budget, "user_id"),
        (models.EmergencySavings, "user_id"),
        (models.RetirementAnnuity, "user_id"),
        (models.RAValueHistory, "user_id"),
        (models.ETFHolding, "user_id"),
        (models.UserSheet, "user_id"),
        (models.InvestmentPortfolio, "user_id"),
    ]:
        db.query(model).filter(getattr(model, field) == user_id).delete(synchronize_session=False)
    db.commit()


def _upsert_demo_user(db: Session, *, force: bool) -> models.User:
    existing = db.query(models.User).filter(models.User.username == DEMO_USERNAME).first()
    if existing:
        if force:
            _clear_user_seed_data(db, existing.id)
            existing.hashed_password = auth.get_password_hash(DEMO_PASSWORD)
            existing.has_investec_account = False
            existing.show_ra_under_investments = True
            db.commit()
            db.refresh(existing)
            return existing
        print(f"Demo user already exists ({DEMO_USERNAME}); use --force to re-seed.")
        return existing

    user = models.User(
        username=DEMO_USERNAME,
        hashed_password=auth.get_password_hash(DEMO_PASSWORD),
        has_investec_account=False,
        show_ra_under_investments=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_budget(db: Session, user: models.User) -> None:
    budget = models.Budget(user_id=user.id, salary=BUDGET_SALARY, budget_period_start_day=1)
    db.add(budget)
    db.commit()
    db.refresh(budget)

    for name, amount, tc in NEEDS:
        db.add(
            models.BudgetCategory(
                budget_id=budget.id, type="needs", name=name, amount=amount, transaction_category=tc
            )
        )
    for name, amount, tc in WANTS:
        db.add(
            models.BudgetCategory(
                budget_id=budget.id, type="wants", name=name, amount=amount, transaction_category=tc
            )
        )
    for name, amount, tc in SAVINGS:
        db.add(
            models.BudgetCategory(
                budget_id=budget.id, type="savings", name=name, amount=amount, transaction_category=tc
            )
        )
    db.commit()


def _seed_payslip(db: Session, user: models.User) -> None:
    today = get_sast_now().date()
    year, month = today.year, today.month
    gross = 78_200.0
    paye = 11_450.0
    uif = 177.12
    net = 62_500.0

    payslip = models.MonthlyPayslip(
        user_id=user.id,
        year=year,
        month=month,
        title="Business Analyst",
        company_name="Johannesburg Digital Works (Pty) Ltd",
        gross_salary=gross,
        paye=paye,
        uif_employee_portion=uif,
        net_pay=net,
        uploaded_at=get_sast_now(),
    )
    db.add(payslip)
    db.commit()
    db.refresh(payslip)

    line_items = [
        ("Company pension fund", 4_692.0, "company_contribution"),
        ("Medical aid — employer", 1_550.0, "company_contribution"),
        ("PAYE", paye, "personal_deduction"),
        ("UIF", uif, "personal_deduction"),
        ("Pension fund — employee", 3_128.0, "personal_deduction"),
    ]
    for desc, amount, item_type in line_items:
        db.add(models.PayslipItem(payslip_id=payslip.id, description=desc, amount=amount, item_type=item_type))

    db.add(
        models.PayslipAdditionalIncome(
            payslip_id=payslip.id, description="Quarterly performance bonus (fictional)", amount=5_000.0
        )
    )
    db.commit()


def _seed_emergency_and_ra(db: Session, user: models.User) -> None:
    db.add(
        models.EmergencySavings(
            user_id=user.id,
            current_fund=48_500.0,
            monthly_deposit=2_000.0,
            target_type="months",
            target_months=6,
            fund_source="manual",
        )
    )
    db.add(models.RetirementAnnuity(user_id=user.id, monthly_contribution=3_500.0))
    db.add(
        models.RAValueHistory(
            user_id=user.id,
            record_date=date.today().replace(day=1),
            portfolio_value=412_800.0,
        )
    )
    db.commit()


def _seed_investments(db: Session, user: models.User) -> None:
    portfolio = ensure_default_tfsa_portfolio(db, user.id)
    portfolio.name = "TFSA — Demo"
    db.commit()

    holdings = [
        ("JSE:STX40", "Satrix Top 40 ETF", "South Africa", 420.0, 68.25, 40.0),
        ("JSE:STXEMG", "Satrix MSCI EM IMI ETF", "Global EM", 180.0, 52.10, 25.0),
        ("JSE:STXWDM", "Satrix MSCI World ETF", "Global", 95.0, 118.40, 20.0),
        ("JSE:SBND", "Satrix SA Bond ETF", "South Africa", 310.0, 14.85, 15.0),
    ]
    for ticker, name, region, shares, price, target_pct in holdings:
        db.add(
            models.ETFHolding(
                user_id=user.id,
                portfolio_id=portfolio.id,
                jse_ticker=ticker,
                etf_name=name,
                region=region,
                shares=shares,
                current_price=price,
                price_updated_at=get_sast_now(),
                target_percentage=target_pct,
                cost_basis=round(shares * price * 0.92, 2),
                instrument_type="etf",
            )
        )
    db.commit()


def seed_demo_data(db: Session, *, force: bool) -> None:
    user = _upsert_demo_user(db, force=force)
    if not force and db.query(models.Budget).filter(models.Budget.user_id == user.id).first():
        return

    _seed_budget(db, user)
    _seed_payslip(db, user)
    _seed_emergency_and_ra(db, user)
    _seed_investments(db, user)
    print(f"Seeded demo data for {DEMO_USERNAME}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed fictional BudgetHQ demo data")
    parser.add_argument("--force", action="store_true", help="Replace existing demo user data")
    args = parser.parse_args()

    db = database.SessionLocal()
    try:
        seed_demo_data(db, force=args.force)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())