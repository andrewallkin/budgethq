"""Scheduler expiry: pending movements and stale approved rows."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import models
from app.investec_movement import STATUS_APPROVED, STATUS_EXPIRED, STATUS_FAILED, STATUS_PENDING
from app.telegram_registration import expire_due_movements

UTC = timezone.utc


class _Query:
    def __init__(self, rows):
        self._rows = list(rows)

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._rows


class _FakeSession:
    def __init__(self, *, pending=None, stale_approved=None):
        self._pending = pending or []
        self._stale_approved = stale_approved or []
        self.committed = False
        self._query_index = 0

    def query(self, _model):
        if self._query_index == 0:
            self._query_index += 1
            return _Query(self._pending)
        return _Query(self._stale_approved)

    def commit(self):
        self.committed = True


def _movement(
    *,
    status=STATUS_PENDING,
    expires_at=None,
    updated_at=None,
    investec_response=None,
    kind="transfer",
):
    movement = MagicMock(spec=models.InvestecMovement)
    movement.status = status
    movement.expires_at = expires_at or datetime(2026, 11, 21, 14, 0, tzinfo=UTC)
    movement.updated_at = updated_at or datetime(2026, 11, 21, 14, 0, tzinfo=UTC)
    movement.investec_response = investec_response
    movement.failure_reason = None
    movement.kind = kind
    movement.display_snapshot = {"amount": "R 100"}
    movement.telegram_chat_id = 1
    movement.telegram_message_id = 2
    return movement


class TestExpireDueMovements:
    def test_expires_due_pending_and_edits_bubble(self):
        now = datetime(2026, 11, 21, 14, 5, tzinfo=UTC)
        due = _movement(
            expires_at=datetime(2026, 11, 21, 14, 0, tzinfo=UTC),
        )
        not_due = _movement(
            expires_at=datetime(2026, 11, 21, 15, 0, tzinfo=UTC),
        )
        db = _FakeSession(pending=[due, not_due])
        edits = []

        def edit_bubble(movement, state):
            edits.append((movement, state))

        expire_due_movements(db, now, edit_bubble)

        assert due.status == STATUS_EXPIRED
        assert not_due.status == STATUS_PENDING
        assert edits == [(due, "expired")]
        assert db.committed

    def test_does_not_edit_when_pending_not_yet_due(self):
        now = datetime(2026, 11, 21, 13, 0, tzinfo=UTC)
        movement = _movement(expires_at=datetime(2026, 11, 21, 14, 0, tzinfo=UTC))
        db = _FakeSession(pending=[movement])
        edits = []

        def edit_bubble(_movement, _state):
            edits.append((_movement, _state))

        expire_due_movements(db, now, edit_bubble)

        assert movement.status == STATUS_PENDING
        assert edits == []

    def test_stale_approved_without_investec_response_becomes_failed(self):
        now = datetime(2026, 11, 21, 14, 10, tzinfo=UTC)
        stuck = _movement(
            status=STATUS_APPROVED,
            updated_at=now - timedelta(minutes=3),
            investec_response=None,
        )
        db = _FakeSession(stale_approved=[stuck])
        edits = []

        def edit_bubble(movement, state):
            edits.append((movement, state))

        expire_due_movements(db, now, edit_bubble)

        assert stuck.status == STATUS_FAILED
        assert stuck.failure_reason == "unclear"
        assert edits == [(stuck, "failed_unconfirmed")]

    def test_now_must_be_timezone_aware(self):
        db = _FakeSession()
        with pytest.raises(ValueError, match="timezone-aware"):
            expire_due_movements(db, datetime(2026, 11, 21, 14, 0), MagicMock())