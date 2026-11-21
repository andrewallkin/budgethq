"""Telegram webhook for Investec movement approve / reject."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import database, models
from ..investec_movement import (
    STATUS_APPROVED,
    STATUS_PENDING,
    STATUS_REJECTED,
    claim,
    settle,
)
from ..investec_movement_text import render_bubble
from ..investec_service import InvestecService
from ..utils import decrypt_api_key

logger = logging.getLogger(__name__)

TELEGRAM_HTTP_TIMEOUT_SECONDS = 30
_CALLBACK_RE = re.compile(r"^m:(\d+):([ar])$")

router = APIRouter(prefix="/telegram/investec", tags=["telegram-investec"])


def _investec_for_user(user: models.User) -> InvestecService:
    return InvestecService(
        decrypt_api_key(user.investec_client_id),
        decrypt_api_key(user.investec_client_secret),
        decrypt_api_key(user.investec_api_key),
    )


def _telegram_api(bot_token: str, method: str, payload: dict[str, Any]) -> None:
    url = f"https://api.telegram.org/bot{bot_token}/{method}"
    try:
        response = requests.post(url, json=payload, timeout=TELEGRAM_HTTP_TIMEOUT_SECONDS)
        response.raise_for_status()
        body = response.json()
        if not body.get("ok"):
            logger.warning("Telegram %s failed: %s", method, body.get("description"))
    except requests.RequestException as exc:
        logger.warning("Telegram %s request error: %s", method, exc)


def _edit_bubble(
    bot_token: str,
    chat_id: int,
    message_id: int,
    text: str,
) -> None:
    _telegram_api(
        bot_token,
        "editMessageText",
        {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "MarkdownV2",
        },
    )


def _answer_callback(bot_token: str, callback_query_id: str) -> None:
    _telegram_api(bot_token, "answerCallbackQuery", {"callback_query_id": callback_query_id})


def _parse_callback(data: str) -> tuple[int, str] | None:
    match = _CALLBACK_RE.match(data or "")
    if not match:
        return None
    return int(match.group(1)), match.group(2)


def _investec_post_path(kind: str, source_account_id: str) -> str:
    if kind == "payment":
        return f"/za/pb/v1/accounts/{source_account_id}/paymultiple"
    return f"/za/pb/v1/accounts/{source_account_id}/transfermultiple"


def _authorisation_required(body: Any) -> bool:
    if not isinstance(body, dict):
        return False
    data = body.get("data")
    if isinstance(data, dict) and "AuthorisationRequired" in data:
        return bool(data["AuthorisationRequired"])
    return bool(body.get("AuthorisationRequired"))


def _investec_reference(body: Any) -> Optional[str]:
    if not isinstance(body, dict):
        return None
    data = body.get("data")
    if not isinstance(data, dict):
        data = body
    for key in ("reference", "paymentReference", "transactionReference"):
        value = data.get(key)
        if value:
            return str(value)
    return None


def _account_balance(
    service: InvestecService, account_id: str
) -> Optional[dict[str, float]]:
    status_code, body = service.request_json(
        "GET", f"/za/pb/v1/accounts/{account_id}/balance"
    )
    if status_code != 200 or not isinstance(body, dict):
        return None
    data = body.get("data")
    if not isinstance(data, dict):
        return None
    try:
        return {
            "current": float(data["currentBalance"]),
            "available": float(data["availableBalance"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


def _fetch_balances(
    service: InvestecService, movement: models.InvestecMovement
) -> Optional[dict[str, float]]:
    source = _account_balance(service, movement.source_account_id)
    if source is None:
        return None
    balances: dict[str, float] = {
        "from_current": source["current"],
        "from_available": source["available"],
    }
    if movement.kind == "transfer":
        body = movement.investec_body or {}
        transfer_list = body.get("transferList") or []
        if not transfer_list:
            return None
        dest_id = str(transfer_list[0].get("beneficiaryAccountId", ""))
        if not dest_id:
            return None
        dest = _account_balance(service, dest_id)
        if dest is None:
            return None
        balances["to_current"] = dest["current"]
        balances["to_available"] = dest["available"]
    return balances


def _execute_investec(
    *,
    db: Session,
    user: models.User,
    movement: models.InvestecMovement,
    bot_token: str,
) -> None:
    service = _investec_for_user(user)
    endpoint = _investec_post_path(movement.kind, movement.source_account_id)
    render_state = "failed_unconfirmed"
    balances: Optional[dict[str, float]] = None
    investec_reference: Optional[str] = None

    try:
        status_code, response_body = service.request_json(
            "POST", endpoint, json=movement.investec_body
        )
    except Exception as exc:
        movement.failure_reason = str(exc)
        settle(movement, "failed")
        db.commit()
        if movement.telegram_chat_id and movement.telegram_message_id:
            text = render_bubble(movement.kind, render_state, movement.display_snapshot)
            _edit_bubble(
                bot_token,
                int(movement.telegram_chat_id),
                int(movement.telegram_message_id),
                text,
            )
        return

    movement.investec_response = response_body if isinstance(response_body, dict) else None

    if 200 <= status_code < 300:
        if _authorisation_required(response_body):
            settle(movement, "needs_authorisation")
            render_state = "needs_authorisation"
        else:
            settle(movement, "sent")
            render_state = "sent"
            investec_reference = _investec_reference(response_body)
            try:
                balances = _fetch_balances(service, movement)
            except Exception:
                balances = None
    else:
        movement.failure_reason = f"Investec HTTP {status_code}"
        settle(movement, "failed")
        render_state = "failed"

    db.commit()
    if movement.telegram_chat_id and movement.telegram_message_id:
        text = render_bubble(
            movement.kind,
            render_state,
            movement.display_snapshot,
            balances=balances,
            investec_reference=investec_reference,
        )
        _edit_bubble(
            bot_token,
            int(movement.telegram_chat_id),
            int(movement.telegram_message_id),
            text,
        )


@router.post("/webhook/{secret}")
async def telegram_investec_webhook(
    secret: str,
    update: dict[str, Any],
    db: Session = Depends(database.get_db),
) -> dict[str, bool]:
    user = (
        db.query(models.User)
        .filter(models.User.telegram_webhook_secret == secret)
        .first()
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    callback = update.get("callback_query")
    if not isinstance(callback, dict):
        return {"ok": True}

    from_user = callback.get("from") or {}
    sender_id = from_user.get("id")
    if sender_id is None or int(sender_id) != int(user.telegram_allowed_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    parsed = _parse_callback(str(callback.get("data") or ""))
    if parsed is None:
        return {"ok": True}

    movement_id, action_code = parsed
    movement = (
        db.query(models.InvestecMovement)
        .filter(
            models.InvestecMovement.id == movement_id,
            models.InvestecMovement.user_id == user.id,
        )
        .first()
    )
    if movement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movement not found")

    bot_token = decrypt_api_key(user.telegram_bot_token)
    callback_id = str(callback.get("id", ""))
    now = datetime.now(timezone.utc)

    action = "approve" if action_code == "a" else "reject"
    prev_status = movement.status
    new_status = claim(movement, action, now)

    transitioned_approve = prev_status == STATUS_PENDING and new_status == STATUS_APPROVED
    transitioned_reject = prev_status == STATUS_PENDING and new_status == STATUS_REJECTED

    if transitioned_approve or transitioned_reject:
        db.commit()
        chat_id = movement.telegram_chat_id
        message_id = movement.telegram_message_id
        if chat_id is not None and message_id is not None:
            bubble_state = "approved" if transitioned_approve else "rejected"
            text = render_bubble(movement.kind, bubble_state, movement.display_snapshot)
            _edit_bubble(bot_token, int(chat_id), int(message_id), text)

    if transitioned_approve:
        _execute_investec(db=db, user=user, movement=movement, bot_token=bot_token)

    if callback_id:
        _answer_callback(bot_token, callback_id)

    return {"ok": True}