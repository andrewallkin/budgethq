"""Unit tests for transaction PDF export and budget summary with links."""
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.transaction_budget_summary import BudgetComparisonRow, BudgetComparisonSummary, compute_actual_spending
from app.transaction_categories import category_label
from app.transaction_links import compute_offset_totals
from app.transaction_pdf import ExportTransactionRow, build_transactions_pdf
from app.transaction_query import build_transactions_query, parse_date_param


class SimpleTxn:
    def __init__(self, category, transaction_type, amount, txn_id=None):
        self.id = txn_id
        self.category = category
        self.transaction_type = transaction_type
        self.amount = amount


class SimpleLink:
    def __init__(self, debit_id, credit_id, amount, debit_category="travel_accommodation"):
        self.debit_transaction_id = debit_id
        self.credit_transaction_id = credit_id
        self.amount = amount
        self._debit_category = debit_category

    @property
    def debit_transaction(self):
        return SimpleTxn(self._debit_category, "DEBIT", 12000.0, self.debit_transaction_id)


class TestCategoryLabel:
    def test_null_category_returns_uncategorized(self):
        assert category_label(None) == "Uncategorized"

    def test_known_category_returns_label(self):
        assert category_label("groceries") == "Groceries"

    def test_transfers_label(self):
        assert category_label("transfers") == "Transfers"

    def test_reimbursements_label(self):
        assert category_label("reimbursements") == "Reimbursements"


class TestParseDateParam:
    def test_valid_date(self):
        result = parse_date_param("2025-03-15", "from_date")
        assert result == datetime(2025, 3, 15)

    def test_invalid_date_raises(self):
        with pytest.raises(ValueError, match="Invalid from_date"):
            parse_date_param("15-03-2025", "from_date")


class TestBuildTransactionsQuery:
    def _mock_db_chain(self):
        db = MagicMock()
        query = MagicMock()
        db.query.return_value = query
        query.filter.return_value = query
        query.order_by.return_value = query
        return db, query

    def test_scopes_to_user(self):
        db, query = self._mock_db_chain()
        build_transactions_query(db, user_id=42)
        db.query.assert_called_once()
        query.filter.assert_called()

    def test_multi_account_filter(self):
        db, query = self._mock_db_chain()
        build_transactions_query(db, user_id=1, account_ids=[2, 3])
        assert query.filter.call_count >= 2

    def test_exclude_transfers_adds_extra_filter(self):
        db, query = self._mock_db_chain()
        build_transactions_query(db, user_id=1, include_transfers=False)
        with_transfers_calls = query.filter.call_count

        db, query = self._mock_db_chain()
        build_transactions_query(db, user_id=1, include_transfers=True)
        without_transfer_filter_calls = query.filter.call_count

        assert with_transfers_calls == without_transfer_filter_calls + 1


