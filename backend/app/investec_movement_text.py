"""Telegram MarkdownV2 bubble text for Investec movement approval."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Mapping, Optional

_MD_V2_SPECIAL = set(r"_*[]()~`>#+-=|{}.!")

KIND_LABEL = {"transfer": "Transfer", "payment": "Payment"}


def _escape_md_v2(text: str) -> str:
    return "".join(f"\\{ch}" if ch in _MD_V2_SPECIAL else ch for ch in text)


def _bold(label: str) -> str:
    return f"*{_escape_md_v2(label)}*"


def normalize_amount(value: str) -> str:
    if value is None or not str(value).strip():
        raise ValueError("blank amount")
    raw = str(value).strip()
    try:
        amount = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError("non-numeric amount") from exc
    if amount <= 0:
        raise ValueError("zero or negative amount")
    return f"{amount:.2f}"


def _format_rands_integer(integer_part: str) -> str:
    if len(integer_part) <= 3:
        return integer_part
    parts: list[str] = []
    while len(integer_part) > 3:
        parts.insert(0, integer_part[-3:])
        integer_part = integer_part[:-3]
    parts.insert(0, integer_part)
    return " ".join(parts)


def format_rand(amount: str) -> str:
    """Format a normalised amount string like ``1500.00`` as ``R1 500.00``."""
    if "." in amount:
        integer_part, decimal_part = amount.split(".", 1)
    else:
        integer_part, decimal_part = amount, "00"
    decimal_part = (decimal_part + "00")[:2]
    return f"R{_format_rands_integer(integer_part)}.{decimal_part}"


def format_balance(value: float) -> str:
    sign = "-" if value < 0 else ""
    amount = f"{abs(value):.2f}"
    return f"{sign}{format_rand(amount)}"


def _header(kind: str, state: str) -> str:
    label = KIND_LABEL[kind]
    headers = {
        "pending": f"💸 Pending {kind}",
        "approved": f"✅ {label} approved",
        "sent": f"✅ {label} sent",
        "needs_authorisation": f"⏳ {label} waiting on Investec",
        "failed": f"❌ {label} failed",
        "failed_unconfirmed": f"❌ {label} failed",
        "rejected": f"❌ {label} rejected",
        "expired": f"⏱ {label} expired",
    }
    return headers[state]


def _footer(state: str) -> Optional[str]:
    footers = {
        "needs_authorisation": (
            "Investec accepted the request and still requires its own authorisation."
        ),
        "failed": "Investec did not accept this. Nothing was sent.",
        "failed_unconfirmed": (
            "Investec did not confirm this. Nothing further will be sent."
        ),
        "rejected": "Nothing was sent.",
        "expired": "Nothing was sent.",
        "sent": None,
    }
    if state == "sent":
        return None
    return footers.get(state)


def _snapshot_lines(
    kind: str,
    snapshot: Mapping[str, Any],
    *,
    balances: Optional[Mapping[str, float]] = None,
) -> list[str]:
    lines: list[str] = []

    lines.append(_bold("From"))
    lines.append(_escape_md_v2(str(snapshot.get("from_name", ""))))
    lines.append(_escape_md_v2(str(snapshot.get("from_product", ""))))
    if balances is not None:
        lines.append(_bold("Actual"))
        lines.append(_escape_md_v2(format_balance(float(balances["from_current"]))))
        lines.append(_bold("Available"))
        lines.append(_escape_md_v2(format_balance(float(balances["from_available"]))))
    lines.append("")

    lines.append(_bold("To"))
    if kind == "payment":
        beneficiary = snapshot.get("to_beneficiary_name") or snapshot.get("to_name", "")
        lines.append(_escape_md_v2(str(beneficiary)))
        bank = (snapshot.get("to_bank") or "").strip()
        if bank:
            lines.append(_escape_md_v2(bank))
        account = (snapshot.get("to_account_number") or "").strip()
        if account:
            lines.append(_escape_md_v2(account))
    else:
        lines.append(_escape_md_v2(str(snapshot.get("to_name", ""))))
        lines.append(_escape_md_v2(str(snapshot.get("to_product", ""))))
        if balances is not None and kind == "transfer":
            lines.append(_bold("Actual"))
            lines.append(_escape_md_v2(format_balance(float(balances["to_current"]))))
            lines.append(_bold("Available"))
            lines.append(_escape_md_v2(format_balance(float(balances["to_available"]))))
    lines.append("")

    amount = snapshot.get("amount", "0")
    try:
        display_amount = format_rand(normalize_amount(str(amount)))
    except ValueError:
        display_amount = format_rand(str(amount))
    lines.append(f"💰 {_bold('Amount')}")
    lines.append(_escape_md_v2(display_amount))
    lines.append("")

    lines.append(f"📝 {_bold('Your reference')}")
    lines.append(_escape_md_v2(str(snapshot.get("my_reference", ""))))
    lines.append("")

    lines.append(f"📝 {_bold('Their reference')}")
    lines.append(_escape_md_v2(str(snapshot.get("their_reference", ""))))

    return lines


def render_bubble(
    kind: str,
    state: str,
    snapshot: Mapping[str, Any],
    balances: Optional[Mapping[str, float]] = None,
    investec_reference: Optional[str] = None,
) -> str:
    parts: list[str] = [_header(kind, state), ""]

    use_balances = balances if state == "sent" and balances is not None else None
    parts.extend(_snapshot_lines(kind, snapshot, balances=use_balances))

    if state == "sent":
        parts.append("")
        if balances is None:
            parts.append(_escape_md_v2("Balance unavailable."))
        if investec_reference:
            parts.append("")
            parts.append(f"🔖 {_bold('Investec reference')}")
            parts.append(_escape_md_v2(investec_reference))

    footer = _footer(state)
    if footer:
        parts.append("")
        parts.append(_escape_md_v2(footer))

    return "\n".join(parts)