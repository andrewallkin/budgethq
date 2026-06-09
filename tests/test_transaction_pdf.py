"""Unit tests for transaction PDF export."""
import sys
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.transaction_budget_summary import BudgetComparisonRow, BudgetComparisonSummary, compute_actual_spending
from app.transaction_categories import category_label
from app.transaction_pdf import ExportTransactionRow, build_transactions_pdf
from app.transaction_query import build_transactions_query, parse_date_param


class SimpleTxn:
    def __init__(self, category, transaction_type, amount):
        self.category = category
        self.transaction_type = transaction_type
        self.amount = amount


class TestCategoryLabel:
    def test_null_category_returns_uncategorized(self):
        assert category_label(None) == "Uncategorized"

    def test_known_category_returns_label(self):
        assert category_label("groceries_household") == "Groceries & Household"

    def test_transfers_label(self):
        assert category_label("transfers") == "Transfers"


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
                category="groceries_household",
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
                        category_key="groceries_household",
                        label="Groceries & Household",
                        budgeted=3000.0,
                        actual=250.50,
                        remaining=2749.50,
                    )
                ],
                total_budgeted=3000.0,
                total_spent=250.50,
                remaining=2749.50,
                refund_credit_total=0.0,
            ),
        )
        assert len(with_budget) > len(base)


class TestComputeActualSpending:
    def test_debits_grouped_by_category(self):
        txns = [
            SimpleTxn("groceries_household", "DEBIT", 100.0),
            SimpleTxn("bills", "DEBIT", 50.0),
            SimpleTxn(None, "DEBIT", 25.0),
        ]
        totals = compute_actual_spending(txns)
        assert totals["groceries_household"] == 100.0
        assert totals["bills"] == 50.0
        assert totals["uncategorized"] == 25.0

    def test_transfers_tracked_separately_from_expense_categories(self):
        txns = [SimpleTxn("transfers", "DEBIT", 500.0)]
        totals = compute_actual_spending(txns)
        assert totals["transfers"] == 500.0
        assert totals["groceries_household"] == 0.0
