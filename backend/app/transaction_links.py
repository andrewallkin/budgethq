"""Transaction link CRUD and effective-spend helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from . import models
from .transaction_categories import OFFSET_CATEGORIES


@dataclass
class LinkedTransactionSummary:
    link_id: int
    transaction_id: int
    description: str
    amount: float
    link_amount: float
    category: Optional[str]
    transaction_date: Optional[object]


def _linked_credit_amounts_by_debit_id(links: Iterable[models.TransactionLink]) -> Dict[int, float]:
    totals: Dict[int, float] = {}
    for link in links:
        totals[link.debit_transaction_id] = totals.get(link.debit_transaction_id, 0.0) + link.amount
    return totals


def _linked_amount_by_credit_id(links: Iterable[models.TransactionLink]) -> Dict[int, float]:
    totals: Dict[int, float] = {}
    for link in links:
        totals[link.credit_transaction_id] = totals.get(link.credit_transaction_id, 0.0) + link.amount
    return totals


def load_user_transaction_links(db: Session, user_id: int) -> List[models.TransactionLink]:
    return (
        db.query(models.TransactionLink)
        .options(
            joinedload(models.TransactionLink.debit_transaction),
            joinedload(models.TransactionLink.credit_transaction),
        )
        .filter(models.TransactionLink.user_id == user_id)
        .all()
    )


def get_links_for_transaction(db: Session, user_id: int, transaction_id: int) -> List[models.TransactionLink]:
    return (
        db.query(models.TransactionLink)
        .options(
            joinedload(models.TransactionLink.debit_transaction),
            joinedload(models.TransactionLink.credit_transaction),
        )
        .filter(
            models.TransactionLink.user_id == user_id,
            (
                (models.TransactionLink.debit_transaction_id == transaction_id)
                | (models.TransactionLink.credit_transaction_id == transaction_id)
            ),
        )
        .all()
    )


def linked_credit_totals_by_debit_category(
    transactions: Iterable,
    links: Iterable[models.TransactionLink],
) -> Dict[str, float]:
    """Sum linked offset amounts keyed by the linked debit's expense category."""
    debit_by_id = {txn.id: txn for txn in transactions if txn.transaction_type == "DEBIT"}
    totals: Dict[str, float] = {}
    for link in links:
        debit = debit_by_id.get(link.debit_transaction_id)
        if not debit or not debit.category:
            continue
        totals[debit.category] = totals.get(debit.category, 0.0) + link.amount
    return totals


def compute_offset_totals(
    transactions: Iterable,
    links: Iterable[models.TransactionLink],
) -> tuple[float, float, float, float]:
    """
    Return (unlinked_refund_total, unlinked_reimbursement_total, linked_offset_total, reimbursements_total).

    reimbursements_total is all reimbursement credits regardless of link status (for footnotes).
    """
    allocated_by_credit = _linked_amount_by_credit_id(links)
    linked_offset_total = sum(link.amount for link in links)

    unlinked_refund_total = 0.0
    unlinked_reimbursement_total = 0.0
    reimbursements_total = 0.0

    for txn in transactions:
        if txn.transaction_type != "CREDIT" or txn.category not in OFFSET_CATEGORIES:
            continue
        amount = abs(txn.amount)
        if txn.category == "reimbursements":
            reimbursements_total += amount
        unallocated = amount - allocated_by_credit.get(txn.id, 0.0)
        if unallocated <= 1e-9:
            continue
        if txn.category == "refund":
            unlinked_refund_total += unallocated
        elif txn.category == "reimbursements":
            unlinked_reimbursement_total += unallocated

    return unlinked_refund_total, unlinked_reimbursement_total, linked_offset_total, reimbursements_total


def apply_linked_offsets_to_spending(
    spending: Dict[str, float],
    transactions: Iterable,
    links: Iterable[models.TransactionLink],
) -> Dict[str, float]:
    """Subtract linked credit amounts from the linked debit's expense category."""
    category_offsets = linked_credit_totals_by_debit_category(transactions, links)
    adjusted = dict(spending)
    for category, offset in category_offsets.items():
        if category in adjusted:
            adjusted[category] = max(0.0, adjusted[category] - offset)
    return adjusted


