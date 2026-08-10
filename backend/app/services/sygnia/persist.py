"""Persist Sygnia scrape results to the database."""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy.orm import Session

from ...models import (
    SygniaAccount,
    SygniaBeneficiary,
    SygniaDebitOrder,
    SygniaDebitOrderAllocation,
    SygniaHolding,
    SygniaRetirementComponent,
    SygniaValueHistory,
)

from .extract import parse_zar_amount

logger = logging.getLogger(__name__)


def persist_scrape(db: Session, account: SygniaAccount, scrape_result: dict, source: str) -> None:
    """Upsert account metadata, current-state children, and value history from a scrape."""
    summary = scrape_result.get("summary") or {}
    account_meta = scrape_result.get("account_meta") or {}
    as_of_date = _parse_record_date(scrape_result.get("as_of_date"))

    _apply_account_metadata(account, account_meta, summary, as_of_date)
    _sync_holdings(db, account, summary)
    _sync_retirement_components(db, account, summary)
    _sync_beneficiaries(db, account, summary)
    _sync_debit_order(db, account, summary)
    _upsert_value_history(db, account, as_of_date, summary, source)


def _parse_record_date(value: str | date | None) -> date:
    if isinstance(value, date):
        return value
    if isinstance(value, str) and value:
        return date.fromisoformat(value)
    raise ValueError("scrape_result.as_of_date is required for persistence")


def _coerce_float(value) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        parsed = parse_zar_amount(value)
        if parsed is not None:
            return parsed
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


def _coerce_bool(value) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes"):
            return True
        if lowered in ("false", "0", "no"):
            return False
    return bool(value)


def _apply_account_metadata(
    account: SygniaAccount,
    account_meta: dict,
    summary: dict,
    as_of_date: date,
) -> None:
    if "accountTypeName" in account_meta:
        account.account_type_name = account_meta.get("accountTypeName")
    if "accountTypeCode" in account_meta:
        account.account_type_code = account_meta.get("accountTypeCode")
    if "foreignAllocation" in account_meta:
        account.foreign_allocation = _coerce_float(account_meta.get("foreignAllocation"))
    if "reg28Compliant" in account_meta:
        account.reg28_compliant = _coerce_bool(account_meta.get("reg28Compliant"))

    inv = summary.get("investment_summary") or {}
    account.holdings_total_market_value = inv.get("total_market_value") or None
    account.holdings_total_percentage = inv.get("total_percentage") or None

    retirement = summary.get("retirement_fund_components") or {}
    account.retirement_account_market_value = retirement.get("account_market_value") or None

    account.as_of_date = as_of_date


def _normalize_holdings(summary: dict) -> list[dict[str, str | None]]:
    inv = summary.get("investment_summary") or {}
    rows = inv.get("rows") or []
    normalized = []
    for row in rows:
        normalized.append(
            {
                "investment_code": row.get("investment_code") or "",
                "investment_name": row.get("investment_name") or "",
                "units": row.get("units") or None,
                "unit_price": row.get("unit_price") or None,
                "market_value": row.get("market_value") or None,
                "percentage": row.get("percentage") or None,
            }
        )
    return sorted(normalized, key=lambda r: (r["investment_code"], r["investment_name"]))


def _existing_holdings(account: SygniaAccount) -> list[dict[str, str | None]]:
    rows = []
    for holding in account.holdings:
        rows.append(
            {
                "investment_code": holding.investment_code,
                "investment_name": holding.investment_name,
                "units": holding.units,
                "unit_price": holding.unit_price,
                "market_value": holding.market_value,
                "percentage": holding.percentage,
            }
        )
    return sorted(rows, key=lambda r: (r["investment_code"], r["investment_name"]))


def _sync_holdings(db: Session, account: SygniaAccount, summary: dict) -> None:
    scraped = _normalize_holdings(summary)
    if scraped == _existing_holdings(account):
        return

    account.holdings.clear()
    for row in scraped:
        db.add(
            SygniaHolding(
                account_id=account.id,
                investment_code=row["investment_code"],
                investment_name=row["investment_name"],
                units=row["units"],
                unit_price=row["unit_price"],
                market_value=row["market_value"],
                percentage=row["percentage"],
            )
        )


def _benefit_lines_text(lines: list[str] | str | None) -> str | None:
    if not lines:
        return None
    if isinstance(lines, str):
        return lines or None
    joined = "\n".join(line for line in lines if line)
    return joined or None


def _normalize_retirement_components(summary: dict) -> list[dict[str, str | None]]:
    retirement = summary.get("retirement_fund_components") or {}
    components = retirement.get("components") or []
    normalized = []
    for row in components:
        normalized.append(
            {
                "component": row.get("component") or "",
                "market_value": row.get("market_value") or None,
                "benefit_lines": _benefit_lines_text(row.get("benefit_lines")),
            }
        )
    return sorted(normalized, key=lambda r: r["component"])


def _existing_retirement_components(account: SygniaAccount) -> list[dict[str, str | None]]:
    rows = []
    for component in account.retirement_components:
        rows.append(
            {
                "component": component.component,
                "market_value": component.market_value,
                "benefit_lines": component.benefit_lines,
            }
        )
    return sorted(rows, key=lambda r: r["component"])


def _sync_retirement_components(db: Session, account: SygniaAccount, summary: dict) -> None:
    scraped = _normalize_retirement_components(summary)
    if scraped == _existing_retirement_components(account):
        return

    account.retirement_components.clear()
    for row in scraped:
        db.add(
            SygniaRetirementComponent(
                account_id=account.id,
                component=row["component"],
                market_value=row["market_value"],
                benefit_lines=row["benefit_lines"],
            )
        )


