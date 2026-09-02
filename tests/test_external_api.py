"""Tests for per-user external investment API keys and summary endpoint."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth
from app.routers.auth import router as auth_router
from app.routers.external import router as external_router


def _make_auth_client(db: MagicMock, current_user=None) -> TestClient:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")

    def override_get_db():
        yield db

    from app import database

    app.dependency_overrides[database.get_db] = override_get_db
    if current_user is not None:

        async def override_get_current_user():
            return current_user

        app.dependency_overrides[auth.get_current_user] = override_get_current_user
    return TestClient(app)


def _make_external_client(db: MagicMock, user=None) -> TestClient:
    app = FastAPI()
    app.include_router(external_router, prefix="/api")

    def override_get_db():
        yield db

    from app import database

    app.dependency_overrides[database.get_db] = override_get_db
    if user is not None:

        async def override_get_user_from_external_api_key():
            return user

        app.dependency_overrides[auth.get_user_from_external_api_key] = override_get_user_from_external_api_key
    return TestClient(app)


class TestExternalApiKeyMaterial:
    def test_create_external_api_key_material_format(self):
        full_key, lookup_prefix, key_hash = auth.create_external_api_key_material()
        assert full_key.startswith("bhq_")
        assert lookup_prefix == full_key[: auth.EXTERNAL_API_KEY_LOOKUP_LEN]
        assert auth.verify_password(full_key, key_hash)

    def test_create_external_api_key_material_unique(self):
        key_a, _, _ = auth.create_external_api_key_material()
        key_b, _, _ = auth.create_external_api_key_material()
        assert key_a != key_b


class TestExternalApiKeyAuthRoutes:
    def test_generate_external_api_key_persists_hash(self):
        current_user = MagicMock()
        current_user.id = 42
        db = MagicMock()
        client = _make_auth_client(db, current_user=current_user)

        response = client.post("/api/auth/user/settings/external-api-key")

        assert response.status_code == 200
        body = response.json()
        assert body["api_key"].startswith("bhq_")
        assert body["prefix"].endswith("...")
        assert body["created_at"]
        assert current_user.external_api_key_prefix == body["api_key"][: auth.EXTERNAL_API_KEY_LOOKUP_LEN]
        assert auth.verify_password(body["api_key"], current_user.external_api_key_hash)
        db.commit.assert_called_once()

    def test_get_external_api_key_status_when_missing(self):
        current_user = MagicMock()
        current_user.external_api_key_hash = None
        current_user.external_api_key_prefix = None
        current_user.external_api_key_created_at = None
        client = _make_auth_client(MagicMock(), current_user=current_user)

        response = client.get("/api/auth/user/settings/external-api-key")

        assert response.status_code == 200
        assert response.json() == {"has_key": False, "prefix": None, "created_at": None}

    def test_revoke_external_api_key_clears_fields(self):
        current_user = MagicMock()
        current_user.external_api_key_prefix = "bhq_abc12345"
        current_user.external_api_key_hash = "hash"
        current_user.external_api_key_created_at = MagicMock()
        db = MagicMock()
        client = _make_auth_client(db, current_user=current_user)

        response = client.delete("/api/auth/user/settings/external-api-key")

        assert response.status_code == 200
        assert current_user.external_api_key_prefix is None
        assert current_user.external_api_key_hash is None
        assert current_user.external_api_key_created_at is None
        db.commit.assert_called_once()


class TestExternalApiKeyValidation:
    def test_get_user_from_external_api_key_rejects_jwt_like_token(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        client = _make_external_client(db)

        response = client.get(
            "/api/external/investments/summary",
            headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.test"},
        )

        assert response.status_code == 401

    def test_get_user_from_external_api_key_accepts_valid_key(self):
        full_key, lookup_prefix, key_hash = auth.create_external_api_key_material()
        user = MagicMock()
        user.id = 7
        user.username = "user@example.com"
        user.show_ra_under_investments = False

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = MagicMock(
            external_api_key_prefix=lookup_prefix,
            external_api_key_hash=key_hash,
        )

        # Patch verify path through real auth dependency by using TestClient without override
        app = FastAPI()
        app.include_router(external_router, prefix="/api")

        def override_get_db():
            yield db

        from app import database

        app.dependency_overrides[database.get_db] = override_get_db

        summary = {
            "portfolios": [
                {
                    "name": "TFSA",
                    "slug": "tfsa",
                    "currency_code": "ZAR",
                    "total_value": 1000.0,
                }
            ],
            "total_value_base_currency": 1000.0,
            "base_currency": "ZAR",
            "fx": {"as_of": "2026-09-02T12:00:00+00:00", "configured": True, "aggregate_error": None},
        }

        stored_user = db.query.return_value.filter.return_value.first.return_value

        def lookup_user(*args, **kwargs):
            stored_user.external_api_key_hash = key_hash
            return stored_user

        db.query.return_value.filter.return_value.first.side_effect = lookup_user

        with patch("app.routers.external.ensure_default_tfsa_portfolio"), patch(
            "app.routers.external.build_investments_summary", return_value=summary
        ):
            client = TestClient(app)
            response = client.get(
                "/api/external/investments/summary",
                headers={"Authorization": f"Bearer {full_key}"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["base_currency"] == "ZAR"
        assert body["total_value_base"] == 1000.0
        assert len(body["accounts"]) == 1
        assert body["accounts"][0]["slug"] == "tfsa"


class TestExternalInvestmentsSummaryEndpoint:
    def test_summary_endpoint_returns_accounts(self):
        user = MagicMock()
        user.id = 1
        user.show_ra_under_investments = False

        summary = {
            "portfolios": [
                {
                    "name": "TFSA",
                    "slug": "tfsa",
                    "currency_code": "ZAR",
                    "total_value": 500.0,
                },
                {
                    "name": "US Account",
                    "slug": "usd-account",
                    "currency_code": "USD",
                    "total_value": 100.0,
                },
            ],
            "total_value_base_currency": 2300.0,
            "base_currency": "ZAR",
            "fx": {"as_of": "2026-09-02T12:00:00+00:00", "configured": True, "aggregate_error": None},
        }

        with patch("app.routers.external.ensure_default_tfsa_portfolio"), patch(
            "app.routers.external.build_investments_summary", return_value=summary
        ), patch(
            "app.routers.external.aggregate_portfolios_base",
            side_effect=lambda pairs, _fx: (pairs[0][0] * 18 if pairs[0][1] == "USD" else pairs[0][0], None),
        ):
            client = _make_external_client(MagicMock(), user=user)
            response = client.get("/api/external/investments/summary")

        assert response.status_code == 200
        body = response.json()
        assert body["total_value_base"] == 2300.0
        assert body["accounts"][0]["value"] == 500.0
        assert body["accounts"][1]["currency"] == "USD"
        assert body["accounts"][1]["value_base"] == 1800.0

    def test_summary_endpoint_requires_auth_when_not_overridden(self):
        client = _make_external_client(MagicMock())
        response = client.get("/api/external/investments/summary")
        assert response.status_code == 401
