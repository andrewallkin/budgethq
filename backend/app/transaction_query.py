"""Shared query helpers for bank transaction listing and export."""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from . import models


def build_transactions_query(
    db: Session,
    user_id: int,
    *,
    account_id: Optional[int] = None,
    account_ids: Optional[List[int]] = None,
    category: Optional[List[str]] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    transaction_type: Optional[str] = None,
    include_transfers: bool = True,
) -> Query:
    """Build a filtered BankTransaction query scoped to the user."""
    query = db.query(models.BankTransaction).filter(models.BankTransaction.user_id == user_id)

    if account_ids:
        query = query.filter(models.BankTransaction.account_id.in_(account_ids))
    elif account_id:
        query = query.filter(models.BankTransaction.account_id == account_id)

    if category:
        if "uncategorized" in category:
            cat_values = [c for c in category if c != "uncategorized"]
            if cat_values:
                query = query.filter(
                    or_(
                        models.BankTransaction.category.in_(cat_values),
                        models.BankTransaction.category.is_(None),
                    )
                )
            else:
                query = query.filter(models.BankTransaction.category.is_(None))
        else:
            query = query.filter(models.BankTransaction.category.in_(category))

    if from_date:
        query = query.filter(models.BankTransaction.transaction_date >= from_date)

    if to_date:
        query = query.filter(models.BankTransaction.transaction_date <= to_date)

    if search:
        query = query.filter(models.BankTransaction.description.ilike(f"%{search}%"))

    if transaction_type:
        query = query.filter(models.BankTransaction.transaction_type == transaction_type)

    if not include_transfers:
        query = query.filter(
            or_(
                models.BankTransaction.category.is_(None),
                models.BankTransaction.category != "transfers",
            )
        )

    return query.order_by(models.BankTransaction.transaction_date.desc())


def parse_date_param(value: str, field_name: str) -> datetime:
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"Invalid {field_name}: expected YYYY-MM-DD") from exc


def get_user_accounts_for_export(
    db: Session,
    user_id: int,
    account_ids: List[int],
) -> List[models.InvestecAccount]:
    """Return active accounts owned by the user matching the given IDs."""
    unique_ids = list(dict.fromkeys(account_ids))
    accounts = (
        db.query(models.InvestecAccount)
        .filter(
            models.InvestecAccount.user_id == user_id,
            models.InvestecAccount.id.in_(unique_ids),
            models.InvestecAccount.is_active.is_(True),
        )
        .all()
    )
    if len(accounts) != len(unique_ids):
        return []
    return sorted(accounts, key=lambda a: a.id)


def account_display_name(account: models.InvestecAccount) -> str:
    return account.reference_name or account.account_name