def _normalize_beneficiaries(summary: dict) -> list[dict[str, str | None]]:
    rows = summary.get("beneficiaries") or []
    normalized = []
    for row in rows:
        normalized.append(
            {
                "name": row.get("name") or "",
                "relationship": row.get("relationship") or None,
                "allocation": row.get("allocation") or None,
            }
        )
    return sorted(normalized, key=lambda r: (r["name"], r["relationship"] or ""))


def _existing_beneficiaries(account: SygniaAccount) -> list[dict[str, str | None]]:
    rows = []
    for beneficiary in account.beneficiaries:
        rows.append(
            {
                "name": beneficiary.name,
                "relationship": beneficiary.beneficiary_relationship,
                "allocation": beneficiary.allocation,
            }
        )
    return sorted(rows, key=lambda r: (r["name"], r["relationship"] or ""))


def _sync_beneficiaries(db: Session, account: SygniaAccount, summary: dict) -> None:
    scraped = _normalize_beneficiaries(summary)
    if scraped == _existing_beneficiaries(account):
        return

    account.beneficiaries.clear()
    for row in scraped:
        db.add(
            SygniaBeneficiary(
                account_id=account.id,
                name=row["name"],
                beneficiary_relationship=row["relationship"],
                allocation=row["allocation"],
            )
        )


def _normalize_debit_order(summary: dict) -> dict:
    debit = summary.get("debit_order") or {}
    details = debit.get("details") or {}
    allocations = debit.get("allocations") or []
    normalized_allocations = []
    for row in allocations:
        normalized_allocations.append(
            {
                "investment_code": row.get("investment_code") or None,
                "investment_name": row.get("investment_name") or None,
                "allocation": row.get("allocation") or None,
            }
        )
    normalized_allocations.sort(
        key=lambda r: (r["investment_code"] or "", r["investment_name"] or "")
    )
    return {
        "details": {
            "debit_order_amount": details.get("debit_order_amount") or None,
            "escalation_rate": details.get("escalation_rate") or None,
            "escalation_month": details.get("escalation_month") or None,
            "day_of_month": details.get("day_of_month") or None,
            "effective_date": details.get("effective_date") or None,
            "linked_bank": details.get("linked_bank") or None,
        },
        "allocations": normalized_allocations,
    }


def _existing_debit_order(account: SygniaAccount) -> dict | None:
    debit = account.debit_order
    if debit is None:
        return None

    allocations = []
    for row in debit.allocations:
        allocations.append(
            {
                "investment_code": row.investment_code,
                "investment_name": row.investment_name,
                "allocation": row.allocation,
            }
        )
    allocations.sort(key=lambda r: (r["investment_code"] or "", r["investment_name"] or ""))
    return {
        "details": {
            "debit_order_amount": debit.debit_order_amount,
            "escalation_rate": debit.escalation_rate,
            "escalation_month": debit.escalation_month,
            "day_of_month": debit.day_of_month,
            "effective_date": debit.effective_date,
            "linked_bank": debit.linked_bank,
        },
        "allocations": allocations,
    }


def _debit_order_is_empty(payload: dict) -> bool:
    details = payload.get("details") or {}
    details_empty = not any(details.values())
    allocations_empty = not payload.get("allocations")
    return details_empty and allocations_empty


def _sync_debit_order(db: Session, account: SygniaAccount, summary: dict) -> None:
    scraped = _normalize_debit_order(summary)
    existing = _existing_debit_order(account)

    if scraped == existing:
        return

    if _debit_order_is_empty(scraped):
        if account.debit_order is not None:
            db.delete(account.debit_order)
        return

    details = scraped["details"]
    if account.debit_order is None:
        debit = SygniaDebitOrder(
            account_id=account.id,
            debit_order_amount=details.get("debit_order_amount"),
            escalation_rate=details.get("escalation_rate"),
            escalation_month=details.get("escalation_month"),
            day_of_month=details.get("day_of_month"),
            effective_date=details.get("effective_date"),
            linked_bank=details.get("linked_bank"),
        )
        db.add(debit)
        db.flush()
        account.debit_order = debit
    else:
        debit = account.debit_order
        debit.debit_order_amount = details.get("debit_order_amount")
        debit.escalation_rate = details.get("escalation_rate")
        debit.escalation_month = details.get("escalation_month")
        debit.day_of_month = details.get("day_of_month")
        debit.effective_date = details.get("effective_date")
        debit.linked_bank = details.get("linked_bank")
        debit.allocations.clear()
    for row in scraped["allocations"]:
        db.add(
            SygniaDebitOrderAllocation(
                debit_order_id=debit.id,
                investment_code=row["investment_code"],
                investment_name=row["investment_name"],
                allocation=row["allocation"],
            )
        )


def _portfolio_value_from_summary(summary: dict) -> float:
    parsed = summary.get("portfolio_value")
    if parsed is not None:
        return float(parsed)

    inv = summary.get("investment_summary") or {}
    total_text = inv.get("total_market_value") or ""
    from_total = parse_zar_amount(total_text)
    if from_total is not None:
        return from_total

    raise ValueError(
        f"Could not parse portfolio value from summary total={total_text!r}; "
        "refusing to write 0.0 to value history."
    )


def _upsert_value_history(
    db: Session,
    account: SygniaAccount,
    record_date: date,
    summary: dict,
    source: str,
) -> None:
    portfolio_value = _portfolio_value_from_summary(summary)
    existing = (
        db.query(SygniaValueHistory)
        .filter(
            SygniaValueHistory.account_id == account.id,
            SygniaValueHistory.record_date == record_date,
        )
        .first()
    )
    if existing:
        existing.portfolio_value = portfolio_value
        existing.source = source
        return

    db.add(
        SygniaValueHistory(
            account_id=account.id,
            record_date=record_date,
            portfolio_value=portfolio_value,
            source=source,
        )
    )
