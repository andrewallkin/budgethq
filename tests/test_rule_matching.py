# tests/test_rule_matching.py
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import rule_matching


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
    assert rule_matching.matches_rule_pattern("Woolworths", "Woolworths(")


def test_priority_order_first_match_wins():
    a, b = _rule("WOOL", "groceries"), _rule("WOOL", "shopping_clothing")
    assert rule_matching.get_matching_rule("WOOLSWORTH", "DEBIT", [a, b]) is a
