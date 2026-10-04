"""Link amount rules for splitting one credit across expenses."""
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.transaction_links import resolve_link_amount


class TestResolveLinkAmount:
    def test_uses_only_the_room_left_on_the_expense(self):
        amount = resolve_link_amount(
            credit_amount=400.0,
            debit_amount=1000.0,
            debit_already_linked=800.0,
        )
        assert amount == 200.0

    def test_requested_amount_above_expense_room_is_rejected(self):
        with pytest.raises(HTTPException) as exc:
            resolve_link_amount(
                credit_amount=400.0,
                debit_amount=1000.0,
                debit_already_linked=800.0,
                requested=400.0,
            )
        assert exc.value.status_code == 400

    def test_second_slice_uses_the_credit_remainder(self):
        amount = resolve_link_amount(
            credit_amount=1500.0,
            debit_amount=500.0,
            credit_already_linked=1000.0,
        )
        assert amount == 500.0

    def test_requested_amount_within_both_limits_is_kept(self):
        amount = resolve_link_amount(
            credit_amount=1500.0,
            debit_amount=1000.0,
            requested=300.0,
        )
        assert amount == 300.0

    def test_fully_allocated_credit_cannot_link_again(self):
        with pytest.raises(HTTPException) as exc:
            resolve_link_amount(
                credit_amount=400.0,
                debit_amount=1000.0,
                credit_already_linked=400.0,
            )
        assert exc.value.status_code == 400