def effective_debit_amount(debit: models.BankTransaction, links: List[models.TransactionLink]) -> float:
    linked_total = sum(link.amount for link in links)
    return max(0.0, abs(debit.amount) - linked_total)


def resolve_link_amount(
    credit_amount: float,
    debit_amount: float,
    credit_already_linked: float = 0.0,
    debit_already_linked: float = 0.0,
    requested: Optional[float] = None,
) -> float:
    """Amount to link. Defaults to whatever still fits on both sides."""
    credit_remaining = abs(credit_amount) - credit_already_linked
    debit_remaining = abs(debit_amount) - debit_already_linked
    link_amount = min(credit_remaining, debit_remaining) if requested is None else abs(requested)
    if link_amount <= 1e-9:
        raise HTTPException(status_code=400, detail="Link amount must be greater than zero")
    if link_amount > credit_remaining + 1e-9:
        raise HTTPException(
            status_code=400,
            detail="Link amount cannot exceed the unallocated credit amount",
        )
    if link_amount > debit_remaining + 1e-9:
        raise HTTPException(status_code=400, detail="Total linked amount cannot exceed the debit amount")
    return link_amount


def _validate_offset_credit(credit: models.BankTransaction) -> None:
    if credit.transaction_type != "CREDIT":
        raise HTTPException(status_code=400, detail="Linked transaction must be a CREDIT")
    if credit.category not in OFFSET_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail="Only refund or reimbursements credits can be linked to a debit",
        )


def _validate_debit(debit: models.BankTransaction) -> None:
    if debit.transaction_type != "DEBIT":
        raise HTTPException(status_code=400, detail="Target transaction must be a DEBIT")


def _get_owned_transaction(db: Session, user_id: int, transaction_id: int) -> models.BankTransaction:
    txn = (
        db.query(models.BankTransaction)
        .filter(
            models.BankTransaction.id == transaction_id,
            models.BankTransaction.user_id == user_id,
        )
        .first()
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


def create_transaction_link(
    db: Session,
    user_id: int,
    debit_transaction_id: int,
    credit_transaction_id: int,
    amount: Optional[float] = None,
) -> models.TransactionLink:
    debit = _get_owned_transaction(db, user_id, debit_transaction_id)
    credit = _get_owned_transaction(db, user_id, credit_transaction_id)
    _validate_debit(debit)
    _validate_offset_credit(credit)

    existing_credit_links = (
        db.query(models.TransactionLink)
        .filter(models.TransactionLink.credit_transaction_id == credit_transaction_id)
        .all()
    )
    if any(link.debit_transaction_id == debit_transaction_id for link in existing_credit_links):
        raise HTTPException(status_code=400, detail="This credit is already linked to this debit")

    existing_debit_total = (
        db.query(models.TransactionLink)
        .filter(models.TransactionLink.debit_transaction_id == debit_transaction_id)
        .with_entities(models.TransactionLink.amount)
        .all()
    )
    link_amount = resolve_link_amount(
        credit_amount=credit.amount,
        debit_amount=debit.amount,
        credit_already_linked=sum(link.amount for link in existing_credit_links),
        debit_already_linked=sum(row[0] for row in existing_debit_total),
        requested=amount,
    )

    link = models.TransactionLink(
        user_id=user_id,
        debit_transaction_id=debit_transaction_id,
        credit_transaction_id=credit_transaction_id,
        amount=link_amount,
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request linked this credit to the same debit first.
        db.rollback()
        raise HTTPException(status_code=400, detail="This credit is already linked to this debit")
    db.refresh(link)
    return link


def delete_transaction_link(db: Session, user_id: int, link_id: int) -> None:
    link = (
        db.query(models.TransactionLink)
        .filter(models.TransactionLink.id == link_id, models.TransactionLink.user_id == user_id)
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Transaction link not found")
    db.delete(link)
    db.commit()


def summarize_linked_transaction(link: models.TransactionLink, role: str) -> LinkedTransactionSummary:
    if role == "credit":
        txn = link.credit_transaction
    else:
        txn = link.debit_transaction
    return LinkedTransactionSummary(
        link_id=link.id,
        transaction_id=txn.id,
        description=txn.description,
        amount=txn.amount,
        link_amount=link.amount,
        category=txn.category,
        transaction_date=txn.transaction_date,
    )
