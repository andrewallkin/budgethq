import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.investec_movement import (
    STATUS_APPROVED,
    STATUS_EXPIRED,
    STATUS_FAILED,
    STATUS_NEEDS_AUTHORISATION,
    STATUS_PENDING,
    STATUS_REJECTED,
    STATUS_SENT,
    claim,
    settle,
)


UTC = timezone.utc


class Movement:
    """Minimal stand-in for InvestecMovement row (no database)."""

    def __init__(self, status: str = STATUS_PENDING, expires_at: datetime | None = None):
        self.status = status
        if expires_at is None:
            expires_at = datetime(2026, 11, 21, 14, 0, tzinfo=UTC)
        self.expires_at = expires_at


class TestClaimApprove:
    def test_approve_from_pending_before_expiry(self):
        movement = Movement(expires_at=datetime(2026, 11, 21, 15, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 30, tzinfo=UTC)
        assert claim(movement, "approve", now) == STATUS_APPROVED
        assert movement.status == STATUS_APPROVED

    def test_double_approve_is_idempotent(self):
        movement = Movement(expires_at=datetime(2026, 11, 21, 15, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 30, tzinfo=UTC)
        assert claim(movement, "approve", now) == STATUS_APPROVED
        assert claim(movement, "approve", now) == STATUS_APPROVED
        assert movement.status == STATUS_APPROVED

    def test_approve_after_expiry_unchanged(self):
        movement = Movement(expires_at=datetime(2026, 11, 21, 14, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 1, tzinfo=UTC)
        assert claim(movement, "approve", now) == STATUS_PENDING
        assert movement.status == STATUS_PENDING

    def test_approve_from_rejected_unchanged(self):
        movement = Movement(status=STATUS_REJECTED, expires_at=datetime(2026, 11, 21, 15, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 0, tzinfo=UTC)
        assert claim(movement, "approve", now) == STATUS_REJECTED
        assert movement.status == STATUS_REJECTED


class TestClaimReject:
    def test_reject_from_pending_before_expiry(self):
        movement = Movement(expires_at=datetime(2026, 11, 21, 15, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 30, tzinfo=UTC)
        assert claim(movement, "reject", now) == STATUS_REJECTED
        assert movement.status == STATUS_REJECTED

    def test_double_reject_is_idempotent(self):
        movement = Movement(expires_at=datetime(2026, 11, 21, 15, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 30, tzinfo=UTC)
        claim(movement, "reject", now)
        assert claim(movement, "reject", now) == STATUS_REJECTED
        assert movement.status == STATUS_REJECTED


class TestClaimExpire:
    def test_expire_when_due(self):
        movement = Movement(expires_at=datetime(2026, 11, 21, 14, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 0, tzinfo=UTC)
        assert claim(movement, "expire", now) == STATUS_EXPIRED
        assert movement.status == STATUS_EXPIRED

    def test_expire_before_due_unchanged(self):
        movement = Movement(expires_at=datetime(2026, 11, 21, 15, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 59, tzinfo=UTC)
        assert claim(movement, "expire", now) == STATUS_PENDING
        assert movement.status == STATUS_PENDING

    def test_double_expire_is_idempotent(self):
        movement = Movement(expires_at=datetime(2026, 11, 21, 14, 0, tzinfo=UTC))
        now = datetime(2026, 11, 21, 14, 5, tzinfo=UTC)
        assert claim(movement, "expire", now) == STATUS_EXPIRED
        assert claim(movement, "expire", now) == STATUS_EXPIRED
        assert movement.status == STATUS_EXPIRED


class TestSettle:
    def test_sent_from_approved(self):
        movement = Movement(status=STATUS_APPROVED)
        assert settle(movement, "sent") == STATUS_SENT
        assert movement.status == STATUS_SENT

    def test_needs_authorisation_from_approved(self):
        movement = Movement(status=STATUS_APPROVED)
        assert settle(movement, "needs_authorisation") == STATUS_NEEDS_AUTHORISATION
        assert movement.status == STATUS_NEEDS_AUTHORISATION

    def test_failed_from_approved(self):
        movement = Movement(status=STATUS_APPROVED)
        assert settle(movement, "failed") == STATUS_FAILED
        assert movement.status == STATUS_FAILED

    @pytest.mark.parametrize("status", [STATUS_PENDING, STATUS_REJECTED, STATUS_EXPIRED, STATUS_SENT])
    def test_settle_not_from_approved_unchanged(self, status):
        movement = Movement(status=status)
        assert settle(movement, "sent") == status
        assert movement.status == status

    def test_double_settle_is_idempotent(self):
        movement = Movement(status=STATUS_APPROVED)
        assert settle(movement, "sent") == STATUS_SENT
        assert settle(movement, "sent") == STATUS_SENT
        assert movement.status == STATUS_SENT