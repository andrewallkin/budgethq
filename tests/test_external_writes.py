# tests/test_external_writes.py
"""Tests for external write endpoints: classify (single + batch) and hide."""
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
