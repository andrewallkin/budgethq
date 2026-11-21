"""Investec movement row status transitions (claim and settle)."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol


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