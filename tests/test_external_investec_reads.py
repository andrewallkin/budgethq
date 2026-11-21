"""Tests for Investec read proxy (/api/external/investec/*)."""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database
from app.routers import external_investec


def _user_with_credentials():
    user = MagicMock()
    user.id = 7
    user.investec_client_id = "enc_client_id"
    user.investec_client_secret = "enc_client_secret"
    user.investec_api_key = "enc_api_key"
    return user


def _make_client(db, user=None, use_auth_dependency=False):
    app = FastAPI()
    app.include_router(external_investec.router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db
    if user is not None and not use_auth_dependency:

        async def override_user():
            return user

        app.dependency_overrides[auth.get_user_from_external_api_key] = override_user
    return TestClient(app)


def _auth_headers(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


class TestInvestecReadProxy:
    def test_accounts_proxies_and_returns_json(self):
        user = _user_with_credentials()
        db = MagicMock()
        client = _make_client(db, user=user)
        payload = {"data": {"accounts": [{"accountId": "a1"}]}}

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (200, payload)
            response = client.get("/api/external/investec/accounts")

        assert response.status_code == 200
        assert response.json() == payload
        MockService.assert_called_once_with("enc_client_id", "enc_client_secret", "enc_api_key")
        mock_svc.request_json.assert_called_once_with(
            "GET", "/za/pb/v1/accounts", params={}
        )

    def test_query_params_forwarded(self):
        user = _user_with_credentials()
        client = _make_client(MagicMock(), user=user)

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (200, {"data": {}})
            response = client.get(
                "/api/external/investec/accounts/acc-1/transactions",
                params={"fromDate": "2026-01-01", "toDate": "2026-01-31"},
            )

        assert response.status_code == 200
        mock_svc.request_json.assert_called_once_with(
            "GET",
            "/za/pb/v1/accounts/acc-1/transactions",
            params={"fromDate": "2026-01-01", "toDate": "2026-01-31"},
        )

    def test_authorisation_setup_maps_investec_path(self):
        user = _user_with_credentials()
        client = _make_client(MagicMock(), user=user)

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (200, {"data": {}})
            response = client.get(
                "/api/external/investec/profiles/p1/accounts/a1/authorisation-setup"
            )

        assert response.status_code == 200
        mock_svc.request_json.assert_called_once_with(
            "GET",
            "/za/pb/v1/profiles/p1/accounts/a1/authorisationsetupdetails",
            params={},
        )

    def test_investec_http_error_passes_status_and_body(self):
        user = _user_with_credentials()
        client = _make_client(MagicMock(), user=user)
        error_body = {"error": "forbidden", "code": 403}

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (403, error_body)
            response = client.get("/api/external/investec/profiles")

        assert response.status_code == 403
        assert response.json() == error_body

    def test_missing_investec_credentials_returns_400(self):
        user = MagicMock()
        user.investec_client_id = None
        user.investec_client_secret = "x"
        user.investec_api_key = "y"
        client = _make_client(MagicMock(), user=user)

        with patch("app.routers.external_investec.InvestecService") as MockService:
            response = client.get("/api/external/investec/accounts")

        assert response.status_code == 400
        MockService.assert_not_called()

    def test_unknown_get_path_404_without_investec(self):
        user = _user_with_credentials()
        client = _make_client(MagicMock(), user=user)

        with patch("app.routers.external_investec.InvestecService") as MockService:
            response = client.get("/api/external/investec/nope")

        assert response.status_code == 404
        MockService.assert_not_called()

    def test_unknown_post_path_404_without_investec(self):
        user = _user_with_credentials()
        client = _make_client(MagicMock(), user=user)

        with patch("app.routers.external_investec.InvestecService") as MockService:
            response = client.post("/api/external/investec/accounts/acc-1/transfers", json={})

        assert response.status_code == 404
        MockService.assert_not_called()

    def test_unauthenticated_without_api_key(self):
        client = _make_client(MagicMock(), use_auth_dependency=True)
        response = client.get("/api/external/investec/accounts")
        assert response.status_code in (401, 403)

    def test_read_only_key_accepted(self):
        ro_key, ro_prefix, ro_hash = auth.create_external_api_key_material()
        user = _user_with_credentials()
        user.external_api_key_ro_prefix = ro_prefix
        user.external_api_key_ro_hash = ro_hash

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [None, user]
        client = _make_client(db, use_auth_dependency=True)

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (200, {"data": {"accounts": []}})
            with patch.object(auth, "verify_password", side_effect=[True]):
                response = client.get("/api/external/investec/accounts", headers=_auth_headers(ro_key))

        assert response.status_code == 200

    def test_beneficiary_categories_forwards_profile_id(self):
        user = _user_with_credentials()
        client = _make_client(MagicMock(), user=user)

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (200, {"data": {"categories": []}})
            response = client.get(
                "/api/external/investec/beneficiary-categories",
                params={"profileId": "prof-99"},
            )

        assert response.status_code == 200
        assert mock_svc.request_json.call_count == 1
        mock_svc.request_json.assert_called_once_with(
            "GET",
            "/za/pb/v1/accounts/beneficiarycategories",
            params={"profileId": "prof-99"},
        )

    def test_beneficiary_categories_uses_default_profile_when_omitted(self):
        user = _user_with_credentials()
        client = _make_client(MagicMock(), user=user)
        profiles = {
            "data": {
                "profiles": [
                    {"profileId": "p-first", "defaultProfile": False},
                    {"profileId": "p-default", "defaultProfile": True},
                ]
            }
        }

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            mock_svc = MockService.return_value
            mock_svc.request_json.side_effect = [
                (200, profiles),
                (200, {"data": {"categories": []}}),
            ]
            response = client.get("/api/external/investec/beneficiary-categories")

        assert response.status_code == 200
        assert mock_svc.request_json.call_count == 2
        mock_svc.request_json.assert_any_call("GET", "/za/pb/v1/profiles", params={})
        mock_svc.request_json.assert_any_call(
            "GET",
            "/za/pb/v1/accounts/beneficiarycategories",
            params={"profileId": "p-default"},
        )

    def test_beneficiary_categories_uses_first_profile_when_no_default(self):
        user = _user_with_credentials()
        client = _make_client(MagicMock(), user=user)
        profiles = {
            "data": {
                "profiles": [
                    {"profileId": "p-first", "defaultProfile": False},
                    {"profileId": "p-second", "defaultProfile": False},
                ]
            }
        }

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            mock_svc = MockService.return_value
            mock_svc.request_json.side_effect = [
                (200, profiles),
                (200, {"data": {"categories": []}}),
            ]
            response = client.get("/api/external/investec/beneficiary-categories")

        assert response.status_code == 200
        mock_svc.request_json.assert_any_call(
            "GET",
            "/za/pb/v1/accounts/beneficiarycategories",
            params={"profileId": "p-first"},
        )