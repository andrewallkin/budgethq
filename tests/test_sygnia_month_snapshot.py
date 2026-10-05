"""Current-month Sygnia portfolio value follows the daily scrape."""
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.routers.investments_v2 import _build_monthly_chart_data  # noqa: E402


def _snapshot(record_date: date, portfolio_value: float):
    return SimpleNamespace(record_date=record_date, portfolio_value=portfolio_value)


def _contribution(contribution_date: date, amount: float):
    return SimpleNamespace(contribution_date=contribution_date, amount=amount)


def test_current_month_prefers_daily_scrape_over_future_month_end():
    today = date(2026, 10, 5)
    rows = _build_monthly_chart_data(
        [
            _snapshot(date(2026, 9, 30), 70000),
            _snapshot(date(2026, 10, 4), 80726.72),
            _snapshot(date(2026, 10, 31), 76523.45),
        ],
        [_contribution(date(2026, 10, 3), 5200)],
        today=today,
        as_of_date=date(2026, 10, 4),
    )

    by_month = {row["date"]: row["portfolio_value"] for row in rows}
    assert by_month["2026-09-01"] == 70000
    assert by_month["2026-10-01"] == 80726.72


def test_closed_month_keeps_latest_snapshot_on_or_before_today():
    rows = _build_monthly_chart_data(
        [
            _snapshot(date(2026, 9, 4), 69000),
            _snapshot(date(2026, 9, 30), 70000),
        ],
        [],
        today=date(2026, 10, 5),
        as_of_date=date(2026, 10, 4),
    )

    assert rows[0]["portfolio_value"] == 70000


def test_current_month_without_scrape_keeps_manual_month_end():
    rows = _build_monthly_chart_data(
        [_snapshot(date(2026, 10, 31), 76523.45)],
        [],
        today=date(2026, 10, 5),
        as_of_date=date(2026, 9, 30),
    )

    assert rows[0]["portfolio_value"] == 76523.45
