"""Unit tests for external composition payload builder."""
import sys
from datetime import date, datetime
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.external_composition_service import (  # noqa: E402
    _parse_since_param,
    resolve_since_anchor,
)


class TestSinceAnchorResolution:
    def test_parse_since_param_accepts_timezone_aware_iso(self):
        parsed = _parse_since_param("2026-09-01T08:00:00+02:00")
        assert parsed == datetime(2026, 9, 1, 8, 0, 0)

    def test_parse_since_param_accepts_z_suffix(self):
        parsed = _parse_since_param("2026-09-01T06:00:00Z")
        assert parsed == datetime(2026, 9, 1, 8, 0, 0)

    def test_resolve_since_anchor_uses_parameter_when_provided(self):
        db = MagicMock()
        anchor, source = resolve_since_anchor(db, user_id=1, since_param="2026-09-01T08:00:00+02:00")
        assert anchor == datetime(2026, 9, 1, 8, 0, 0)
        assert source == "parameter"

    def test_resolve_since_anchor_defaults_to_previous_daily_eod(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.scalar.return_value = date(2026, 9, 1)
        anchor, source = resolve_since_anchor(db, user_id=1, since_param=None)
        assert anchor == datetime(2026, 9, 1, 23, 59, 59)
        assert source == "previous_daily_eod"
