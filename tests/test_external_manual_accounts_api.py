# tests/test_external_manual_accounts_api.py
"""Tests for external manual bank account endpoints: list, get, create, balance update."""
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database
from app.routers import external_manual_accounts


def _make_client(db, user):
    app = FastAPI()
    app.include_router(external_manual_accounts.router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db

    async def override_user():
        return user

    app.dependency_overrides[auth.get_user_from_external_api_key] = override_user
    app.dependency_overrides[auth.get_user_from_external_api_key_write] = override_user
    return TestClient(app)


def _account(id=1, name="Savings", balance=500.5, emergency=True,
             created=datetime(2026, 10, 21, 8, 0), updated=datetime(2026, 10, 21, 9, 0)):
    acct = MagicMock()
    acct.id = id
    acct.name = name
    acct.balance = balance
    acct.is_emergency_savings = emergency
    acct.created_at = created
    acct.updated_at = updated
    return acct


def _serialized(acct):
    return {
        "id": acct.id,
        "name": acct.name,
        "balance": acct.balance or 0,
        "is_emergency_savings": acct.is_emergency_savings or False,
        "created_at": acct.created_at.isoformat() + "Z",
        "updated_at": acct.updated_at.isoformat() + "Z",
    }


def _assign_identity(account):
    account.id = 9
    account.created_at = datetime(2026, 10, 21, 10, 0)
    account.updated_at = datetime(2026, 10, 21, 10, 0)
    return account


def _routes_for_path(path):
    return [
        r for r in external_manual_accounts.router.routes
        if getattr(r, "path", None) == path
    ]


def test_list_returns_all_accounts():
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [
        _account(),
        _account(id=2, name="Stash", balance=0, emergency=False),
    ]
    client = _make_client(db, MagicMock(id=1))
    response = client.get("/api/external/manual-accounts")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert body["accounts"][0] == _serialized(_account())
    assert body["accounts"][1] == _serialized(_account(id=2, name="Stash", balance=0, emergency=False))


def test_get_single_account():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = _account()
    client = _make_client(db, MagicMock(id=1))
    response = client.get("/api/external/manual-accounts/1")

    assert response.status_code == 200
    assert response.json() == _serialized(_account())


def test_get_account_404_when_missing():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    client = _make_client(db, MagicMock(id=1))
    response = client.get("/api/external/manual-accounts/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Account not found"}


def test_create_account():
    db = MagicMock()
    db.refresh.side_effect = _assign_identity
    client = _make_client(db, MagicMock(id=1))
    response = client.post(
        "/api/external/manual-accounts",
        json={"name": "Holiday Jar", "balance": 1250.75, "is_emergency_savings": False},
    )

    assert response.status_code == 200
    added = db.add.call_args.args[0]
    assert added.user_id == 1
    assert added.name == "Holiday Jar"
    assert added.balance == 1250.75
    assert added.is_emergency_savings is False
    body = response.json()
    assert body["id"] == 9
    assert body["name"] == "Holiday Jar"
    assert body["balance"] == 1250.75
    assert body["created_at"] == "2026-10-21T10:00:00Z"


def test_create_account_defaults():
    db = MagicMock()
    db.refresh.side_effect = _assign_identity
    client = _make_client(db, MagicMock(id=1))
    response = client.post("/api/external/manual-accounts", json={"name": "Plain Jar"})

    assert response.status_code == 200
    added = db.add.call_args.args[0]
    assert added.balance == 0
    assert added.is_emergency_savings is False


def test_patch_updates_balance_only():
    acct = _account(name="Jar", balance=10.0, emergency=True)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = acct
    db.refresh.side_effect = _assign_identity
    client = _make_client(db, MagicMock(id=1))
    response = client.patch("/api/external/manual-accounts/1", json={"balance": 123.45})

    assert response.status_code == 200
    assert acct.balance == 123.45
    body = response.json()
    assert body["balance"] == 123.45
    assert body["name"] == "Jar"
    assert body["is_emergency_savings"] is True


def test_patch_ignores_name_and_emergency_flag():
    acct = _account(name="Jar", balance=10.0, emergency=True)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = acct
    db.refresh.side_effect = _assign_identity
    client = _make_client(db, MagicMock(id=1))
    response = client.patch(
        "/api/external/manual-accounts/1",
        json={"balance": 5.0, "name": "Renamed", "is_emergency_savings": False},
    )

    assert response.status_code == 200
    assert acct.name == "Jar"
    assert acct.is_emergency_savings is True
    assert acct.balance == 5.0


def test_patch_requires_balance():
    db = MagicMock()
    client = _make_client(db, MagicMock(id=1))
    response = client.patch("/api/external/manual-accounts/1", json={})

    assert response.status_code == 422


def test_patch_404_when_missing():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    client = _make_client(db, MagicMock(id=1))
    response = client.patch("/api/external/manual-accounts/999", json={"balance": 1.0})

    assert response.status_code == 404


def test_delete_is_not_exposed():
    for r in external_manual_accounts.router.routes:
        assert "DELETE" not in getattr(r, "methods", set())
    assert _route_methods("/external/manual-accounts/{account_id}") is not None


def _route_methods(path):
    for r in external_manual_accounts.router.routes:
        if getattr(r, "path", None) == path:
            return r.methods
    return None


def test_write_routes_require_full_access_key_dependency():
    write_dep = auth.get_user_from_external_api_key_write

    def _dep_calls(route):
        # Parameter-level Depends() live in dependant.dependencies, not route.dependencies.
        return [d.call for d in route.dependant.dependencies]

    post_routes = [r for r in _routes_for_path("/external/manual-accounts")
                   if "POST" in r.methods]
    patch_routes = [r for r in _routes_for_path("/external/manual-accounts/{account_id}")
                    if "PATCH" in r.methods]

    assert post_routes and patch_routes
    assert write_dep in _dep_calls(post_routes[0])
    assert write_dep in _dep_calls(patch_routes[0])

    get_routes = [r for r in _routes_for_path("/external/manual-accounts")
                  if "GET" in r.methods]
    get_single = [r for r in _routes_for_path("/external/manual-accounts/{account_id}")
                  if "GET" in r.methods]

    assert get_routes and get_single
    assert write_dep not in _dep_calls(get_routes[0])
    assert write_dep not in _dep_calls(get_single[0])
    assert auth.get_user_from_external_api_key in _dep_calls(get_routes[0])


def test_docs_route_serves_markdown():
    client = _make_client(MagicMock(), MagicMock(id=1))
    response = client.get("/api/external/manual-accounts/docs")

    assert response.status_code == 200
    assert "text/markdown" in response.headers["content-type"]
    assert "/api/external/manual-accounts" in response.text


def test_docs_route_404_when_file_missing():
    missing = Path("/nonexistent/external-manual-accounts-api.md")
    with patch.object(external_manual_accounts, "_DOCS_CANDIDATES", (missing,)):
        client = _make_client(MagicMock(), MagicMock(id=1))
        response = client.get("/api/external/manual-accounts/docs")

    assert response.status_code == 404
