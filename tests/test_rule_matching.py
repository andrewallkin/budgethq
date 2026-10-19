# tests/test_rule_matching.py
import sys
from pathlib import Path
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database, rule_matching
from app.routers import investec


def _rule(pattern, category="refund", transaction_type=None):
    r = MagicMock()
    r.pattern = pattern
    r.category = category
    r.transaction_type = transaction_type
    return r


def test_pattern_matches_case_insensitive():
    assert rule_matching.matches_rule_pattern("DISC MEMB REFUND", r"REFUND")


def test_credit_only_rule_ignores_debits():
    rule = _rule("REFUND", transaction_type="CREDIT")
    assert rule_matching.get_matching_rule("REFUND posted", "CREDIT", [rule]) is rule
    assert rule_matching.get_matching_rule("REFUND charge", "DEBIT", [rule]) is None


def test_null_type_matches_any():
    rule = _rule("REFUND")
    assert rule_matching.get_matching_rule("REFUND a", "CREDIT", [rule]) is rule
    assert rule_matching.get_matching_rule("REFUND b", "DEBIT", [rule]) is rule


def test_invalid_regex_falls_back_to_substring():
    # "Woolworths(" is an invalid regex; the fallback must substring-match it
    # when the description actually contains that text (case-insensitively).
    assert rule_matching.matches_rule_pattern("WOOLWORTHS( SPORT", "Woolworths(")


def test_priority_order_first_match_wins():
    a, b = _rule("WOOL", "groceries"), _rule("WOOL", "shopping_clothing")
    assert rule_matching.get_matching_rule("WOOLSWORTH", "DEBIT", [a, b]) is a


def _make_client(db, user):
    app = FastAPI()
    app.include_router(investec.router)

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db

    async def override_user():
        return user

    app.dependency_overrides[auth.get_current_user] = override_user
    return TestClient(app)


def _apply_db_defaults(obj):
    obj.id = 1
    obj.is_active = True
    obj.created_from_correction = False
    obj.usage_count = 0


def _mock_rule():
    rule = MagicMock()
    rule.id, rule.pattern, rule.category = 7, "REFUND", "refund"
    rule.priority, rule.is_active = 10, True
    rule.usage_count, rule.created_from_correction = 3, False
    rule.transaction_type = "CREDIT"
    return rule


def test_create_rule_persists_transaction_type():
    db = MagicMock()
    db.refresh.side_effect = _apply_db_defaults
    client = _make_client(db, MagicMock(id=5))
    response = client.post(
        "/api/investec/rules",
        json={"pattern": "REFUND", "category": "refund", "transaction_type": "CREDIT"},
    )
    assert response.status_code == 201
    assert response.json()["transaction_type"] == "CREDIT"


def test_create_rule_rejects_unknown_transaction_type():
    db = MagicMock()
    client = _make_client(db, MagicMock(id=5))
    response = client.post(
        "/api/investec/rules",
        json={"pattern": "X", "category": "refund", "transaction_type": "DEBITX"},
    )
    assert response.status_code == 400
    db.add.assert_not_called()


def test_update_rule_explicit_null_clears_transaction_type():
    rule = _mock_rule()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = rule
    client = _make_client(db, MagicMock(id=5))
    response = client.patch("/api/investec/rules/7", json={"transaction_type": None})
    assert response.status_code == 200
    assert rule.transaction_type is None
    assert response.json()["transaction_type"] is None


def test_update_rule_omitted_transaction_type_keeps_value():
    rule = _mock_rule()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = rule
    client = _make_client(db, MagicMock(id=5))
    response = client.patch("/api/investec/rules/7", json={"is_active": False})
    assert response.status_code == 200
    assert rule.is_active is False
    assert rule.transaction_type == "CREDIT"
