"""Unit tests for the hidden transaction flag in shared query/summary services."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import models, transaction_mutations, transaction_query
from app.transaction_budget_summary import compute_actual_spending
from sqlalchemy.orm import Query


class _Txn:
    def __init__(self, amount=-100.0, category="groceries", txn_type="DEBIT", hidden=False, corrected=False):
        self.amount = amount
        self.category = category
        self.transaction_type = txn_type
        self.hidden = hidden
        self.user_corrected = corrected


def _real_query_db():
    """Mock db whose .query() returns a real SQLAlchemy Query so WHERE text stays compilable."""
    db = MagicMock()
    db.query.return_value = Query(models.BankTransaction, MagicMock())
    return db


def test_actual_spending_skips_hidden_rows():
    totals = compute_actual_spending([_Txn(), _Txn(hidden=True)])
    assert totals["groceries"] == 100.0


def test_query_builder_filters_hidden_by_default():
    q = transaction_query.build_transactions_query(_real_query_db(), 1)
    # compile the WHERE fragment of the enclosing filter chain and look for hidden
    from sqlalchemy.dialects import postgresql
    sql = str(q.statement.whereclause.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    ))
    assert "hidden" in sql


def test_query_builder_include_hidden_and_status():
    q = transaction_query.build_transactions_query(_real_query_db(), 1, include_hidden=True, status="PENDING")
    from sqlalchemy.dialects import postgresql
    sql = str(q.statement.whereclause.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    ))
    assert "PENDING" in sql
    assert "hidden" not in sql


def test_set_transaction_category_validates():
    db, txn = MagicMock(), MagicMock()
    txn.category, txn.user_corrected = None, False
    db.query.return_value.filter.return_value.first.return_value = txn
    out = transaction_mutations.set_transaction_category(db, 1, 5, "groceries")
    assert out.category == "groceries" and out.user_corrected is True
    db.commit.assert_called_once()

    try:
        transaction_mutations.set_transaction_category(db, 1, 5, "not-a-slug")
        assert False, "expected 400"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_set_transaction_hidden_roundtrip():
    db, txn = MagicMock(), MagicMock()
    txn.hidden = False
    db.query.return_value.filter.return_value.first.return_value = txn
    transaction_mutations.set_transaction_hidden(db, 1, 5, True)
    assert txn.hidden is True
    transaction_mutations.set_transaction_hidden(db, 1, 5, False)
    assert txn.hidden is False