class TestBuildTransactionsPdf:
    def _sample_transactions(self, include_account=False):
        return [
            ExportTransactionRow(
                transaction_date=datetime(2025, 1, 10),
                description="WOOLWORTHS",
                amount=250.50,
                transaction_type="DEBIT",
                category="groceries",
                account_name="Primary Account" if include_account else None,
            ),
            ExportTransactionRow(
                transaction_date=datetime(2025, 1, 15),
                description="SALARY DEPOSIT",
                amount=50000.0,
                transaction_type="CREDIT",
                category="salary",
                account_name="Primary Account" if include_account else None,
            ),
        ]

    def test_returns_pdf_bytes(self):
        pdf = build_transactions_pdf(
            from_date="2025-01-01",
            to_date="2025-01-31",
            account_names=["Primary Account"],
            include_transfers=False,
            transactions=self._sample_transactions(),
        )
        assert pdf.startswith(b"%PDF")
        assert len(pdf) > 500

    def test_empty_transactions_still_returns_pdf(self):
        pdf = build_transactions_pdf(
            from_date="2025-01-01",
            to_date="2025-01-31",
            account_names=["Primary Account"],
            include_transfers=True,
            transactions=[],
        )
        assert pdf.startswith(b"%PDF")

    def test_multi_account_export_generates_larger_pdf(self):
        single = build_transactions_pdf(
            from_date="2025-01-01",
            to_date="2025-01-31",
            account_names=["Primary Account"],
            include_transfers=False,
            transactions=self._sample_transactions(),
        )
        multi = build_transactions_pdf(
            from_date="2025-01-01",
            to_date="2025-01-31",
            account_names=["Primary Account", "Savings Account"],
            include_transfers=False,
            transactions=self._sample_transactions(include_account=True),
        )
        assert len(multi) >= len(single)

    def test_pdf_with_budget_summary_is_larger(self):
        base = build_transactions_pdf(
            from_date="2025-01-01",
            to_date="2025-01-31",
            account_names=["Primary Account"],
            include_transfers=False,
            transactions=self._sample_transactions(),
        )
        with_budget = build_transactions_pdf(
            from_date="2025-01-01",
            to_date="2025-01-31",
            account_names=["Primary Account"],
            include_transfers=False,
            transactions=self._sample_transactions(),
            budget_summary=BudgetComparisonSummary(
                rows=[
                    BudgetComparisonRow(
                        category_key="groceries",
                        label="Groceries",
                        budgeted=3000.0,
                        actual=250.50,
                        remaining=2749.50,
                    )
                ],
                total_budgeted=3000.0,
                total_spent=250.50,
                remaining=2749.50,
                unlinked_refund_total=0.0,
                unlinked_reimbursement_total=0.0,
                linked_offset_total=0.0,
                reimbursements_total=0.0,
            ),
        )
        assert len(with_budget) > len(base)

    def test_pdf_with_linked_and_unlinked_offsets(self):
        pdf = build_transactions_pdf(
            from_date="2025-01-01",
            to_date="2025-01-31",
            account_names=["Primary Account"],
            include_transfers=False,
            transactions=self._sample_transactions(),
            budget_summary=BudgetComparisonSummary(
                rows=[],
                total_budgeted=5000.0,
                total_spent=2000.0,
                remaining=3000.0,
                unlinked_refund_total=500.0,
                unlinked_reimbursement_total=0.0,
                linked_offset_total=10000.0,
                reimbursements_total=10000.0,
            ),
        )
        assert pdf.startswith(b"%PDF")


class TestComputeActualSpending:
    def test_debits_grouped_by_category(self):
        txns = [
            SimpleTxn("groceries", "DEBIT", 100.0, 1),
            SimpleTxn("bills", "DEBIT", 50.0, 2),
            SimpleTxn(None, "DEBIT", 25.0, 3),
        ]
        totals = compute_actual_spending(txns)
        assert totals["groceries"] == 100.0
        assert totals["bills"] == 50.0
        assert totals["uncategorized"] == 25.0

    def test_transfers_tracked_separately_from_expense_categories(self):
        txns = [SimpleTxn("transfers", "DEBIT", 500.0, 1)]
        totals = compute_actual_spending(txns)
        assert totals["transfers"] == 500.0
        assert totals["groceries"] == 0.0

    def test_reimbursements_do_not_count_as_earnings(self):
        txns = [
            SimpleTxn("reimbursements", "CREDIT", 2000.0, 1),
            SimpleTxn("salary", "CREDIT", 30000.0, 2),
        ]
        totals = compute_actual_spending(txns)
        assert totals["income"] == 30000.0

    def test_linked_offsets_reduce_category_spend(self):
        txns = [
            SimpleTxn("travel_accommodation", "DEBIT", 12000.0, 1),
            SimpleTxn("reimbursements", "CREDIT", 2000.0, 2),
            SimpleTxn("reimbursements", "CREDIT", 2000.0, 3),
        ]
        links = [
            SimpleLink(1, 2, 2000.0),
            SimpleLink(1, 3, 2000.0),
        ]
        totals = compute_actual_spending(txns, links)
        assert totals["travel_accommodation"] == 8000.0


class TestComputeOffsetTotals:
    def test_unlinked_refund_boosts_envelope(self):
        txns = [
            SimpleTxn("refund", "CREDIT", 500.0, 1),
            SimpleTxn("shopping_clothing", "DEBIT", 2000.0, 2),
        ]
        unlinked_refund, unlinked_reimb, linked, reimbursements = compute_offset_totals(txns, [])
        assert unlinked_refund == 500.0
        assert linked == 0.0

    def test_linked_credits_excluded_from_envelope_boost(self):
        txns = [
            SimpleTxn("travel_accommodation", "DEBIT", 12000.0, 1),
            SimpleTxn("reimbursements", "CREDIT", 2000.0, 2),
        ]
        links = [SimpleLink(1, 2, 2000.0)]
        unlinked_refund, unlinked_reimb, linked, reimbursements = compute_offset_totals(txns, links)
        assert unlinked_reimb == 0.0
        assert linked == 2000.0
        assert reimbursements == 2000.0
