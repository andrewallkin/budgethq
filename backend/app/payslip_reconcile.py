"""Deterministic checks on a structured payslip extraction.

The take-home identity is:

    gross_salary + additional_income - PAYE - employee UIF - other_deductions = net_pay

Company contributions are cost-to-company. They are not part of take-home.
"""

from decimal import Decimal, ROUND_HALF_UP

from .payslip_extraction import FinancialEntry, PayslipExtraction

_CENT = Decimal("0.01")
_GENERIC_HEADERS = {
    "income",
    "deduction",
    "deductions",
    "allowance",
    "allowances",
    "reimbursement",
    "reimbursements",
}
_TOTAL_LABELS = {
    "total earnings",
    "total income",
    "total deductions",
    "total company contributions",
    "gross salary",
    "nett pay",
    "net pay",
}


def money(value) -> Decimal:
    return Decimal(str(value if value is not None else 0)).quantize(_CENT, rounding=ROUND_HALF_UP)


def expected_net_pay(gross, additional_amounts, paye, uif, deduction_amounts) -> float:
    """Take-home from the line items. Company contributions are excluded."""
    calc = (
        money(gross)
        + sum(money(amount) for amount in additional_amounts)
        - money(paye)
        - money(uif)
        - sum(money(amount) for amount in deduction_amounts)
    )
    return float(calc)


def earnings_total(data: PayslipExtraction) -> Decimal:
    return money(data.gross_salary) + sum(money(entry.amount) for entry in data.additional_income)


def reconcile_payslip(data: PayslipExtraction) -> PayslipExtraction:
    cleaned = _clean(data)
    collapsed = _drop_mirrored_income_when_anchor_holds(cleaned)
    checked = collapsed if _anchor_ok(collapsed) else _unique_repair(collapsed)
    return _align_total_earnings(checked)


def _align_total_earnings(data: PayslipExtraction) -> PayslipExtraction:
    """Keep a printed total that matches the earnings lines. A zero total is filled from the lines.

    A printed total that does not match is left as printed so the review screen can show the gap.
    """
    computed = earnings_total(data)
    printed = money(data.total_earnings)
    if printed == 0 or abs(printed - computed) <= _CENT:
        return data.model_copy(update={"total_earnings": float(computed)})
    return data


def _clean(data: PayslipExtraction) -> PayslipExtraction:
    return data.model_copy(update={
        "gross_salary": float(money(data.gross_salary)),
        "paye": float(money(data.paye)),
        "uif_employee_portion": float(money(data.uif_employee_portion)),
        "net_pay": float(money(data.net_pay)),
        "company_contributions": _clean_entries(data.company_contributions, employer_costs=True),
        "other_deductions": _clean_entries(data.other_deductions),
        "additional_income": _clean_entries(data.additional_income),
    })


def _clean_entries(entries: list[FinancialEntry], employer_costs: bool = False) -> list[FinancialEntry]:
    rounded = [
        FinancialEntry(description=entry.description.strip(), amount=float(money(entry.amount)))
        for entry in entries
        if entry.description and entry.description.strip()
    ]
    kept = []
    for entry in rounded:
        label = entry.description.casefold()
        if label in _TOTAL_LABELS:
            continue
        if employer_costs and _is_employer_cost(label):
            continue
        kept.append(entry)
    amounts = [entry.amount for entry in kept]
    without_headers = []
    for entry in kept:
        label = entry.description.casefold()
        if label in _GENERIC_HEADERS and amounts.count(entry.amount) > 1:
            continue
        without_headers.append(entry)
    return without_headers


def _is_employer_cost(label: str) -> bool:
    if label in {"sdl", "uif", "employer uif", "uif employer"}:
        return True
    if "skills development" in label:
        return True
    return "employer" in label and "uif" in label


def _key(entry: FinancialEntry) -> tuple[str, Decimal]:
    return (entry.description.casefold(), money(entry.amount))


def _anchor_delta(data: PayslipExtraction) -> Decimal:
    calc = money(expected_net_pay(
        data.gross_salary,
        [entry.amount for entry in data.additional_income],
        data.paye,
        data.uif_employee_portion,
        [entry.amount for entry in data.other_deductions],
    ))
    return calc - money(data.net_pay)


def _anchor_ok(data: PayslipExtraction) -> bool:
    return abs(_anchor_delta(data)) <= _CENT


def _without_income_mirrored_in_deductions(data: PayslipExtraction) -> PayslipExtraction | None:
    deduction_keys = {_key(entry) for entry in data.other_deductions}
    kept = [entry for entry in data.additional_income if _key(entry) not in deduction_keys]
    if len(kept) == len(data.additional_income):
        return None
    return data.model_copy(update={"additional_income": kept})


def _drop_mirrored_income_when_anchor_holds(data: PayslipExtraction) -> PayslipExtraction:
    """Drop an additional-income row that repeats a deduction only when take-home still matches.

    A payslip can print the same claim in the earnings column and the deductions column.
    Those two rows cancel. Removing the earnings copy makes the printed net fail, so both stay.
    """
    collapsed = _without_income_mirrored_in_deductions(data)
    if collapsed is None:
        return data
    if _anchor_ok(collapsed):
        return collapsed
    return data


def _signature(data: PayslipExtraction) -> tuple:
    def rows(entries: list[FinancialEntry]) -> tuple:
        return tuple((entry.description, money(entry.amount)) for entry in entries)

    return (rows(data.additional_income), rows(data.other_deductions), rows(data.company_contributions))


def _unique_repair(data: PayslipExtraction) -> PayslipExtraction:
    candidates: list[PayslipExtraction] = []

    for index in range(len(data.additional_income)):
        candidates.append(data.model_copy(update={
            "additional_income": [entry for i, entry in enumerate(data.additional_income) if i != index],
        }))
    for index in range(len(data.other_deductions)):
        candidates.append(data.model_copy(update={
            "other_deductions": [entry for i, entry in enumerate(data.other_deductions) if i != index],
        }))
    for index, entry in enumerate(data.additional_income):
        candidates.append(data.model_copy(update={
            "additional_income": [item for i, item in enumerate(data.additional_income) if i != index],
            "other_deductions": [*data.other_deductions, entry],
        }))
    for index, entry in enumerate(data.other_deductions):
        candidates.append(data.model_copy(update={
            "other_deductions": [item for i, item in enumerate(data.other_deductions) if i != index],
            "additional_income": [*data.additional_income, entry],
        }))
    collapsed = _without_income_mirrored_in_deductions(data)
    if collapsed is not None:
        candidates.append(collapsed)

    repaired = [candidate for candidate in candidates if _anchor_ok(candidate)]
    signatures = {_signature(candidate) for candidate in repaired}
    if len(signatures) == 1:
        return repaired[0]
    return data
