# tests/test_external_budget_api.py
"""Tests for external budget summary/comparison and taxonomy endpoints."""
import sys
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, database, models
from app.routers import external_budget
from app.routers.external import router as investments_router


def _make_client(db: MagicMock, user=None) -> TestClient:
    app = FastAPI()
    app.include_router(external_budget.router, prefix="/api", dependencies=[])
    # investments router included so the write-403 behavior can be probed later if needed
    app.include_router(investments_router, prefix="/api", dependencies=[])

    def override_get_db():
        yield db

    app.dependency_overrides[database.get_db] = override_get_db
    if user is not None:

        async def override_user():
            return user

        app.dependency_overrides[auth.get_user_from_external_api_key] = override_user
    return TestClient(app)


class TestCategoriesEndpoint:
    def test_categories_shape_and_budget_linkable(self):
        client = _make_client(MagicMock(), user=MagicMock(id=1))
        response = client.get("/api/external/categories")
        assert response.status_code == 200
        rows = response.json()["categories"]
        by_slug = {c["slug"]: c for c in rows}
        assert by_slug["groceries"]["group"] == "expense"
        assert "supermarkets" in by_slug["groceries"]["description"]
        assert by_slug["groceries"]["budget_linkable"] is True
        assert by_slug["salary"]["budget_linkable"] is False
        assert by_slug["uncategorized"]["group"] == "neutral"


class TestBudgetSummary:
    def test_summary_splits_excluded_items(self):
        user = MagicMock(id=1)
        income = MagicMock(amount=45000.0, year=2026, month=9, skipped_additional=True)

        budget = MagicMock(id=5, budget_period_start_day=22)
        needs = [
            models.BudgetCategory(id=1, type="needs", name="Groceries", amount=7000.0,
                                  transaction_category="groceries", excluded=False),
            models.BudgetCategory(id=2, type="savings", name="TFSA", amount=4000.0,
                                  transaction_category="savings", excluded=True),
        ]

        budget_query = MagicMock()
        budget_query.filter.return_value.first.return_value = budget
        category_query = MagicMock()
        category_query.filter.return_value.all.return_value = needs

        db = MagicMock()
        # The router queries budget first, then BudgetCategory rows.
        db.query.side_effect = [budget_query, category_query]

        with patch("app.routers.external_budget.monthly_budget_income_for_user", return_value=income), \
             patch("app.routers.external_budget.get_current_period",
                   return_value=(date(2026, 9, 22), date(2026, 10, 21))):
            client = _make_client(db, user=user)
            response = client.get("/api/external/budget/summary")

        assert response.status_code == 200
        body = response.json()
        assert body["income"] == 45000.0 and body["income_skipped_additional"] is True
        assert body["budget_period_start_day"] == 22
        assert body["current_period"]["from_date"] == "2026-09-22"
        assert [i["name"] for i in body["excluded_items"]] == ["TFSA"]
        assert body["expected_totals"]["needs"] == 7000.0
        assert body["expected_totals"]["savings"] == 0.0  # excluded TFSA never contributes


class TestBudgetComparison:
    def test_comparison_delegates_and_matches_service_rows(self):
        user = MagicMock(id=1)
        budget = MagicMock(id=5, budget_period_start_day=1)
        budget_query = MagicMock()
        budget_query.filter.return_value.first.return_value = budget

        class _Row:
            category_key, label = "groceries", "Groceries"
            budgeted, actual, remaining = 7000.0, 7450.50, -450.50

        class _Summary:
            rows = [_Row()]
            total_budgeted, total_spent, remaining = 34200.0, 36100.0, -1900.0
            unlinked_refund_total = 500.0
            unlinked_reimbursement_total = 0.0
            linked_offset_total = 320.0

        db = MagicMock()
        db.query.side_effect = [budget_query]
        txn_query = MagicMock()
        txn_query.all.return_value = []

        with patch("app.routers.external_budget.get_period_dates_for_end_month",
                   return_value=(date(2026, 9, 22), date(2026, 10, 21))), \
             patch("app.routers.external_budget.build_transactions_query", return_value=txn_query), \
             patch("app.routers.external_budget.build_budget_comparison", return_value=_Summary()):
            client = _make_client(db, user=user)
            response = client.get("/api/external/budget/comparison", params={"period": "2026-10"})

        assert response.status_code == 200
        body = response.json()
        assert body["period"]["year"] == 2026 and body["period"]["month"] == 10
        assert body["rows"][0] == {"category_key": "groceries", "label": "Groceries",
                                   "budgeted": 7000.0, "actual": 7450.50, "remaining": -450.50}
        assert body["totals"] == {"budgeted": 34200.0, "spent": 36100.0, "remaining": -1900.0}
        assert body["refunds"]["linked_offset_total"] == 320.0
        # build_budget_comparison received the period transactions
        assert txn_query.all.called

    def test_comparison_no_budget_returns_zeros(self):
        user = MagicMock(id=1)
        budget_query = MagicMock()
        budget_query.filter.return_value.first.return_value = None
        db = MagicMock()
        db.query.side_effect = [budget_query]
        txn_query = MagicMock()
        txn_query.all.return_value = []

        with patch("app.routers.external_budget.get_current_period",
                   return_value=(date(2026, 10, 1), date(2026, 10, 31))), \
             patch("app.routers.external_budget.build_transactions_query", return_value=txn_query), \
             patch("app.routers.external_budget.build_budget_comparison", return_value=None):
            client = _make_client(db, user=user)
            response = client.get("/api/external/budget/comparison")

        body = response.json()
        assert body["rows"] == []
        assert body["totals"] == {"budgeted": 0.0, "spent": 0.0, "remaining": 0.0}
