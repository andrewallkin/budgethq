# tests/test_external_transactions_api.py
"""Tests for external transaction list/single endpoints and route ordering."""
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database
from app.routers import external_budget


def _make_client(db, user):
    app = FastAPI()
    app.include_router(external_budget.router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db

    async def override_user():
        return user

    app.dependency_overrides[auth.get_user_from_external_api_key] = override_user
    return TestClient(app)


class _Link:
    def __init__(self, link_id, debit_id, credit_id, amount):
        self.id = link_id
        self.debit_transaction_id = debit_id
        self.credit_transaction_id = credit_id
        self.amount = amount
        self.debit_transaction = None
        self.credit_transaction = None


class _Txn:
    def __init__(self, id, description, amount=-100.0, txn_type="DEBIT", category="groceries",
                 hidden=False, status="POSTED", account_id=4,
                 date=datetime(2026, 10, 16, 9, 30)):
        self.id = id
        self.investec_uuid = f"uuid-{id}"
        self.description = description
        self.amount = amount
        self.transaction_type = txn_type
        self.category = category
        self.transaction_category = "CardPurchases"
        self.hidden = hidden
        self.status = status
        self.account_id = account_id
        self.transaction_date = date
        self.ai_category_confidence = 0.9
        self.user_corrected = False


def test_list_excludes_hidden_and_serializes_links():
    txn = _Txn(123, "Woolworths", -100.0)
    link = _Link(42, 123, 9, 100.0)
    link.debit_transaction = _Txn(123, "Woolworths")
    link.credit_transaction = _Txn(9, "REFUND", 100.0, txn_type="CREDIT", category="refund")

    query = MagicMock()
    query.limit.return_value.offset.return_value.all.return_value = [txn]
    query.count.return_value = 1

    db = MagicMock()
    with patch("app.external_transactions.build_transactions_query", return_value=query), \
         patch("app.external_transactions.get_links_for_transaction", return_value=[link]):
        client = _make_client(db, MagicMock(id=1))
        response = client.get("/api/external/transactions")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    row = body["transactions"][0]
    assert row["id"] == 123
    assert row["hidden"] is False
    assert row["status"] == "POSTED"
    assert row["has_links"] is True
    assert row["linked_credits"][0]["transaction_id"] == 9
    assert row["effective_amount"] == 0.0


class TestLinkCandidatesRouteOrdering:
    def test_link_candidates_not_swallowed_by_id_route(self):
        # GET /transactions/link-candidates without credit_id must hit the
        # link-candidates handler (422 naming the missing param), not the
        # /transactions/{transaction_id} route (which would 422 on
        # "link-candidates" as transaction_id).
        db = MagicMock()
        with patch("app.external_transactions.build_transactions_query", return_value=None):
            client = _make_client(db, MagicMock(id=1))
            response = client.get("/api/external/transactions/link-candidates")
        assert response.status_code == 422
        detail = str(response.json())
        assert "credit_id" in detail


def test_status_filter_param_accepted():
    db = MagicMock()
    query = MagicMock()
    query.limit.return_value.offset.return_value.all.return_value = []
    query.count.return_value = 0
    with patch("app.external_transactions.build_transactions_query", return_value=query) as bq:
        client = _make_client(db, MagicMock(id=1))
        response = client.get("/api/external/transactions", params={"status": "POSTED"})
    assert response.status_code == 200
    assert bq.call_args.kwargs.get("status") == "POSTED"
