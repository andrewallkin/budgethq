"""Link amount rules for splitting one credit across expenses."""
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from unittest.mock import MagicMock

from app.transaction_links import create_transaction_link, resolve_link_amount


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


class TestCreateTransactionLinkDuplicate:
    def test_duplicate_pair_returns_409_with_existing_link_id(self):
        from unittest.mock import MagicMock

        from app.transaction_links import create_transaction_link

        debit = MagicMock(id=88, amount=-655.0, transaction_type="DEBIT")
        credit = MagicMock(id=9, amount=492.90, transaction_type="CREDIT", category="reimbursements")
        existing_link = MagicMock(id=42, debit_transaction_id=88, credit_transaction_id=9)
        db = MagicMock()

        owned_results = [debit, credit]  # _get_owned_transaction is called debit-first

        def query_side_effect(model):
            q = MagicMock()
            if model.__name__ == "BankTransaction":
                q.filter.return_value.first.side_effect = lambda: owned_results.pop(0)
            else:
                q.filter.return_value.all.return_value = [existing_link]
                q.filter.return_value.with_entities.return_value.all.return_value = []
                q.filter.return_value.first.return_value = existing_link
            return q

        db.query.side_effect = query_side_effect

        with pytest.raises(HTTPException) as exc:
            create_transaction_link(db, 1, debit_transaction_id=88, credit_transaction_id=9)

        assert exc.value.status_code == 409
        assert exc.value.detail["existing_link_id"] == 42

    def test_non_duplicate_link_amounts_still_resolve_normally(self):
        from unittest.mock import MagicMock

        from app.transaction_links import create_transaction_link

        debit = MagicMock(id=88, amount=-655.0, transaction_type="DEBIT")
        credit = MagicMock(id=9, amount=492.90, transaction_type="CREDIT", category="reimbursements")
        db = MagicMock()

        owned_results = [debit, credit]

        def query_side_effect(model):
            q = MagicMock()
            if model.__name__ == "BankTransaction":
                q.filter.return_value.first.side_effect = lambda: owned_results.pop(0)
            else:
                q.filter.return_value.all.return_value = []
                q.filter.return_value.with_entities.return_value.all.return_value = []
            return q

        db.query.side_effect = query_side_effect

        link = create_transaction_link(db, 1, debit_transaction_id=88, credit_transaction_id=9)
        assert link.amount == 492.90  # auto-fit to the smaller side
        db.add.assert_called_once()
