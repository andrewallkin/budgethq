"""Unit tests for BudgetHQ Investments 2.0 product-type helpers."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.services.account_product import (  # noqa: E402
    remaining_ra_room,
    suggest_product_type,
)


def test_suggest_living_annuity_has_no_match():
    assert suggest_product_type("Living Annuity", "LA") is None


def test_suggest_tfsa():
    assert suggest_product_type("Tax Free Savings Account", "TFSA") == "tfsa"


def test_suggest_offshore():
    assert suggest_product_type("Offshore Investment", None) == "offshore"


def test_suggest_ra():
    assert suggest_product_type("Retirement Annuity", "RA") == "ra"


def test_suggest_unmatched_is_none():
    assert suggest_product_type("Endowment", "ENDW") is None
    assert suggest_product_type(None, None) is None


def test_remaining_room_none_without_cap():
    assert remaining_ra_room(None, 10000) is None


def test_remaining_room_floors_at_zero():
    assert remaining_ra_room(350000.0, 400000.0) == 0.0


def test_remaining_room_subtracts_fy_contributions():
    assert remaining_ra_room(350000.0, 50000.0) == 300000.0
