"""Unit tests for budget period utilities."""
import sys
from datetime import date
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.budget_period import get_period_dates_for_end_month, get_current_period


class TestGetPeriodDatesForEndMonth:
    """Tests for get_period_dates_for_end_month."""

    def test_calendar_month_start_day_1(self):
        """start_day=1 returns calendar month."""
        from_d, to_d = get_period_dates_for_end_month(2026, 1, 1)
        assert from_d == date(2026, 1, 1)
        assert to_d == date(2026, 1, 31)

    def test_period_ending_jan_2026_start_day_22(self):
        """Period ending Jan 2026 with start_day=22 = Dec 22 2025 - Jan 21 2026."""
        from_d, to_d = get_period_dates_for_end_month(2026, 1, 22)
        assert from_d == date(2025, 12, 22)
        assert to_d == date(2026, 1, 21)

    def test_period_ending_feb_2026_start_day_22(self):
        """Period ending Feb 2026 with start_day=22 = Jan 22 - Feb 21 2026."""
        from_d, to_d = get_period_dates_for_end_month(2026, 2, 22)
        assert from_d == date(2026, 1, 22)
        assert to_d == date(2026, 2, 21)

    def test_period_ending_feb_2025_start_day_31(self):
        """start_day=31 in Feb: period ends Feb 28 (non-leap)."""
        from_d, to_d = get_period_dates_for_end_month(2025, 2, 31)
        assert from_d == date(2025, 1, 31)
        assert to_d == date(2025, 2, 28)

    def test_period_ending_jan_2026_start_day_31(self):
        """start_day=31: period ending Jan = Dec 31 - Jan 30."""
        from_d, to_d = get_period_dates_for_end_month(2026, 1, 31)
        assert from_d == date(2025, 12, 31)
        assert to_d == date(2026, 1, 30)

    def test_start_day_clamped_to_31(self):
        """start_day > 31 is clamped to 31."""
        from_d, to_d = get_period_dates_for_end_month(2026, 1, 99)
        assert from_d == date(2025, 12, 31)
        assert to_d == date(2026, 1, 30)

    def test_start_day_clamped_to_1(self):
        """start_day < 1 is clamped to 1."""
        from_d, to_d = get_period_dates_for_end_month(2026, 1, 0)
        assert from_d == date(2026, 1, 1)
        assert to_d == date(2026, 1, 31)


class TestGetCurrentPeriod:
    """Tests for get_current_period."""

    def test_date_in_period_ending_jan_2026(self):
        """Jan 15 2026 is in period Dec 22 2025 - Jan 21 2026."""
        ref = date(2026, 1, 15)
        from_d, to_d = get_current_period(ref, 22)
        assert from_d == date(2025, 12, 22)
        assert to_d == date(2026, 1, 21)

    def test_date_in_period_ending_feb_2026(self):
        """Jan 25 2026 is in period Jan 22 - Feb 21 2026."""
        ref = date(2026, 1, 25)
        from_d, to_d = get_current_period(ref, 22)
        assert from_d == date(2026, 1, 22)
        assert to_d == date(2026, 2, 21)

    def test_calendar_month_start_day_1(self):
        """start_day=1 returns calendar month containing ref."""
        ref = date(2026, 1, 15)
        from_d, to_d = get_current_period(ref, 1)
        assert from_d == date(2026, 1, 1)
        assert to_d == date(2026, 1, 31)
