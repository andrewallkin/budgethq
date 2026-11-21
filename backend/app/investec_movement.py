"""Investec movement row status transitions (claim and settle)."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from . import models


STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_SENT = "sent"
STATUS_NEEDS_AUTHORISATION = "needs_authorisation"
STATUS_REJECTED = "rejected"
STATUS_EXPIRED = "expired"
STATUS_FAILED = "failed"

_CLAIM_TARGETS = {
    "approve": STATUS_APPROVED,
    "reject": STATUS_REJECTED,
    "expire": STATUS_EXPIRED,
}

_SETTLE_TARGETS = {
    "sent": STATUS_SENT,
    "needs_authorisation": STATUS_NEEDS_AUTHORISATION,
    "failed": STATUS_FAILED,
}


class MovementLike(Protocol):
    status: str
    expires_at: datetime


def claim_if_still(db, movement, action: str, now: datetime) -> bool:
    """Claim a pending row with one conditional UPDATE.

    Overlapping approve taps can both read status ``pending``. Only the UPDATE
    that still matches ``status = pending`` (and the expiry predicate) returns
    a row count of 1. That caller is the only one allowed to continue.
    """
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    if movement.status != STATUS_PENDING:
        return False

    target = _CLAIM_TARGETS.get(action)
    if target is None:
        return False

    if action in ("approve", "reject"):
        if movement.expires_at <= now:
            return False
        expiry_clause = models.InvestecMovement.expires_at > now
    elif action == "expire":
        if movement.expires_at > now:
            return False
        expiry_clause = models.InvestecMovement.expires_at <= now
    else:
        return False

    updated = (
        db.query(models.InvestecMovement)
        .filter(
            models.InvestecMovement.id == movement.id,
            models.InvestecMovement.user_id == movement.user_id,
            models.InvestecMovement.status == STATUS_PENDING,
            expiry_clause,
        )
        .update(
            {models.InvestecMovement.status: target},
            synchronize_session=False,
        )
    )
    if updated != 1:
        return False
    movement.status = target
    return True


def claim(movement: MovementLike, action: str, now: datetime) -> str:
    """Apply approve, reject, or expire when the row is still claimable."""
    if movement.status != STATUS_PENDING:
        return movement.status

    target = _CLAIM_TARGETS.get(action)
    if target is None:
        return movement.status

    if action in ("approve", "reject"):
        if movement.expires_at <= now:
            return movement.status
        movement.status = target
        return movement.status

    # expire
    if movement.expires_at > now:
        return movement.status
    movement.status = target
    return movement.status


def settle(movement: MovementLike, outcome: str) -> str:
    """Move from approved to sent, needs_authorisation, or failed."""
    if movement.status != STATUS_APPROVED:
        return movement.status

    target = _SETTLE_TARGETS.get(outcome)
    if target is None:
        return movement.status

    movement.status = target
    return movement.status