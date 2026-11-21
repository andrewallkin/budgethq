"""Tests for Investec movement create and get (/api/external/investec/...)."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import requests
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database, models
from app.routers import external_investec

UTC = timezone.utc

ACCOUNTS_PAYLOAD = {
    "data": {
        "accounts": [
            {
                "accountId": "acc-src",
                "profileId": "prof-1",
                "referenceName": "Daily Account",
                "productName": "Private Bank Account",
            },
            {
                "accountId": "acc-dest",
                "profileId": "prof-1",
                "referenceName": "Vehicle Finance",
                "productName": "Instalment Sale Loan Account",
            },
        ]
    }
}

BENEFICIARIES_PAYLOAD = {
    "data": {
        "beneficiaries": [
            {
                "beneficiaryId": "ben-1",
                "name": "Municipality",
                "bank": "Standard Bank",
                "accountNumber": "051001234567890",
            }
        ]
    }
}


def _user_with_telegram(user_id=7):
    user = MagicMock()
    user.id = user_id
    user.investec_client_id = "enc_client"
    user.investec_client_secret = "enc_secret"
    user.investec_api_key = "enc_key"
    user.telegram_bot_token = "enc_bot"
    user.telegram_allowed_user_id = 999888777
    return user


def _user_no_telegram():
    user = _user_with_telegram()
    user.telegram_bot_token = None
    user.telegram_allowed_user_id = None
    return user


def _make_client(db, user=None, *, write=True, use_auth_dependency=False):
    app = FastAPI()
    app.include_router(external_investec.router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db
    if user is not None and not use_auth_dependency:
        async def override_read():
            return user

        async def override_write():
            return user

        app.dependency_overrides[auth.get_user_from_external_api_key] = override_read
        app.dependency_overrides[auth.get_user_from_external_api_key_write] = override_write
    return TestClient(app)


def _transfer_body(**overrides):
    item = {
        "beneficiaryAccountId": "acc-dest",
        "amount": "1500.5",
        "myReference": "Vehicle finance",
        "theirReference": "From daily",
    }
    item.update(overrides)
    return {"transferList": [item]}


def _payment_body(**overrides):
    item = {
        "beneficiaryId": "ben-1",
        "amount": "1500.00",
        "myReference": "Rates",
        "theirReference": "Account 42",
    }
    item.update(overrides)
    return {"paymentList": [item]}


def _assign_movement_id(movement):
    movement.id = 123
    movement.created_at = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)
    movement.updated_at = movement.created_at
    if movement.expires_at is None:
        movement.expires_at = datetime(2026, 11, 21, 12, 15, tzinfo=UTC)
    return movement


class TestCreateTransfer:
    def test_success_returns_202_pending(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        db.refresh.side_effect = _assign_movement_id
        user = _user_with_telegram()
        client = _make_client(db, user=user)
        telegram_response = MagicMock()
        telegram_response.json.return_value = {
            "ok": True,
            "result": {"message_id": 555, "chat": {"id": user.telegram_allowed_user_id}},
        }
        telegram_response.raise_for_status = MagicMock()

        fixed_now = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)
        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService, patch(
            "app.routers.external_investec.requests.post", return_value=telegram_response
        ) as tg_post, patch(
            "app.routers.external_investec.datetime"
        ) as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (200, ACCOUNTS_PAYLOAD)
            response = client.post(
                "/api/external/investec/accounts/acc-src/transfers",
                json=_transfer_body(),
            )

        assert response.status_code == 202
        body = response.json()
        assert body["id"] == 123
        assert body["status"] == "pending"
        assert body["kind"] == "transfer"
        assert body["expires_at"] == "2026-11-21T12:15:00+00:00"
        added = db.add.call_args.args[0]
        assert added.kind == "transfer"
        assert added.source_account_id == "acc-src"
        assert added.investec_body["profileId"] == "prof-1"
        assert added.investec_body["transferList"][0]["amount"] == "1500.50"
        assert added.display_snapshot["from_name"] == "Daily Account"
        assert added.display_snapshot["to_name"] == "Vehicle Finance"
        assert "to_account_number" not in added.display_snapshot or not added.display_snapshot.get(
            "to_account_number"
        )
        tg_post.assert_called_once()
        call_kwargs = tg_post.call_args
        assert "123:PLAIN/sendMessage" in call_kwargs[0][0] or call_kwargs[0][0].endswith("/sendMessage")
        assert call_kwargs[1]["json"]["chat_id"] == user.telegram_allowed_user_id
        assert call_kwargs[1]["json"]["parse_mode"] == "MarkdownV2"
        keyboard = call_kwargs[1]["json"]["reply_markup"]["inline_keyboard"][0]
        assert keyboard[0]["callback_data"] == "m:123:a"
        assert keyboard[1]["callback_data"] == "m:123:r"
        assert added.telegram_message_id == 555

    def test_rejects_two_transfer_items(self):
        db = MagicMock()
        client = _make_client(db, user=_user_with_telegram())
        body = {
            "transferList": [
                _transfer_body()["transferList"][0],
                _transfer_body()["transferList"][0],
            ]
        }
        with patch("app.routers.external_investec.InvestecService") as MockService:
            response = client.post(
                "/api/external/investec/accounts/acc-src/transfers",
                json=body,
            )
        assert response.status_code == 400
        MockService.assert_not_called()
        db.add.assert_not_called()

    def test_read_only_key_403_no_row(self):
        ro_key, ro_prefix, ro_hash = auth.create_external_api_key_material()
        user = _user_with_telegram()
        user.external_api_key_ro_prefix = ro_prefix
        user.external_api_key_ro_hash = ro_hash
        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [None, user]
        client = _make_client(db, use_auth_dependency=True)

        with patch.object(auth, "verify_password", return_value=True), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            response = client.post(
                "/api/external/investec/accounts/acc-src/transfers",
                json=_transfer_body(),
                headers={"Authorization": f"Bearer {ro_key}"},
            )

        assert response.status_code == 403
        MockService.assert_not_called()
        db.add.assert_not_called()

    def test_missing_telegram_400_no_row(self):
        db = MagicMock()
        client = _make_client(db, user=_user_no_telegram())
        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService:
            response = client.post(
                "/api/external/investec/accounts/acc-src/transfers",
                json=_transfer_body(),
            )
        assert response.status_code == 400
        MockService.assert_not_called()
        db.add.assert_not_called()

    def test_non_numeric_amount_400_no_row_no_telegram(self):
        db = MagicMock()
        client = _make_client(db, user=_user_with_telegram())
        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService, patch(
            "app.routers.external_investec.requests.post"
        ) as tg_post:
            response = client.post(
                "/api/external/investec/accounts/acc-src/transfers",
                json=_transfer_body(amount="not-a-number"),
            )
        assert response.status_code == 400
        MockService.assert_not_called()
        db.add.assert_not_called()
        tg_post.assert_not_called()

    def test_beneficiary_not_own_account_400_no_telegram(self):
        db = MagicMock()
        client = _make_client(db, user=_user_with_telegram())
        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService, patch(
            "app.routers.external_investec.requests.post"
        ) as tg_post:
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (200, ACCOUNTS_PAYLOAD)
            response = client.post(
                "/api/external/investec/accounts/acc-src/transfers",
                json=_transfer_body(beneficiaryAccountId="acc-outside"),
            )
        assert response.status_code == 400
        tg_post.assert_not_called()
        db.add.assert_not_called()

    def test_telegram_send_failure_marks_failed_502(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        captured = []

        def capture_add(movement):
            captured.append(movement)
            _assign_movement_id(movement)

        db.add.side_effect = capture_add
        client = _make_client(db, user=_user_with_telegram())

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService, patch(
            "app.routers.external_investec.requests.post",
            side_effect=requests.RequestException("Telegram down"),
        ):
            mock_svc = MockService.return_value
            mock_svc.request_json.return_value = (200, ACCOUNTS_PAYLOAD)
            response = client.post(
                "/api/external/investec/accounts/acc-src/transfers",
                json=_transfer_body(),
            )

        assert response.status_code == 502
        assert len(captured) == 1
        assert captured[0].status == "failed"
        assert captured[0].failure_reason

    def test_idempotency_key_reuse_returns_200_no_second_telegram(self):
        existing = MagicMock()
        existing.id = 99
        existing.status = "approved"
        existing.kind = "transfer"
        existing.expires_at = datetime(2026, 11, 21, 12, 15, tzinfo=UTC)
        existing.investec_response = None
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = existing
        client = _make_client(db, user=_user_with_telegram())

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.requests.post"
        ) as tg_post:
            response = client.post(
                "/api/external/investec/accounts/acc-src/transfers",
                json=_transfer_body(),
                headers={"Idempotency-Key": "idem-abc"},
            )

        assert response.status_code == 200
        assert response.json()["id"] == 99
        assert response.json()["status"] == "approved"
        tg_post.assert_not_called()
        db.add.assert_not_called()


class TestCreatePayment:
    def test_rejects_two_payment_items(self):
        db = MagicMock()
        client = _make_client(db, user=_user_with_telegram())
        body = {
            "paymentList": [
                _payment_body()["paymentList"][0],
                _payment_body()["paymentList"][0],
            ]
        }
        with patch("app.routers.external_investec.InvestecService") as MockService, patch(
            "app.routers.external_investec.requests.post"
        ) as tg_post:
            response = client.post(
                "/api/external/investec/accounts/acc-src/payments",
                json=body,
            )
        assert response.status_code == 400
        MockService.assert_not_called()
        db.add.assert_not_called()
        tg_post.assert_not_called()

    def test_success_returns_202(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        db.refresh.side_effect = _assign_movement_id
        client = _make_client(db, user=_user_with_telegram())
        telegram_response = MagicMock()
        telegram_response.json.return_value = {
            "ok": True,
            "result": {"message_id": 1, "chat": {"id": 999888777}},
        }
        telegram_response.raise_for_status = MagicMock()

        with patch.object(external_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.external_investec.InvestecService"
        ) as MockService, patch(
            "app.routers.external_investec.requests.post", return_value=telegram_response
        ):
            mock_svc = MockService.return_value
            mock_svc.request_json.side_effect = [
                (200, ACCOUNTS_PAYLOAD),
                (200, BENEFICIARIES_PAYLOAD),
            ]
            response = client.post(
                "/api/external/investec/accounts/acc-src/payments",
                json=_payment_body(),
            )

        assert response.status_code == 202
        assert response.json()["kind"] == "payment"
        added = db.add.call_args.args[0]
        assert added.display_snapshot["to_beneficiary_name"] == "Municipality"
        assert added.investec_body["paymentList"][0]["amount"] == "1500.00"


class TestGetMovement:
    def test_returns_movement_for_owner(self):
        movement = MagicMock()
        movement.id = 5
        movement.user_id = 7
        movement.status = "pending"
        movement.kind = "transfer"
        movement.expires_at = datetime(2026, 11, 21, 12, 15, tzinfo=UTC)
        movement.investec_response = None
        movement.source_account_id = "acc-src"
        movement.display_snapshot = {"amount": "1500.00"}
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = movement
        client = _make_client(db, user=_user_with_telegram())
        response = client.get("/api/external/investec/movements/5")
        assert response.status_code == 200
        assert response.json()["status"] == "pending"
        assert response.json()["id"] == 5

    def test_other_users_movement_404(self):
        movement = MagicMock()
        movement.id = 5
        movement.user_id = 999
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = movement
        client = _make_client(db, user=_user_with_telegram())
        response = client.get("/api/external/investec/movements/5")
        assert response.status_code == 404