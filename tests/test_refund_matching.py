"""Heuristic debit candidates for refund/reimbursement credit linking."""
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import refund_matching


class _Txn:
    def __init__(self, id, description, amount, txn_type="DEBIT", category=None,
                 txn_date=datetime(2026, 10, 16), hidden=False):
        self.id, self.description, self.amount = id, description, amount
        self.transaction_type, self.category = txn_type, category
        self.transaction_date = txn_date
        self.hidden = hidden


def _credit(amount=492.90, category="reimbursements", description="Discovery Health Payment",
            txn_date=datetime(2026, 10, 16)):
    return _Txn(9, description, amount, txn_type="CREDIT", category=category, txn_date=txn_date)


def _link(debit_transaction_id, credit_transaction_id, amount):
    link = MagicMock()
    link.debit_transaction_id = debit_transaction_id
    link.credit_transaction_id = credit_transaction_id
    link.amount = amount
    link.debit_transaction = MagicMock()
    link.credit_transaction = MagicMock()
    return link


def test_partial_reimbursement_discovery_case():
    credit = _credit(amount=492.90, category="reimbursements")
    debit = _Txn(5, "R655.00 POS Biokineticist Sandton", -655.00)
    db = MagicMock()
    link_q = MagicMock()
    link_q.options.return_value.filter.return_value.all.return_value = []

    def bt_query():
        q = MagicMock()
        q.filter.return_value.first.return_value = credit
        q.filter.return_value.all.return_value = [debit]
        return q

    db.query.side_effect = lambda m: (bt_query() if m.__name__ == "BankTransaction" else link_q)

    candidates = refund_matching.find_link_candidates(db, 1, 9)

    partial = [c for c in candidates if c["transaction"].id == 5]
    assert partial, "R655/R492.90 must be a candidate"
    assert "partial_amount" in partial[0]["match_reasons"]
    scores = [c["match_score"] for c in candidates]
    assert scores == sorted(scores, reverse=True)


def test_exact_beats_partial():
    credit = _credit(amount=492.90, category="refund", description="REFUND")
    exact_debit = _Txn(1, "REFUND", -492.90)
    partial_debit = _Txn(2, "REFUND", -655.00)
    db = MagicMock()
    link_q = MagicMock()
    link_q.options.return_value.filter.return_value.all.return_value = []

    def bt_query():
        q = MagicMock()
        q.filter.return_value.first.return_value = credit
        q.filter.return_value.all.return_value = [exact_debit, partial_debit]
        return q

    db.query.side_effect = lambda m: (bt_query() if m.__name__ == "BankTransaction" else link_q)

    candidates = refund_matching.find_link_candidates(db, 1, 9)
    assert candidates[0]["transaction"].id == 1
    assert "amount_exact" in candidates[0]["match_reasons"]
    partial_row = next(c for c in candidates if c["transaction"].id == 2)
    assert partial_row["match_reasons"][0] == "partial_amount"
    assert partial_row["match_score"] < candidates[0]["match_score"]


def test_saturated_and_hidden_and_window_excluded():
    credit = _credit(amount=492.90, category="refund", txn_date=datetime(2026, 10, 17))
    saturated = _Txn(1, "REFUND", -100.00)   # link below gives debit 1 debit_remaining of 0
    old_debit = _Txn(2, "REFUND", -100.00, txn_date=datetime(2026, 6, 1))  # SQL: > 90 days before credit; loop: 100 < credit_remaining → skipped
    hidden_debit = _Txn(3, "REFUND", -100.00, hidden=True)  # SQL: hidden; loop: 100 < credit_remaining → skipped
    eligible = _Txn(4, "REFUND", -392.90)
    links = [_link(debit_transaction_id=1, credit_transaction_id=9, amount=100.00)]
    db = MagicMock()
    link_q = MagicMock()
    link_q.options.return_value.filter.return_value.all.return_value = links

    def bt_query():
        q = MagicMock()
        q.filter.return_value.first.return_value = credit
        q.filter.return_value.all.return_value = [saturated, old_debit, hidden_debit, eligible]
        return q

    db.query.side_effect = lambda m: (bt_query() if m.__name__ == "BankTransaction" else link_q)

    candidates = refund_matching.find_link_candidates(db, 1, 9)
    ids = [c["transaction"].id for c in candidates]
    assert 2 not in ids
    assert 3 not in ids
    assert 1 not in ids  # saturated debit: debit_remaining = 0
    assert 4 in ids      # eligible debit: |392.90 - 392.90| / 392.90 = 0 → exact tier
    assert "amount_exact" in next(c for c in candidates if c["transaction"].id == 4)["match_reasons"]


def test_non_offset_credit_rejected():
    db = MagicMock()
    link_q = MagicMock()

    def bt_query():
        q = MagicMock()
        q.filter.return_value.first.return_value = _Txn(9, "salary", 500, txn_type="CREDIT", category="salary")
        q.filter.return_value.all.return_value = []
        return q

    db.query.side_effect = lambda m: (bt_query() if m.__name__ == "BankTransaction" else link_q)
    with pytest.raises(HTTPException) as exc:
        refund_matching.find_link_candidates(db, 1, 9)
    assert exc.value.status_code == 400


def test_credit_with_null_txn_date_returns_empty():
    db = MagicMock()
    link_q = MagicMock()
    link_q.options.return_value.filter.return_value.all.return_value = []

    credit = _Txn(9, "REFUND", 492.90, txn_type="CREDIT", category="refund", txn_date=None)

    def bt_query():
        q = MagicMock()
        q.filter.return_value.first.return_value = credit
        q.filter.return_value.all.return_value = []
        return q

    db.query.side_effect = lambda m: (bt_query() if m.__name__ == "BankTransaction" else link_q)

    assert refund_matching.find_link_candidates(db, 1, 9) == []
