import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import rule_application


class _Txn:
    def __init__(self, id, description, category=None, txn_type="DEBIT", corrected=False, hidden=False,
                 amount=-100.0):
        self.id, self.description = id, description
        self.category, self.user_corrected = category, corrected
        self.transaction_type = txn_type
        self.hidden = hidden
        self.amount = amount


class _Rule:
    def __init__(self, id, pattern, category, transaction_type=None, is_active=True):
        self.id, self.pattern, self.category = id, pattern, category
        self.transaction_type, self.is_active = transaction_type, is_active
        self.usage_count = 0


def test_requires_scope():
    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        rule_application.apply_rules_to_history(db, 1)
    assert exc.value.status_code == 400


def test_dry_run_reports_without_writing():
    rule = _Rule(1, r"REFUND", "refund", transaction_type="CREDIT")
    txn = _Txn(11, "DISC REFUND", txn_type="CREDIT")
    corrected = _Txn(12, "REFUND thing", txn_type="CREDIT", corrected=True)
    debit = _Txn(13, "REFUND fee", txn_type="DEBIT")
    db = MagicMock()

    txn_query = MagicMock()
    txn_query.filter.return_value.all.return_value = [txn, corrected, debit]
    txn_query.filter.return_value.first.return_value = None
    rule_query = MagicMock()
    rule_query.filter.return_value.all.return_value = [rule]
    rule_query.filter.return_value.first.return_value = rule
    db.query.side_effect = lambda m: txn_query if m.__name__ == "BankTransaction" else rule_query

    result = rule_application.apply_rules_to_history(db, 1, from_date="2026-10-14", to_date="2026-10-17", dry_run=True)

    assert result["matched"] == 1
    assert result["changed"] == 0
    assert result["changes"] == [
        {"id": 11, "description": "DISC REFUND", "old_category": None, "new_category": "refund"}
    ]
    assert {"id": 12, "description": "REFUND thing"} in result["skipped_user_corrected"]
    db.commit.assert_not_called()
    assert txn.category is None  # untouched


def test_apply_writes_and_increments_usage():
    rule = _Rule(1, r"REFUND", "refund")
    txn = _Txn(11, "merchant REFUND", txn_type="CREDIT")
    db = MagicMock()
    txn_query = MagicMock()
    txn_query.filter.return_value.all.return_value = [txn]
    txn_query.filter.return_value.first.return_value = None
    rule_query = MagicMock()
    rule_query.filter.return_value.all.return_value = []
    rule_query.filter.return_value.first.return_value = rule
    db.query.side_effect = lambda m: txn_query if m.__name__ == "BankTransaction" else rule_query

    result = rule_application.apply_rules_to_history(db, 1, rule_id=1)
    assert result["changed"] == 1 and result["changes"] == []
    assert txn.category == "refund" and txn.user_corrected is False
    assert rule.usage_count == 1
    db.commit.assert_called_once()


def test_rule_scope_404_and_hidden_excluded():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with pytest.raises(HTTPException) as exc:
        rule_application.apply_rules_to_history(db, 1, rule_id=99, dry_run=True)
    assert exc.value.status_code == 404
