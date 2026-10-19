"""Serialization and list-building for external (bot) transaction endpoints."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models
from .transaction_links import (
    effective_debit_amount,
    get_links_for_transaction,
)
from .transaction_query import account_display_name, build_transactions_query


def _link_summary(link: models.TransactionLink, role: str) -> dict:
    other = link.credit_transaction if role == "credit" else link.debit_transaction
    return {
        "transaction_id": link.credit_transaction_id if role == "credit" else link.debit_transaction_id,
        "description": (other.description if other else "") or "",
        "amount": link.amount,
    }


def transaction_payload(txn: models.BankTransaction, links=None) -> dict:
    links = links if links is not None else []
    account = getattr(txn, "account", None)
    account_name = (account_display_name(account) or "") if account is not None else ""
    linked_credits = [
        _link_summary(link, "credit") for link in links if link.debit_transaction_id == txn.id
    ]
    linked_debits = [
        _link_summary(link, "debit") for link in links if link.credit_transaction_id == txn.id
    ]
    effective = (
        effective_debit_amount(txn, [link for link in links if link.debit_transaction_id == txn.id])
        if txn.transaction_type == "DEBIT"
        else abs(txn.amount)
    )
    return {
        "id": txn.id,
        "investec_uuid": txn.investec_uuid,
        "account_id": txn.account_id,
        "account_name": account_name,
        "transaction_type": txn.transaction_type,
        "amount": txn.amount,
        "effective_amount": round(effective, 2),
        "transaction_category": txn.transaction_category,
        "status": txn.status,
        "category": txn.category,
        "ai_category_confidence": txn.ai_category_confidence,
        "user_corrected": bool(txn.user_corrected),
        "hidden": bool(txn.hidden),
        "description": txn.description,
        "transaction_date": txn.transaction_date.isoformat() if txn.transaction_date else None,
        "has_links": bool(links),
        "linked_credits": linked_credits,
        "linked_debits": linked_debits,
    }


def list_transactions(
    db: Session,
    user_id: int,
    *,
    from_date=None,
    to_date=None,
    category=None,
    transaction_type=None,
    status=None,
    search=None,
    account_ids=None,
    include_transfers=False,
    include_hidden=False,
    limit=100,
    offset=0,
) -> dict:
    query = build_transactions_query(
        db,
        user_id,
        account_ids=account_ids,
        category=category,
        from_date=from_date,
        to_date=to_date,
        search=search,
        transaction_type=transaction_type,
        include_transfers=include_transfers,
        include_hidden=include_hidden,
        status=status,
    )
    total = query.count()
    transactions = query.limit(limit).offset(offset).all()
    rows = []
    for txn in transactions:
        links = get_links_for_transaction(db, user_id, txn.id)
        rows.append(transaction_payload(txn, links))
    return {"transactions": rows, "count": total}


def get_transaction(db: Session, user_id: int, transaction_id: int) -> dict:
    txn = (
        db.query(models.BankTransaction)
        .filter(models.BankTransaction.id == transaction_id, models.BankTransaction.user_id == user_id)
        .first()
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction_payload(txn, get_links_for_transaction(db, user_id, txn.id))
