"""Tests for Telegram Investec approval webhook."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import database, models
from app.investec_movement import STATUS_APPROVED, STATUS_FAILED, STATUS_PENDING, STATUS_REJECTED
from app.routers import telegram_investec

UTC = timezone.utc
WEBHOOK_SECRET = "whsec-test-abc"
ALLOWED_CHAT = 42424242
CALLBACK_ID = "cq-1"


def _user():
    user = MagicMock(spec=models.User)
    user.id = 7
    user.telegram_webhook_secret = WEBHOOK_SECRET
    user.telegram_allowed_user_id = ALLOWED_CHAT
    user.telegram_bot_token = "enc_bot"
    user.investec_client_id = "enc_c"
    user.investec_client_secret = "enc_s"
    user.investec_api_key = "enc_k"
    return user


def _movement(**overrides):
    movement = MagicMock(spec=models.InvestecMovement)
    movement.id = 123
    movement.user_id = 7
    movement.kind = "transfer"
    movement.source_account_id = "acc-src"
    movement.status = STATUS_PENDING
    movement.expires_at = datetime(2026, 11, 21, 14, 0, tzinfo=UTC)
    movement.telegram_chat_id = ALLOWED_CHAT
    movement.telegram_message_id = 555
    movement.investec_body = {
        "profileId": "prof-1",
        "transferList": [
            {
                "beneficiaryAccountId": "acc-dest",
                "amount": "1500.00",
                "myReference": "x",
                "theirReference": "y",
            }
        ],
    }
    movement.display_snapshot = {
        "from_name": "Daily",
        "from_product": "Private Bank",
        "to_name": "Vehicle",
        "to_product": "Loan",
        "amount": "1500.00",
        "my_reference": "x",
        "their_reference": "y",
    }
    movement.investec_response = None
    movement.failure_reason = None
    for key, value in overrides.items():
        setattr(movement, key, value)
    return movement


def _payment_movement():
    m = _movement(kind="payment")
    m.investec_body = {
        "profileId": "prof-1",
        "paymentList": [
            {
                "beneficiaryId": "ben-1",
                "amount": "500.00",
                "myReference": "Rates",
                "theirReference": "Ref",
            }
        ],
    }
    m.display_snapshot = {
        "from_name": "Daily",
        "from_product": "Private Bank",
        "to_beneficiary_name": "Municipality",
        "to_bank": "Standard Bank",
        "to_account_number": "051001234567890",
        "amount": "500.00",
        "my_reference": "Rates",
        "their_reference": "Ref",
    }
    return m


def _callback_update(action="a", from_id=ALLOWED_CHAT, movement_id=123):
    return {
        "update_id": 1,
        "callback_query": {
            "id": CALLBACK_ID,
            "from": {"id": from_id},
            "message": {"message_id": 555, "chat": {"id": ALLOWED_CHAT}},
            "data": f"m:{movement_id}:{action}",
        },
    }


def _make_client(db):
    app = FastAPI()
    app.include_router(telegram_investec.router, prefix="/api")

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db
    return TestClient(app)


def _setup_db(user, movement):
    db = MagicMock()

    def query_model(model):
        chain = MagicMock()
        if model is models.User:
            chain.filter.return_value.first.return_value = user
        elif model is models.InvestecMovement:
            chain.filter.return_value.first.return_value = movement

        def do_update(values, synchronize_session=False):
            if movement.status != STATUS_PENDING:
                return 0
            movement.status = next(iter(values.values()))
            return 1

        chain.filter.return_value.update.side_effect = do_update
        return chain

    db.query.side_effect = query_model
    return db


def _tg_ok():
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"ok": True}
    return response


def _balance_payload(current, available):
    return 200, {"data": {"currentBalance": current, "availableBalance": available}}


class TestWebhookAuth:
    def test_unknown_secret_returns_404(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        client = _make_client(db)
        response = client.post(
            f"/api/telegram/investec/webhook/unknown",
            json=_callback_update(),
        )
        assert response.status_code == 404

    def test_wrong_sender_returns_403_no_investec(self):
        user = _user()
        movement = _movement()
        db = _setup_db(user, movement)
        client = _make_client(db)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc:
            response = client.post(
                f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}",
                json=_callback_update(from_id=99999),
            )
        assert response.status_code == 403
        MockSvc.assert_not_called()


class TestApproveOnce:
    def test_two_approves_call_investec_once(self):
        user = _user()
        movement = _movement()
        db = _setup_db(user, movement)
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ) as tg_post, patch(
            "app.routers.telegram_investec.datetime"
        ) as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            mock_svc = MockSvc.return_value
            mock_svc.request_json.side_effect = [
                (200, {"data": {"AuthorisationRequired": False, "reference": "INV-REF-99"}}),
                *_balance_payload(10000, 9000),
                *_balance_payload(5000, 4500),
            ]

            path = f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}"
            r1 = client.post(path, json=_callback_update(action="a"))
            r2 = client.post(path, json=_callback_update(action="a"))

        assert r1.status_code == 200
        assert r2.status_code == 200
        post_calls = [
            c
            for c in mock_svc.request_json.call_args_list
            if c[0][0] == "POST"
        ]
        assert len(post_calls) == 1
        assert post_calls[0][0][1].endswith("/transfermultiple")
        assert tg_post.call_count >= 2

    def test_overlapping_approves_one_update_wins(self):
        """Two callbacks that both still see pending in memory: only one Investec POST."""
        user = _user()
        rows = [_movement(), _movement()]
        seen = {"i": 0}
        wins = {"n": 0}
        db = MagicMock()

        def query_model(model):
            chain = MagicMock()
            if model is models.User:
                chain.filter.return_value.first.return_value = user
            elif model is models.InvestecMovement:
                def first_row():
                    row = rows[min(seen["i"], len(rows) - 1)]
                    seen["i"] += 1
                    return row

                chain.filter.return_value.first.side_effect = first_row

                def do_update(values, synchronize_session=False):
                    wins["n"] += 1
                    return 1 if wins["n"] == 1 else 0

                chain.filter.return_value.update.side_effect = do_update
            return chain

        db.query.side_effect = query_model
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ), patch("app.routers.telegram_investec.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            mock_svc = MockSvc.return_value
            mock_svc.request_json.side_effect = [
                (200, {"data": {"AuthorisationRequired": False, "reference": "INV-REF-99"}}),
                *_balance_payload(10000, 9000),
                *_balance_payload(5000, 4500),
            ]
            path = f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}"
            r1 = client.post(path, json=_callback_update(action="a"))
            r2 = client.post(path, json=_callback_update(action="a"))

        assert r1.status_code == 200
        assert r2.status_code == 200
        assert rows[0].status == "sent"
        assert rows[1].status == STATUS_PENDING
        post_calls = [c for c in mock_svc.request_json.call_args_list if c[0][0] == "POST"]
        assert len(post_calls) == 1


class TestReject:
    def test_reject_does_not_call_investec(self):
        user = _user()
        movement = _movement()
        db = _setup_db(user, movement)
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ), patch("app.routers.telegram_investec.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            response = client.post(
                f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}",
                json=_callback_update(action="r"),
            )
        assert response.status_code == 200
        assert movement.status == STATUS_REJECTED
        MockSvc.assert_not_called()


class TestExpired:
    def test_expired_row_approve_no_investec(self):
        user = _user()
        movement = _movement(status="expired")
        db = _setup_db(user, movement)
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ), patch("app.routers.telegram_investec.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            response = client.post(
                f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}",
                json=_callback_update(action="a"),
            )
        assert response.status_code == 200
        MockSvc.assert_not_called()


class TestInvestecOutcomes:
    def test_authorisation_required_no_balance_reads(self):
        user = _user()
        movement = _movement()
        db = _setup_db(user, movement)
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ) as tg_post, patch("app.routers.telegram_investec.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            mock_svc = MockSvc.return_value
            mock_svc.request_json.return_value = (
                200,
                {"data": {"AuthorisationRequired": True}},
            )
            response = client.post(
                f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}",
                json=_callback_update(action="a"),
            )
        assert response.status_code == 200
        assert movement.status == "needs_authorisation"
        assert mock_svc.request_json.call_count == 1
        get_calls = [c for c in mock_svc.request_json.call_args_list if c[0][0] == "GET"]
        assert get_calls == []

    def test_investec_http_error_sets_failed(self):
        user = _user()
        movement = _movement()
        db = _setup_db(user, movement)
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ) as tg_post, patch("app.routers.telegram_investec.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            mock_svc = MockSvc.return_value
            mock_svc.request_json.return_value = (400, {"error": "bad"})
            response = client.post(
                f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}",
                json=_callback_update(action="a"),
            )
        assert response.status_code == 200
        assert movement.status == STATUS_FAILED
        texts = [
            c.kwargs["json"]["text"]
            for c in tg_post.call_args_list
            if c.kwargs.get("json") and "text" in c.kwargs["json"]
        ]
        assert any("Transfer failed" in t for t in texts)

    def test_investec_exception_sets_failed_unconfirmed_bubble(self):
        user = _user()
        movement = _movement()
        db = _setup_db(user, movement)
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ) as tg_post, patch("app.routers.telegram_investec.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            mock_svc = MockSvc.return_value
            mock_svc.request_json.side_effect = requests.Timeout("timed out")
            client.post(
                f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}",
                json=_callback_update(action="a"),
            )
        assert movement.status == STATUS_FAILED
        texts = []
        for call in tg_post.call_args_list:
            payload = call.kwargs.get("json") if call.kwargs else None
            if payload and "text" in payload:
                texts.append(payload["text"])
        assert any("Nothing further will be sent" in t for t in texts)

    def test_sent_with_balances(self):
        user = _user()
        movement = _movement()
        db = _setup_db(user, movement)
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ) as tg_post, patch("app.routers.telegram_investec.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            mock_svc = MockSvc.return_value
            mock_svc.request_json.side_effect = [
                (200, {"data": {"AuthorisationRequired": False, "reference": "INV-1"}}),
                *_balance_payload(10000, 9000),
                *_balance_payload(5000, 4500),
            ]
            client.post(
                f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}",
                json=_callback_update(action="a"),
            )
        assert movement.status == "sent"
        texts = [
            c.kwargs["json"]["text"]
            for c in tg_post.call_args_list
            if c.kwargs.get("json") and "text" in c.kwargs["json"]
        ]
        assert any("Transfer sent" in t for t in texts)
        assert any("INV-1" in t or "INV\\-1" in t for t in texts)

    def test_balance_failure_still_sent(self):
        user = _user()
        movement = _movement()
        db = _setup_db(user, movement)
        client = _make_client(db)
        fixed_now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        with patch.object(telegram_investec, "decrypt_api_key", side_effect=lambda x: x), patch(
            "app.routers.telegram_investec.InvestecService"
        ) as MockSvc, patch(
            "app.routers.telegram_investec.requests.post", return_value=_tg_ok()
        ) as tg_post, patch("app.routers.telegram_investec.datetime") as mock_dt:
            mock_dt.now.return_value = fixed_now
            mock_dt.side_effect = lambda *a, **k: datetime(*a, **k)
            mock_svc = MockSvc.return_value
            mock_svc.request_json.side_effect = [
                (200, {"data": {"AuthorisationRequired": False, "reference": "R1"}}),
                (503, {}),
                (503, {}),
            ]
            client.post(
                f"/api/telegram/investec/webhook/{WEBHOOK_SECRET}",
                json=_callback_update(action="a"),
            )
        assert movement.status == "sent"
        texts = [
            c.kwargs["json"]["text"]
            for c in tg_post.call_args_list
            if c.kwargs.get("json") and "text" in c.kwargs["json"]
        ]
        assert any("Balance unavailable" in t for t in texts)