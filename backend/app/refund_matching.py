"""Heuristic debit candidates to match a refund/reimbursement credit against."""
import difflib
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models
from .transaction_categories import OFFSET_CATEGORIES
from .transaction_links import (
    _linked_amount_by_credit_id,
    _linked_credit_amounts_by_debit_id,
    load_user_transaction_links,
)

EXACT_TOLERANCE = 0.01      # 1% of credit remaining counts as exact
NEAR_TOLERANCE = 0.10       # within 10% counts as near
WINDOW_DAYS = 90
SCORE_EXACT, SCORE_NEAR, SCORE_PARTIAL = 0.8, 0.6, 0.3


def _description_ratio(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, (a or "").lower(), (b or "").lower()).ratio()


def find_link_candidates(db: Session, user_id: int, credit_id: int) -> list[dict]:
    credit = (
        db.query(models.BankTransaction)
        .filter(models.BankTransaction.id == credit_id, models.BankTransaction.user_id == user_id)
        .first()
    )
    if not credit:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if credit.transaction_type != "CREDIT":
        raise HTTPException(status_code=400, detail="Only CREDIT transactions can be linked as offsets")
    if credit.category not in OFFSET_CATEGORIES:
        raise HTTPException(
            status_code=400, detail="Only refund or reimbursements credits can be linked to a debit"
        )

    links = load_user_transaction_links(db, user_id)
    linked_by_credit = _linked_amount_by_credit_id(links)
    linked_by_debit = _linked_credit_amounts_by_debit_id(links)

    credit_remaining = abs(credit.amount) - linked_by_credit.get(credit.id, 0.0)
    if credit_remaining <= 1e-9:
        return []

    window_start = credit.transaction_date - timedelta(days=WINDOW_DAYS)
    debits = (
        db.query(models.BankTransaction)
        .filter(
            models.BankTransaction.user_id == user_id,
            models.BankTransaction.transaction_type == "DEBIT",
            models.BankTransaction.hidden.isnot(True),
            models.BankTransaction.transaction_date.isnot(None),
            models.BankTransaction.transaction_date >= window_start,
            models.BankTransaction.transaction_date <= credit.transaction_date,
        )
        .all()
    )

    candidates = []
    for debit in debits:
        debit_remaining = abs(debit.amount) - linked_by_debit.get(debit.id, 0.0)
        if debit_remaining <= 1e-9:
            continue
        ratio = _description_ratio(credit.description, debit.description)
        relative_diff = abs(debit_remaining - credit_remaining) / max(credit_remaining, 1e-9)
        if relative_diff <= EXACT_TOLERANCE:
            base, reasons = SCORE_EXACT, ["amount_exact"]
        elif relative_diff <= NEAR_TOLERANCE:
            base, reasons = SCORE_NEAR, ["amount_near"]
        elif debit_remaining > credit_remaining:
            base, reasons = SCORE_PARTIAL, ["partial_amount"]
        else:
            # credit larger than the debit's remaining amount cannot fit
            continue
        days = (credit.transaction_date - debit.transaction_date).days
        reasons.append("within_14_days" if days <= 14 else "within_90_days")
        candidates.append(
            {
                "transaction": debit,
                "match_score": round(base + 0.2 * ratio, 3),
                "match_reasons": reasons,
                "debit_remaining": round(debit_remaining, 2),
            }
        )

    candidates.sort(key=lambda c: c["match_score"], reverse=True)
    return candidates
