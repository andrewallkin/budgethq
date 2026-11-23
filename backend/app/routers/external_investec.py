"""Investec Private Bank proxy and Telegram-queued movements for external API clients."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import requests
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..investec_movement_text import normalize_amount, render_bubble
from ..investec_service import InvestecService
from ..telegram_connection import telegram_failure_text
from ..utils import decrypt_api_key

MOVEMENT_TTL_MINUTES = 15
TELEGRAM_HTTP_TIMEOUT_SECONDS = 30

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/external/investec", tags=["external-investec"])

_DOCS_CANDIDATES = (
    Path(__file__).resolve().parents[2] / "docs" / "external-investec-api.md",
    Path(__file__).resolve().parents[3] / "docs" / "external-investec-api.md",
)


@router.get("/docs", response_class=PlainTextResponse)
async def get_external_investec_docs():
    """Markdown documentation for the external Investec API."""
    for path in _DOCS_CANDIDATES:
        if path.is_file():
            return PlainTextResponse(
                path.read_text(encoding="utf-8"),
                media_type="text/markdown; charset=utf-8",
            )
    raise HTTPException(status_code=404, detail="External Investec API documentation not found")


def _investec_for_user(user: models.User) -> InvestecService:
    if not all([user.investec_client_id, user.investec_client_secret, user.investec_api_key]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Investec credentials not configured",
        )
    return InvestecService(
        decrypt_api_key(user.investec_client_id),
        decrypt_api_key(user.investec_client_secret),
        decrypt_api_key(user.investec_api_key),
    )


def _query_from_request(request: Request) -> dict[str, str]:
    return dict(request.query_params)


def _proxy_json(service: InvestecService, investec_path: str, params: dict[str, str]) -> JSONResponse:
    status_code, body = service.request_json("GET", investec_path, params=params)
    return JSONResponse(status_code=status_code, content=body)


def _named_records(body: Any, key: str) -> list[dict[str, Any]]:
    """Read Investec `data` whether it is a list or an object keyed by `key`."""
    if not isinstance(body, dict):
        return []
    data = body.get("data")
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        items = data.get(key, [])
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
    return []


def _resolve_profile_id(service: InvestecService) -> tuple[Optional[int], Any]:
    status_code, body = service.request_json("GET", "/za/pb/v1/profiles", params={})
    if status_code != 200:
        return status_code, body
    profiles = _named_records(body, "profiles")
    if not profiles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Investec profiles available",
        )
    default = next((p for p in profiles if p.get("defaultProfile")), None)
    chosen = default or profiles[0]
    profile_id = chosen.get("profileId")
    if not profile_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Investec profile id missing",
        )
    return None, profile_id


@router.get("/accounts")
async def list_accounts(
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(service, "/za/pb/v1/accounts", query)


@router.get("/accounts/{account_id}/balance")
async def get_account_balance(
    account_id: str,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service, f"/za/pb/v1/accounts/{account_id}/balance", query
    )


@router.get("/accounts/{account_id}/transactions")
async def list_account_transactions(
    account_id: str,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service, f"/za/pb/v1/accounts/{account_id}/transactions", query
    )


@router.get("/accounts/{account_id}/pending-transactions")
async def list_pending_transactions(
    account_id: str,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service,
        f"/za/pb/v1/accounts/{account_id}/pending-transactions",
        query,
    )


@router.get("/profiles")
async def list_profiles(
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(service, "/za/pb/v1/profiles", query)


@router.get("/profiles/{profile_id}/accounts")
async def list_profile_accounts(
    profile_id: str,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service, f"/za/pb/v1/profiles/{profile_id}/accounts", query
    )


@router.get("/profiles/{profile_id}/accounts/{account_id}/authorisation-setup")
async def get_authorisation_setup(
    profile_id: str,
    account_id: str,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service,
        f"/za/pb/v1/profiles/{profile_id}/accounts/{account_id}/authorisationsetupdetails",
        query,
    )


@router.get("/profiles/{profile_id}/accounts/{account_id}/beneficiaries")
async def list_profile_beneficiaries(
    profile_id: str,
    account_id: str,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service,
        f"/za/pb/v1/profiles/{profile_id}/accounts/{account_id}/beneficiaries",
        query,
    )


@router.get("/beneficiaries")
async def list_beneficiaries(
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    return _proxy_json(service, "/za/pb/v1/accounts/beneficiaries", query)


@router.get("/beneficiary-categories")
async def list_beneficiary_categories(
    profile_id: Optional[str] = Query(default=None, alias="profileId"),
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
    query: dict[str, str] = Depends(_query_from_request),
):
    service = _investec_for_user(current_user)
    params = dict(query)
    if profile_id:
        params["profileId"] = profile_id
    if not profile_id and "profileId" not in params:
        error_status, profile_or_body = _resolve_profile_id(service)
        if error_status is not None:
            return JSONResponse(status_code=error_status, content=profile_or_body)
        params["profileId"] = profile_or_body
    return _proxy_json(service, "/za/pb/v1/accounts/beneficiarycategories", params)


def _telegram_connected(user: models.User) -> bool:
    return bool(user.telegram_bot_token and user.telegram_allowed_user_id)


def _require_telegram(user: models.User) -> None:
    if not _telegram_connected(user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Telegram is not connected",
        )


def _single_list_item(body: dict[str, Any], key: str) -> dict[str, Any]:
    items = body.get(key)
    if not isinstance(items, list) or len(items) != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{key} must contain exactly one item",
        )
    item = items[0]
    if not isinstance(item, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{key} must contain exactly one item",
        )
    return item


def _normalized_amount_field(item: dict[str, Any]) -> str:
    raw = item.get("amount")
    try:
        return normalize_amount(str(raw) if raw is not None else "")
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid amount",
        )


def _accounts_list(service: InvestecService) -> list[dict[str, Any]]:
    status_code, body = service.request_json("GET", "/za/pb/v1/accounts", params={})
    if status_code != 200:
        raise HTTPException(status_code=status_code, detail=body)
    return _named_records(body, "accounts")


def _account_by_id(accounts: list[dict[str, Any]], account_id: str) -> Optional[dict[str, Any]]:
    for account in accounts:
        if str(account.get("accountId")) == str(account_id):
            return account
    return None


def _beneficiaries_list(service: InvestecService) -> list[dict[str, Any]]:
    status_code, body = service.request_json("GET", "/za/pb/v1/accounts/beneficiaries", params={})
    if status_code != 200:
        raise HTTPException(status_code=status_code, detail=body)
    return _named_records(body, "beneficiaries")


def _movement_public(movement: models.InvestecMovement) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": movement.id,
        "status": movement.status,
        "kind": movement.kind,
        "expires_at": movement.expires_at.isoformat(),
    }
    if movement.investec_response is not None:
        payload["investec_response"] = movement.investec_response
    return payload


def _existing_idempotent(
    db: Session,
    user_id: int,
    idempotency_key: Optional[str],
) -> Optional[models.InvestecMovement]:
    if not idempotency_key:
        return None
    return (
        db.query(models.InvestecMovement)
        .filter(
            models.InvestecMovement.user_id == user_id,
            models.InvestecMovement.idempotency_key == idempotency_key,
        )
        .first()
    )


def _telegram_send_pending(
    bot_token: str,
    chat_id: int,
    text: str,
    movement_id: int,
) -> tuple[int, int]:
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    reply_markup = {
        "inline_keyboard": [
            [
                {"text": "Approve", "callback_data": f"m:{movement_id}:a"},
                {"text": "Reject", "callback_data": f"m:{movement_id}:r"},
            ]
        ]
    }
    response = requests.post(
        url,
        json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "MarkdownV2",
            "reply_markup": reply_markup,
        },
        timeout=TELEGRAM_HTTP_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("ok"):
        raise ValueError(payload.get("description") or "Telegram sendMessage failed")
    result = payload["result"]
    return int(result["chat"]["id"]), int(result["message_id"])


def _queue_movement(
    *,
    db: Session,
    user: models.User,
    service: InvestecService,
    source_account_id: str,
    kind: str,
    investec_body: dict[str, Any],
    display_snapshot: dict[str, Any],
    idempotency_key: Optional[str],
) -> JSONResponse:
    existing = _existing_idempotent(db, user.id, idempotency_key)
    if existing is not None:
        return JSONResponse(status_code=status.HTTP_200_OK, content=_movement_public(existing))

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=MOVEMENT_TTL_MINUTES)
    movement = models.InvestecMovement(
        user_id=user.id,
        kind=kind,
        source_account_id=source_account_id,
        investec_body=investec_body,
        display_snapshot=display_snapshot,
        status="pending",
        expires_at=expires_at,
        idempotency_key=idempotency_key,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    logger.info("Queued %s movement %s", kind, movement.id)

    bot_token = decrypt_api_key(user.telegram_bot_token)
    bubble = render_bubble(kind, "pending", display_snapshot)
    try:
        chat_id, message_id = _telegram_send_pending(
            bot_token,
            int(user.telegram_allowed_user_id),
            bubble,
            movement.id,
        )
    except (requests.RequestException, ValueError) as exc:
        reason = telegram_failure_text(exc)
        logger.warning(
            "Telegram approval message failed for movement %s: %s",
            movement.id,
            reason,
        )
        movement.status = "failed"
        movement.failure_reason = reason
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to send Telegram approval message: {reason}",
        ) from exc

    movement.telegram_chat_id = chat_id
    movement.telegram_message_id = message_id
    db.commit()
    logger.info(
        "Sent Telegram approval for movement %s message %s",
        movement.id,
        message_id,
    )
    db.refresh(movement)
    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content=_movement_public(movement),
    )


@router.post("/accounts/{account_id}/transfers")
async def create_transfer(
    account_id: str,
    body: dict[str, Any] = Body(...),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
):
    _require_telegram(current_user)
    existing = _existing_idempotent(db, current_user.id, idempotency_key)
    if existing is not None:
        return JSONResponse(status_code=status.HTTP_200_OK, content=_movement_public(existing))

    item = _single_list_item(body, "transferList")
    amount = _normalized_amount_field(item)

    service = _investec_for_user(current_user)
    accounts = _accounts_list(service)
    source = _account_by_id(accounts, account_id)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source account not found",
        )
    beneficiary_id = item.get("beneficiaryAccountId")
    if not beneficiary_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="beneficiaryAccountId is required",
        )
    dest = _account_by_id(accounts, str(beneficiary_id))
    if dest is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="beneficiaryAccountId must be one of your own accounts",
        )

    profile_id = source.get("profileId")
    if not profile_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Investec profile id missing on source account",
        )

    transfer_item = {
        "beneficiaryAccountId": str(beneficiary_id),
        "amount": amount,
        "myReference": item.get("myReference", ""),
        "theirReference": item.get("theirReference", ""),
    }
    investec_body = {
        "profileId": profile_id,
        "transferList": [transfer_item],
    }
    display_snapshot = {
        "from_name": source.get("referenceName", ""),
        "from_product": source.get("productName", ""),
        "to_name": dest.get("referenceName", ""),
        "to_product": dest.get("productName", ""),
        "amount": amount,
        "my_reference": transfer_item["myReference"],
        "their_reference": transfer_item["theirReference"],
    }
    return _queue_movement(
        db=db,
        user=current_user,
        service=service,
        source_account_id=account_id,
        kind="transfer",
        investec_body=investec_body,
        display_snapshot=display_snapshot,
        idempotency_key=idempotency_key,
    )


@router.post("/accounts/{account_id}/payments")
async def create_payment(
    account_id: str,
    body: dict[str, Any] = Body(...),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_user_from_external_api_key_write),
):
    _require_telegram(current_user)
    existing = _existing_idempotent(db, current_user.id, idempotency_key)
    if existing is not None:
        return JSONResponse(status_code=status.HTTP_200_OK, content=_movement_public(existing))

    item = _single_list_item(body, "paymentList")
    amount = _normalized_amount_field(item)

    service = _investec_for_user(current_user)
    accounts = _accounts_list(service)
    source = _account_by_id(accounts, account_id)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source account not found",
        )

    beneficiary_id = item.get("beneficiaryId")
    if not beneficiary_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="beneficiaryId is required",
        )
    beneficiaries = _beneficiaries_list(service)
    beneficiary = next(
        (b for b in beneficiaries if str(b.get("beneficiaryId")) == str(beneficiary_id)),
        None,
    )
    if beneficiary is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Beneficiary not found",
        )

    profile_id = source.get("profileId")
    if not profile_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Investec profile id missing on source account",
        )

    payment_item = {
        "beneficiaryId": str(beneficiary_id),
        "amount": amount,
        "myReference": item.get("myReference", ""),
        "theirReference": item.get("theirReference", ""),
    }
    investec_body = {
        "profileId": profile_id,
        "paymentList": [payment_item],
    }
    display_snapshot = {
        "from_name": source.get("referenceName", ""),
        "from_product": source.get("productName", ""),
        "to_name": "",
        "to_product": "",
        "to_beneficiary_name": beneficiary.get("name", ""),
        "to_bank": beneficiary.get("bank") or "",
        "to_account_number": beneficiary.get("accountNumber") or "",
        "amount": amount,
        "my_reference": payment_item["myReference"],
        "their_reference": payment_item["theirReference"],
    }
    return _queue_movement(
        db=db,
        user=current_user,
        service=service,
        source_account_id=account_id,
        kind="payment",
        investec_body=investec_body,
        display_snapshot=display_snapshot,
        idempotency_key=idempotency_key,
    )


@router.get("/movements/{movement_id}")
async def get_movement(
    movement_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    movement = (
        db.query(models.InvestecMovement)
        .filter(models.InvestecMovement.id == movement_id)
        .first()
    )
    if movement is None or movement.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movement not found")
    return _movement_public(movement)