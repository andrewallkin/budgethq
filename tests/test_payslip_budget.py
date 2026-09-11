"""Unit tests for monthly budget income from payslips."""
import sys
from types import SimpleNamespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.payslip_budget import monthly_budget_income


def _payslip(**kwargs):
    return SimpleNamespace(**kwargs)


class TestMonthlyBudgetIncome:
    def test_latest_without_bonus_uses_that_net_pay(self):
        income = monthly_budget_income([
            _payslip(year=2026, month=8, net_pay=42000.0, additional_income=[]),
            _payslip(year=2026, month=7, net_pay=41000.0, additional_income=[]),
        ])
        assert income.amount == 42000.0
        assert income.month == 8
        assert income.skipped_additional is False

    def test_bonus_month_uses_previous_normal_payslip(self):
        income = monthly_budget_income([
            _payslip(
                year=2026,
                month=8,
                net_pay=114157.51,
                additional_income=[SimpleNamespace(amount=116671.25)],
            ),
            _payslip(year=2026, month=7, net_pay=45231.10, additional_income=[]),
        ])
        assert income.amount == 45231.10
        assert income.year == 2026
        assert income.month == 7
        assert income.skipped_additional is True

    def test_skips_multiple_bonus_months(self):
        income = monthly_budget_income([
            _payslip(year=2026, month=8, net_pay=100000.0, additional_income=[SimpleNamespace(amount=1)]),
            _payslip(year=2026, month=7, net_pay=90000.0, additional_income=[SimpleNamespace(amount=1)]),
            _payslip(year=2026, month=6, net_pay=40000.0, additional_income=[]),
        ])
        assert income.amount == 40000.0
        assert income.month == 6

    def test_all_bonus_months_fall_back_to_latest(self):
        income = monthly_budget_income([
            _payslip(year=2026, month=8, net_pay=114157.51, additional_income=[SimpleNamespace(amount=1)]),
        ])
        assert income.amount == 114157.51
        assert income.skipped_additional is False

    def test_empty(self):
        assert monthly_budget_income([]) is None
        assert monthly_budget_income(None or []) is None
