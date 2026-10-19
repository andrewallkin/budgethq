"""Model columns for read-only external key, transaction hide flag, rule type filter."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import models


def test_user_has_read_only_external_key_columns():
    cols = {c.name for c in models.User.__table__.columns}
    assert "external_api_key_ro_prefix" in cols
    assert "external_api_key_ro_hash" in cols
    assert "external_api_key_ro_created_at" in cols


def test_bank_transaction_has_hidden_flag():
    col = models.BankTransaction.__table__.columns["hidden"]
    assert col.nullable is False
    assert col.server_default is not None


def test_categorization_rule_has_transaction_type():
    col = models.CategorizationRule.__table__.columns["transaction_type"]
    assert col.nullable is True
