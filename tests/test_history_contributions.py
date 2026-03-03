"""Unit tests for TFSA contribution calculations in history module."""
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import models  # noqa: E402
from app.history import calculate_total_contributions  # noqa: E402


def create_test_session():
    """Create an isolated in-memory DB session for each test."""
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def create_test_user(db):
    """Create and persist a minimal user row."""
    user = models.User(username="test-user", hashed_password="hashed")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_calculate_total_contributions_excludes_previous_fy_after_rollover():
    """After FY rollover, previous FY deposits are not included."""
    db = create_test_session()
    user = create_test_user(db)

    db.add(models.TFSAHistoricalContribution(
        user_id=user.id,
        financial_year="2024/25",
        amount=100000.0
    ))

    # Previous FY (2025/26) deposit should not count in FY 2026/27 as_of.
    db.add(models.TFSADeposit(
        user_id=user.id,
        amount=12000.0,
        deposit_date=date(2026, 2, 20),
        financial_year_start=2025
    ))

    # Current FY (2026/27) deposit should count.
    db.add(models.TFSADeposit(
        user_id=user.id,
        amount=3000.0,
        deposit_date=date(2026, 3, 5),
        financial_year_start=2026
    ))
    db.commit()

    total = calculate_total_contributions(db, user.id, as_of_date=date(2026, 3, 10))
    assert total == 103000.0


def test_calculate_total_contributions_respects_as_of_date_within_same_fy():
    """Only deposits up to as_of_date are included in the current FY."""
    db = create_test_session()
    user = create_test_user(db)

    db.add(models.TFSAHistoricalContribution(
        user_id=user.id,
        financial_year="2024/25",
        amount=50000.0
    ))

    db.add(models.TFSADeposit(
        user_id=user.id,
        amount=1500.0,
        deposit_date=date(2026, 3, 1),
        financial_year_start=2026
    ))
    db.add(models.TFSADeposit(
        user_id=user.id,
        amount=2500.0,
        deposit_date=date(2026, 4, 15),
        financial_year_start=2026
    ))
    db.commit()

    total = calculate_total_contributions(db, user.id, as_of_date=date(2026, 3, 20))
    assert total == 51500.0


def test_calculate_total_contributions_historical_plus_current_fy_only():
    """Totals should be historical sum plus current FY deposits only."""
    db = create_test_session()
    user = create_test_user(db)

    db.add_all([
        models.TFSAHistoricalContribution(
            user_id=user.id,
            financial_year="2023/24",
            amount=33000.0
        ),
        models.TFSAHistoricalContribution(
            user_id=user.id,
            financial_year="2024/25",
            amount=36000.0
        ),
    ])

    db.add_all([
        # Previous FY - excluded
        models.TFSADeposit(
            user_id=user.id,
            amount=2000.0,
            deposit_date=date(2026, 2, 10),
            financial_year_start=2025
        ),
        # Current FY - included
        models.TFSADeposit(
            user_id=user.id,
            amount=1000.0,
            deposit_date=date(2026, 3, 3),
            financial_year_start=2026
        ),
        models.TFSADeposit(
            user_id=user.id,
            amount=2000.0,
            deposit_date=date(2026, 7, 3),
            financial_year_start=2026
        ),
    ])
    db.commit()

    total = calculate_total_contributions(db, user.id, as_of_date=date(2026, 7, 31))
    assert total == 72000.0


def test_calculate_total_contributions_handles_legacy_null_financial_year_start():
    """Legacy deposits with null financial_year_start are matched by deposit_date bounds."""
    db = create_test_session()
    user = create_test_user(db)

    db.add(models.TFSAHistoricalContribution(
        user_id=user.id,
        financial_year="2024/25",
        amount=40000.0
    ))

    db.add_all([
        # Legacy null FY in active FY window - included
        models.TFSADeposit(
            user_id=user.id,
            amount=900.0,
            deposit_date=date(2026, 3, 2),
            financial_year_start=None
        ),
        # Legacy null FY outside active FY window - excluded
        models.TFSADeposit(
            user_id=user.id,
            amount=1100.0,
            deposit_date=date(2026, 2, 28),
            financial_year_start=None
        ),
    ])
    db.commit()

    total = calculate_total_contributions(db, user.id, as_of_date=date(2026, 3, 31))
    assert total == 40900.0


def test_calculate_total_contributions_ignores_incorrect_financial_year_metadata():
    """Deposit date boundaries win even when financial_year_start is wrong."""
    db = create_test_session()
    user = create_test_user(db)

    db.add(models.TFSAHistoricalContribution(
        user_id=user.id,
        financial_year="2024/25",
        amount=80000.0
    ))

    db.add_all([
        # Date is previous FY, but metadata is incorrectly current FY -> exclude.
        models.TFSADeposit(
            user_id=user.id,
            amount=5000.0,
            deposit_date=date(2026, 2, 25),
            financial_year_start=2026
        ),
        # Date is current FY, but metadata is incorrectly previous FY -> include.
        models.TFSADeposit(
            user_id=user.id,
            amount=2500.0,
            deposit_date=date(2026, 3, 2),
            financial_year_start=2025
        ),
    ])
    db.commit()

    total = calculate_total_contributions(db, user.id, as_of_date=date(2026, 3, 15))
    assert total == 82500.0


def test_calculate_total_contributions_excludes_current_fy_historical_rows():
    """Historical entries matching active FY should not be double-counted."""
    db = create_test_session()
    user = create_test_user(db)

    db.add_all([
        # Previous FY historical - included
        models.TFSAHistoricalContribution(
            user_id=user.id,
            financial_year="2025/26",
            amount=120000.0
        ),
        # Active FY historical - excluded from historical_total
        models.TFSAHistoricalContribution(
            user_id=user.id,
            financial_year="2026/27",
            amount=36000.0
        ),
    ])

    db.add(models.TFSADeposit(
        user_id=user.id,
        amount=5000.0,
        deposit_date=date(2026, 3, 10),
        financial_year_start=2026
    ))
    db.commit()

    total = calculate_total_contributions(db, user.id, as_of_date=date(2026, 3, 31))
    assert total == 125000.0
