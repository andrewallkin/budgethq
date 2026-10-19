"""Tests for external API key scopes: read-only keys, write enforcement, and management routes."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database
from app.routers.auth import router as auth_router


def _make_auth_client(db: MagicMock, current_user=None) -> TestClient:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db
    if current_user is not None:

        async def override_get_current_user():
            return current_user

        app.dependency_overrides[auth.get_current_user] = override_get_current_user
    return TestClient(app)


def _probe_client(db: MagicMock, dependency) -> TestClient:
    app = FastAPI()

    async def probe(user=Depends(dependency)):
        return {"ok": True}

    app.add_api_route("/probe", probe, methods=["GET", "POST"])

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db
    return TestClient(app)


class TestExternalKeyScopes:
    def test_read_only_key_accepted_on_get(self):
        ro_key, ro_prefix, ro_hash = auth.create_external_api_key_material()
        user = MagicMock()
        user.id = 7
        user.external_api_key_ro_prefix = ro_prefix
        user.external_api_key_ro_hash = ro_hash

        db = MagicMock()
        # Write-prefix lookup misses, then read-only lookup finds the user.
        db.query.return_value.filter.return_value.first.side_effect = [None, user]

        client = _probe_client(db, auth.get_user_from_external_api_key)
        with patch.object(auth, "verify_password", side_effect=[True]):
            response = client.get("/probe", headers={"Authorization": f"Bearer {ro_key}"})

        assert response.status_code == 200
        assert response.json() == {"ok": True}

    def test_full_access_key_accepted_on_write_dependency(self):
        full_key, write_prefix, write_hash = auth.create_external_api_key_material()
        user = MagicMock()
        user.id = 7
        user.external_api_key_prefix = write_prefix
        user.external_api_key_hash = write_hash

        db = MagicMock()
        # Write-prefix lookup hits on the first query; no read-only fallback needed.
        db.query.return_value.filter.return_value.first.side_effect = [user]

        client = _probe_client(db, auth.get_user_from_external_api_key_write)
        with patch.object(auth, "verify_password", side_effect=[True]):
            response = client.post("/probe", headers={"Authorization": f"Bearer {full_key}"})

        assert response.status_code == 200
        assert response.json() == {"ok": True}

    def test_read_only_key_rejected_with_403_on_write(self):
        ro_key, ro_prefix, ro_hash = auth.create_external_api_key_material()
        user = MagicMock()
        user.id = 7
        user.external_api_key_ro_prefix = ro_prefix
        user.external_api_key_ro_hash = ro_hash

        db = MagicMock()
        # Write-prefix lookup misses, then read-only lookup finds the user.
        db.query.return_value.filter.return_value.first.side_effect = [None, user]

        client = _probe_client(db, auth.get_user_from_external_api_key_write)
        with patch.object(auth, "verify_password", side_effect=[True]):
            response = client.post("/probe", headers={"Authorization": f"Bearer {ro_key}"})

        assert response.status_code == 403


class TestReadOnlyKeyManagementRoutes:
    def test_generate_readonly_key_persists_hash(self):
        current_user = MagicMock()
        current_user.id = 42
        db = MagicMock()
        client = _make_auth_client(db, current_user=current_user)

        response = client.post("/api/auth/user/settings/external-api-key/readonly")

        assert response.status_code == 200
        body = response.json()
        assert body["api_key"].startswith("bhq_")
        assert body["prefix"].endswith("...")
        assert body["created_at"]
        assert body["message"]
        assert current_user.external_api_key_ro_prefix == body["api_key"][: auth.EXTERNAL_API_KEY_LOOKUP_LEN]
        assert auth.verify_password(body["api_key"], current_user.external_api_key_ro_hash)
        db.commit.assert_called_once()

    def test_get_readonly_status_when_missing(self):
        current_user = MagicMock()
        current_user.external_api_key_ro_hash = None
        current_user.external_api_key_ro_prefix = None
        current_user.external_api_key_ro_created_at = None
        client = _make_auth_client(MagicMock(), current_user=current_user)

        response = client.get("/api/auth/user/settings/external-api-key/readonly")

        assert response.status_code == 200
        assert response.json() == {"has_key": False, "prefix": None, "created_at": None}

    def test_revoke_readonly_key_clears_fields(self):
        current_user = MagicMock()
        current_user.external_api_key_ro_prefix = "bhq_abc12345"
        current_user.external_api_key_ro_hash = "hash"
        current_user.external_api_key_ro_created_at = MagicMock()
        db = MagicMock()
        client = _make_auth_client(db, current_user=current_user)

        response = client.delete("/api/auth/user/settings/external-api-key/readonly")

        assert response.status_code == 200
        assert current_user.external_api_key_ro_prefix is None
        assert current_user.external_api_key_ro_hash is None
        assert current_user.external_api_key_ro_created_at is None
        db.commit.assert_called_once()
