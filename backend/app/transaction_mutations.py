"""Shared transaction mutation logic used by the UI router and the external API."""
from fastapi import HTTPException

from . import models
from .transaction_categories import is_valid_category


def _get_owned_transaction(db, user_id, transaction_id):
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


def set_transaction_category(db, user_id: int, transaction_id: int, category):
    """Set a user-corrected category. Empty string/None means unclassified."""
    txn = _get_owned_transaction(db, user_id, transaction_id)
    if category == "" or category is None:
        txn.category = None
    elif is_valid_category(category):
        txn.category = category
    else:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid category. Must be one of the valid BudgetHQ categories "
                "or empty for uncategorized"
            ),
        )
    txn.user_corrected = True
    db.commit()
    db.refresh(txn)
    return txn


def set_transaction_hidden(db, user_id: int, transaction_id: int, hidden: bool):
    txn = _get_owned_transaction(db, user_id, transaction_id)
    txn.hidden = bool(hidden)
    db.commit()
    db.refresh(txn)
    return txn
