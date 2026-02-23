"""
Budget period utilities for configurable period start day.

Period "Jan 2026" = period that ends in January = Dec 22, 2025 – Jan 21, 2026 (start_day=22).
"""
from calendar import monthrange
from datetime import date, timedelta


def get_period_dates_for_end_month(year: int, month: int, start_day: int) -> tuple[date, date]:
    """
    Return (from_date, to_date) for the period that ends in the given month.

    E.g., (2026, 1, 22) -> (date(2025, 12, 22), date(2026, 1, 21)) (period "Jan 2026")

    start_day: 1-31, day of month when period starts. 1 = calendar month.
    """
    start_day = max(1, min(31, start_day))

    if start_day == 1:
        # Calendar month
        _, last = monthrange(year, month)
        return (date(year, month, 1), date(year, month, last))

    # to_date = (start_day - 1) of end month, capped at last day of month
    _, last_day_of_month = monthrange(year, month)
    end_day = min(start_day - 1, last_day_of_month)
    to_date = date(year, month, end_day)

    # from_date = start_day of previous month, capped at last day if start_day > days in month
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1

    _, last_prev = monthrange(prev_year, prev_month)
    from_day = min(start_day, last_prev)
    from_date = date(prev_year, prev_month, from_day)

    return (from_date, to_date)


def get_current_period(reference_date: date, start_day: int) -> tuple[date, date]:
    """
    Return (from_date, to_date) for the period containing reference_date.
    """
    start_day = max(1, min(31, start_day))

    # Check period ending in ref month, ref month - 1, ref month + 1 (with year wrap)
    candidates = [
        (reference_date.year, reference_date.month),
        (reference_date.year, reference_date.month - 1) if reference_date.month > 1 else (reference_date.year - 1, 12),
        (reference_date.year, reference_date.month + 1) if reference_date.month < 12 else (reference_date.year + 1, 1),
    ]

    for y, m in candidates:
        from_d, to_d = get_period_dates_for_end_month(y, m, start_day)
        if from_d <= reference_date <= to_d:
            return (from_d, to_d)

    # Fallback: calendar month containing reference_date
    _, last = monthrange(reference_date.year, reference_date.month)
    return (date(reference_date.year, reference_date.month, 1), date(reference_date.year, reference_date.month, last))
