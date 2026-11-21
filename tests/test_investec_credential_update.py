"""Replacing Investec credentials keeps synced banking data."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database
from app.routers.investec import router as investec_router


def _client(db: MagicMock, current_user) -> TestClient:
    app = FastAPI()
    app.include_router(investec_router)

    def override_get_db():
        yield db

    async def override_get_current_user():
        return current_user

    app.dependency_overrides[database.get_db] = override_get_db
    app.dependency_overrides[auth.get_current_user] = override_get_current_user
    return TestClient(app)


def _connected_user():
    user = MagicMock()
    user.id = 7
    user.investec_client_id = "enc-id"
    user.investec_client_secret = "enc-secret"
    user.investec_api_key = "enc-old-key"
    return user


def _decrypt(value: str) -> str:
    return {
        "enc-id": "client-id",
        "enc-secret": "client-secret",
        "enc-old-key": "old-key",
    }[value]


class TestUpdateInvestecCredentials:
    def test_replacing_api_key_keeps_other_credentials_and_does_not_query_data(self):
        user = _connected_user()
        db = MagicMock()
        client = _client(db, user)

        with (
            patch("app.routers.investec.decrypt_api_key", side_effect=_decrypt),
            patch("app.routers.investec.encrypt_api_key", side_effect=lambda value: f"enc-{value}"),
            patch("app.routers.investec.InvestecService") as service,
        ):
            service.return_value.test_connection.return_value = True
            response = client.patch("/api/investec/credentials", json={"api_key": "  new-key  "})

        assert response.status_code == 200
        assert response.json() == {"message": "Credentials updated"}
        service.assert_called_once_with("client-id", "client-secret", "new-key")
        assert user.investec_api_key == "enc-new-key"
        assert user.investec_client_id == "enc-id"
        assert user.investec_client_secret == "enc-secret"
        db.commit.assert_called_once()
        db.query.assert_not_called()

    def test_failed_connection_test_leaves_stored_key(self):
        user = _connected_user()
        db = MagicMock()
        client = _client(db, user)

        with (
            patch("app.routers.investec.decrypt_api_key", side_effect=_decrypt),
            patch("app.routers.investec.encrypt_api_key") as encrypt,
            patch("app.routers.investec.InvestecService") as service,
        ):
            service.return_value.test_connection.return_value = False
            response = client.patch("/api/investec/credentials", json={"api_key": "bad-key"})

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid Investec credentials - connection test failed"
        assert user.investec_api_key == "enc-old-key"
        encrypt.assert_not_called()
        db.commit.assert_not_called()
        db.query.assert_not_called()

    def test_missing_credentials_returns_400(self):
        user = _connected_user()
        user.investec_api_key = None
        client = _client(MagicMock(), user)

        response = client.patch("/api/investec/credentials", json={"api_key": "new-key"})

        assert response.status_code == 400
        assert response.json()["detail"] == "Investec credentials not configured"

    def test_blank_update_returns_400(self):
        client = _client(MagicMock(), _connected_user())

        response = client.patch("/api/investec/credentials", json={"api_key": "   "})

        assert response.status_code == 400
        assert response.json()["detail"] == "Enter a new credential value"
