"""BudgetHQ product types for Investments 2.0 accounts."""

from __future__ import annotations

PRODUCT_TYPES = ("ra", "tfsa", "offshore")

PRODUCT_TYPE_LABELS = {
    "ra": "Retirement annuity",
    "tfsa": "TFSA",
    "offshore": "Offshore",
}


def is_valid_product_type(value: str | None) -> bool:
    return value in PRODUCT_TYPES


def suggest_product_type(account_type_name: str | None, account_type_code: str | None) -> str | None:
    blob = f"{account_type_name or ''} {account_type_code or ''}".lower()
    if "tfsa" in blob or "tax free" in blob or "tax-free" in blob:
        return "tfsa"
    if "offshore" in blob:
        return "offshore"
    tokens = {t for t in blob.replace("/", " ").replace("-", " ").split() if t}
    if tokens & {"ra", "retann"} or "retirement annuity" in blob:
        return "ra"
    if "retirement" in blob:
        return "ra"
    return None


def remaining_ra_room(ra_max_deduction: float | None, contributions_current_fy: float) -> float | None:
    if ra_max_deduction is None:
        return None
    remaining = float(ra_max_deduction) - float(contributions_current_fy or 0)
    return round(max(remaining, 0.0), 2)
