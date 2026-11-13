"""Deterministic payslip checks, using the May and August 2026 benchmark figures."""

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.payslip_extraction import FinancialEntry, PayslipExtraction
from app.payslip_reconcile import expected_net_pay, reconcile_payslip


def _entry(description: str, amount: float) -> FinancialEntry:
    return FinancialEntry(description=description, amount=amount)


def _may(**overrides) -> PayslipExtraction:
    payload = dict(
        title="Lead Generative AI Engineer",
        company_name="GoTyme Bank",
        gross_salary=63065.54,
        company_contributions=[
            _entry("SDL", 657.80),
            _entry("UIF", 177.12),
            _entry("Medical Aid - Discovery", 1600.0),
            _entry("Group Life - Discovery", 1114.46),
        ],
        paye=16614.31,
        uif_employee_portion=177.12,
        other_deductions=[
            _entry("Expense Claims", 18415.35),
            _entry("Medical Aid - Discovery", 1418.0),
        ],
        additional_income=[_entry("Expense Claims", 18415.35)],
        net_pay=44856.11,
    )
    payload.update(overrides)
    return PayslipExtraction(**payload)


def _descriptions(entries) -> list[str]:
    return [entry.description for entry in entries]


def test_may_keeps_expense_claim_printed_in_both_columns():
    result = reconcile_payslip(_may())

    assert _descriptions(result.additional_income) == ["Expense Claims"]
    assert _descriptions(result.other_deductions) == ["Expense Claims", "Medical Aid - Discovery"]
    assert _descriptions(result.company_contributions) == [
        "Medical Aid - Discovery",
        "Group Life - Discovery",
    ]
    assert result.net_pay == 44856.11
    assert result.total_earnings == 81480.89


def test_mirrored_claim_is_dropped_when_printed_net_excludes_it():
    # Both copies are present, but net was computed without the claim on either side.
    # 100 - 20 = 80, so the earnings copy is a duplicate and must go.
    result = reconcile_payslip(PayslipExtraction(
        title=None,
        company_name="Example",
        gross_salary=100,
        company_contributions=[],
        paye=0,
        uif_employee_portion=0,
        other_deductions=[_entry("Expense Claims", 20)],
        additional_income=[_entry("Expense Claims", 20)],
        net_pay=80,
    ))

    assert result.additional_income == []
    assert _descriptions(result.other_deductions) == ["Expense Claims"]


def test_ambiguous_repair_is_left_unchanged():
    original = PayslipExtraction(
        title=None,
        company_name="Example",
        gross_salary=100,
        company_contributions=[],
        paye=0,
        uif_employee_portion=0,
        other_deductions=[],
        additional_income=[_entry("Bonus", 10), _entry("Backpay", 10)],
        net_pay=110,
    )
    result = reconcile_payslip(original)

    assert _descriptions(result.additional_income) == ["Bonus", "Backpay"]
    assert result.net_pay == 110


def test_august_bonus_stays_out_of_gross_and_anchor_holds():
    result = reconcile_payslip(PayslipExtraction(
        title="Lead Generative AI Engineer",
        company_name="GoTyme Bank",
        gross_salary=66218.39,
        company_contributions=[
            _entry("Medical Aid - Discovery", 1600.0),
            _entry("Group Life - Discovery", 1169.01),
        ],
        paye=63939.0,
        uif_employee_portion=177.12,
        other_deductions=[
            _entry("Vitality", 429.0),
            _entry("Medical Aid - Discovery", 1418.0),
        ],
        additional_income=[
            _entry("Annual Bonus", 113517.97),
            _entry("Backpay Current Yr", 3153.28),
        ],
        net_pay=116926.52,
    ))

    assert result.gross_salary == 66218.39
    assert _descriptions(result.additional_income) == ["Annual Bonus", "Backpay Current Yr"]
    assert result.net_pay == 116926.52
    assert result.total_earnings == 182889.64


def test_generic_allowance_header_is_dropped():
    result = reconcile_payslip(PayslipExtraction(
        title=None,
        company_name="Example",
        gross_salary=1000,
        company_contributions=[],
        paye=0,
        uif_employee_portion=0,
        other_deductions=[],
        additional_income=[
            _entry("Allowance", 1320.30),
            _entry("Travel Allowance", 1320.30),
        ],
        net_pay=2320.30,
    ))

    assert _descriptions(result.additional_income) == ["Travel Allowance"]


def test_printed_total_earnings_that_disagrees_is_kept():
    result = reconcile_payslip(PayslipExtraction(
        title=None,
        company_name="Example",
        gross_salary=100,
        total_earnings=250,
        company_contributions=[],
        paye=0,
        uif_employee_portion=0,
        other_deductions=[],
        additional_income=[],
        net_pay=100,
    ))

    assert result.total_earnings == 250


def test_total_earnings_row_is_dropped():
    result = reconcile_payslip(PayslipExtraction(
        title=None,
        company_name="Example",
        gross_salary=100,
        company_contributions=[],
        paye=0,
        uif_employee_portion=0,
        other_deductions=[],
        additional_income=[_entry("Total Earnings", 100)],
        net_pay=100,
    ))

    assert result.additional_income == []


def test_take_home_formula_excludes_company_contributions():
    # Same inputs recalculate_net_pay passes through. Company contributions are omitted.
    payslip = SimpleNamespace(
        gross_salary=66218.39,
        additional_income=[
            SimpleNamespace(amount=113517.97),
            SimpleNamespace(amount=3153.28),
        ],
        paye=63939.0,
        uif_employee_portion=177.12,
        items=[
            SimpleNamespace(amount=1600.0, item_type="company_contribution"),
            SimpleNamespace(amount=1169.01, item_type="company_contribution"),
            SimpleNamespace(amount=429.0, item_type="personal_deduction"),
            SimpleNamespace(amount=1418.0, item_type="personal_deduction"),
        ],
    )

    net_pay = expected_net_pay(
        payslip.gross_salary,
        [item.amount for item in payslip.additional_income],
        payslip.paye,
        payslip.uif_employee_portion,
        [item.amount for item in payslip.items if item.item_type == "personal_deduction"],
    )

    assert net_pay == 116926.52
