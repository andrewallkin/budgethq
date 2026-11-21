"""Investec movement expiry and Telegram webhook startup registration."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Awaitable, Callable

from sqlalchemy.orm import Session

from . import models
from .investec_movement import STATUS_APPROVED, STATUS_EXPIRED, STATUS_FAILED, STATUS_PENDING, claim
from .telegram_connection import register_saved_webhooks

logger = logging.getLogger(__name__)

_RETRY_DELAYS_SECONDS = (30, 60, 300)

SleepFn = Callable[[float], Awaitable[None]]
EditBubbleFn = Callable[[models.InvestecMovement, str], None]


def _require_aware(now: datetime) -> None:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")


def expire_due_movements(db: Session, now: datetime, edit_bubble: EditBubbleFn) -> None:
    """Expire due pending movements and fail stale approved rows with no Investec response."""
    _require_aware(now)

    pending_rows = (
        db.query(models.InvestecMovement)
        .filter(
            models.InvestecMovement.status == STATUS_PENDING,
            models.InvestecMovement.expires_at <= now,
        )
        .all()
    )
    for movement in pending_rows:
        prev = movement.status
        new_status = claim(movement, "expire", now)
        if prev == STATUS_PENDING and new_status == STATUS_EXPIRED:
            logger.info("Expired movement %s", movement.id)
            edit_bubble(movement, "expired")

    stale_cutoff = now - timedelta(minutes=2)
    stuck_rows = (
        db.query(models.InvestecMovement)
        .filter(
            models.InvestecMovement.status == STATUS_APPROVED,
            models.InvestecMovement.investec_response.is_(None),
            models.InvestecMovement.updated_at < stale_cutoff,
        )
        .all()
    )
    for movement in stuck_rows:
        movement.failure_reason = "unclear"
        movement.status = STATUS_FAILED
        logger.warning(
            "Movement %s stayed approved without an Investec response; marked failed",
            movement.id,
        )
        edit_bubble(movement, "failed_unconfirmed")

    if pending_rows or stuck_rows:
        db.commit()


async def ensure_telegram_webhooks(
    load_users,
    public_base_url: str,
    set_webhook,
    sleep: SleepFn,
) -> None:
    """Re-register Telegram webhooks for saved bots; retry on failure."""
    if not public_base_url or not str(public_base_url).strip():
        logger.info(
            "Skipping Telegram webhook registration: public_base_url is not configured"
        )
        return

    attempt = 0
    while True:
        try:
            register_saved_webhooks(load_users(), public_base_url, set_webhook)
            logger.info("Telegram webhooks registered for all saved bots")
            return
        except Exception as exc:
            logger.exception("Telegram webhook registration failed: %s", exc)
            delay = _RETRY_DELAYS_SECONDS[min(attempt, len(_RETRY_DELAYS_SECONDS) - 1)]
            attempt += 1
            await sleep(delay)


def movement_edit_bubble(db: Session, movement: models.InvestecMovement, state: str) -> None:
    """Edit the Telegram approval bubble for a movement (production helper)."""
    from .investec_movement_text import render_bubble
    from .routers.telegram_investec import _edit_bubble
    from .utils import decrypt_api_key

    if movement.telegram_chat_id is None or movement.telegram_message_id is None:
        return

    user = (
        db.query(models.User)
        .filter(models.User.id == movement.user_id)
        .first()
    )
    if user is None or not user.telegram_bot_token:
        return

    bot_token = decrypt_api_key(user.telegram_bot_token)
    text = render_bubble(movement.kind, state, movement.display_snapshot)
    _edit_bubble(
        bot_token,
        int(movement.telegram_chat_id),
        int(movement.telegram_message_id),
        text,
    )