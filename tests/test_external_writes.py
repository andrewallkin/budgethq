# tests/test_external_writes.py
"""Tests for external write endpoints: classify (single + batch), hide, and refund links."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database
from app.routers import external_budget


def _client(db):
    app = FastAPI()
    app.include_router(external_budget.router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db

    async def override_user():
        u = MagicMock(id=1)
        return u

    async def override_write_user():
        u = MagicMock(id=1)
        return u

    app.dependency_overrides[auth.get_user_from_external_api_key] = override_user
    app.dependency_overrides[auth.get_user_from_external_api_key_write] = override_write_user
    return TestClient(app)


def _readonly_auth_client(db):
    """TestClient that uses the real auth dependencies (no overrides).

    We patch auth._resolve_external_key in each test to simulate a read-only
    key resolving to (user, "read"), so the 403 write-scope guard in
    _external_key_dependency runs end-to-end.
    """
    app = FastAPI()
    app.include_router(external_budget.router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db
    return TestClient(app)


def _ok_payload(id_):
    return {"id": id_, "category": "groceries"}


def test_patch_category_returns_payload():
    db = MagicMock()
    with patch("app.routers.external_budget.set_transaction_category", return_value=MagicMock(id=5)) as setter, \
         patch("app.routers.external_budget.get_links_for_transaction", return_value=[]), \
         patch("app.routers.external_budget.transaction_payload", return_value=_ok_payload(5)):
        client = _client(db)
        response = client.patch("/api/external/transactions/5/category", json={"category": "groceries"})
    assert response.status_code == 200
    assert response.json()["id"] == 5
    assert setter.call_args.args == (db, 1, 5, "groceries")


def test_batch_partial_results():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(id=123)

    def fake_set(db_, user_id, txn_id, category):
        if txn_id == 124:
            raise HTTPException(status_code=400, detail="Invalid category")
        return _ok_payload(txn_id)

    with patch("app.routers.external_budget.set_transaction_category", side_effect=fake_set), \
         patch("app.routers.external_budget.get_links_for_transaction", return_value=[]), \
         patch("app.routers.external_budget.transaction_payload",
               side_effect=lambda txn, links=None: _ok_payload(txn.id)):
        client = _client(db)
        response = client.patch(
            "/api/external/transactions/categories",
            json={"updates": [{"id": 123, "category": "groceries"}, {"id": 124, "category": "nope"}]},
        )
    body = response.json()
    assert response.status_code == 200
    assert body["results"][0]["status"] == "ok" and body["results"][0]["transaction"]["id"] == 123
    assert body["results"][1]["status"] == "error" and body["results"][1]["detail"] == "Invalid category"


def test_batch_rejects_over_100():
    db = MagicMock()
    client = _client(db)
    response = client.patch(
        "/api/external/transactions/categories",
        json={"updates": [{"id": i, "category": "groceries"} for i in range(101)]},
    )
    assert response.status_code == 400


def test_batch_skips_non_object_updates():
    # A non-dict item must become a per-item error result, not a 500.
    db = MagicMock()
    client = _client(db)
    response = client.patch(
        "/api/external/transactions/categories",
        json={"updates": ["oops", {"id": 123, "category": "groceries"}]},
    )
    body = response.json()
    assert response.status_code == 200
    assert body["results"][0] == {"id": None, "status": "error", "detail": "update must be an object"}
    assert body["results"][1]["status"] == "ok"


def test_batch_route_reachable_with_empty_body():
    # PATCH /transactions/categories must resolve to the batch handler (400
    # naming "updates"), not be swallowed by an {id} route.
    db = MagicMock()
    client = _client(db)
    response = client.patch("/api/external/transactions/categories", json={})
    assert response.status_code == 400
    assert "updates" in response.json()["detail"]


def test_patch_hidden_roundtrip():
    db = MagicMock()
    txn = MagicMock(id=7, hidden=True)
    with patch("app.routers.external_budget.set_transaction_hidden", return_value=txn), \
         patch("app.routers.external_budget.get_links_for_transaction", return_value=[]), \
         patch("app.routers.external_budget.transaction_payload", return_value={"id": 7, "hidden": True}):
        client = _client(db)
        response = client.patch("/api/external/transactions/7/hidden", json={"hidden": True})
    assert response.status_code == 200
    assert response.json()["hidden"] is True


class TestExternalTransactionLinks:
    def test_create_external_link(self):
        db = MagicMock()

        class _Link:
            id, debit_transaction_id, credit_transaction_id, amount = 42, 88, 9, 151.20
            transaction_date = None

        created = _Link()
        with patch("app.routers.external_budget.create_transaction_link", return_value=created):
            client = _client(db)
            response = client.post(
                "/api/external/transaction-links",
                json={"debit_transaction_id": 88, "credit_transaction_id": 9, "amount": 151.20},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["link_id"] == 42 and body["amount"] == 151.20

    def test_duplicate_link_conflict_shape(self):
        db = MagicMock()
        with patch(
            "app.routers.external_budget.create_transaction_link",
            side_effect=HTTPException(
                status_code=409,
                detail={"detail": "This credit is already linked to this debit", "existing_link_id": 42},
            ),
        ):
            client = _client(db)
            response = client.post(
                "/api/external/transaction-links",
                json={"debit_transaction_id": 88, "credit_transaction_id": 9},
            )
        assert response.status_code == 409
        assert response.json()["detail"]["existing_link_id"] == 42

    def test_delete_external_link_204(self):
        db = MagicMock()
        with patch("app.routers.external_budget.delete_transaction_link", return_value=None):
            client = _client(db)
            response = client.delete("/api/external/transaction-links/42")
        assert response.status_code == 204

    def test_link_candidates_route_uses_service(self):
        db = MagicMock()
        txn = MagicMock(id=5, description="Woolworths", amount=-655.0, transaction_type="DEBIT",
                        category="health_wellness", account_id=1, hidden=False, status="POSTED",
                        transaction_category="CardPurchases", user_corrected=False,
                        ai_category_confidence=0.8, transaction_date=None, investec_uuid="u5", account=None)
        candidate = {"transaction": txn, "match_score": 0.85,
                     "match_reasons": ["partial_amount", "within_14_days"], "debit_remaining": 655.0}
        with patch("app.routers.external_budget.find_link_candidates", return_value=[candidate]):
            client = _client(db)
            response = client.get("/api/external/transactions/link-candidates", params={"credit_id": 9})
        assert response.status_code == 200
        body = response.json()
        assert body["candidates"][0]["match_reasons"] == ["partial_amount", "within_14_days"]


class TestExternalApplyRules:
    def test_apply_rules_endpoint_dry_run(self):
        db = MagicMock()
        result = {
            "matched": 1, "changed": 0, "skipped_user_corrected": [],
            "changes": [{"id": 11, "description": "DISC REFUND", "old_category": None, "new_category": "refund"}],
        }
        with patch("app.routers.external_budget.apply_rules_to_history", return_value=result) as apply_mock:
            client = _client(db)
            response = client.post(
                "/api/external/transactions/apply-rules",
                json={"from_date": "2026-10-14", "to_date": "2026-10-17", "dry_run": True},
            )
        assert response.status_code == 200
        assert response.json()["changes"][0]["new_category"] == "refund"
        assert apply_mock.call_args.kwargs["dry_run"] is True

    def test_apply_rules_requires_scope(self):
        db = MagicMock()
        with patch(
            "app.routers.external_budget.apply_rules_to_history",
            side_effect=HTTPException(status_code=400, detail="Provide rule_id or a from_date/to_date"),
        ):
            client = _client(db)
            response = client.post("/api/external/transactions/apply-rules", json={})
        assert response.status_code == 400


class TestExternalReadOnlyKey403:
    """Endpoint-level read-only-key 403 coverage (real auth dependencies active).

    We do not override the auth dependencies here: auth._resolve_external_key
    is patched to return (user, "read") so the write-scope 403 guard in
    _external_key_dependency runs end-to-end.
    """

    def test_patch_batch_categories_forbidden(self):
        db = MagicMock()
        user = MagicMock(id=1)
        client = _readonly_auth_client(db)

        with patch("app.auth._resolve_external_key", return_value=(user, "read")):
            response = client.patch(
                "/api/external/transactions/categories",
                json={"updates": [{"id": 1, "category": "groceries"}]},
                headers={"Authorization": "Bearer bhq_read_only_key_123456789"},
            )

        assert response.status_code == 403

    def test_apply_rules_forbidden(self):
        db = MagicMock()
        user = MagicMock(id=1)
        client = _readonly_auth_client(db)

        with patch("app.auth._resolve_external_key", return_value=(user, "read")):
            response = client.post(
                "/api/external/transactions/apply-rules",
                json={"dry_run": True},
                headers={"Authorization": "Bearer bhq_read_only_key_123456789"},
            )

        assert response.status_code == 403
