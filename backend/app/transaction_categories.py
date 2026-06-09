"""Shared transaction category display labels (mirrors frontend transactionCategories.js)."""

CATEGORY_LABELS = {
    "income": "Income",
    "salary": "Salary",
    "side_income": "Side Income",
    "investment_income": "Investment Income",
    "refund": "Refund",
    "other_income": "Other Income",
    "groceries_household": "Groceries & Household",
    "bills": "Bills",
    "subscriptions": "Subscriptions",
    "transport": "Transport",
    "lifestyle_misc": "Lifestyle & Misc",
    "savings": "Savings",
    "loan_repayment": "Loan Repayment",
    "transfers": "Transfers",
    "uncategorized": "Uncategorized",
}


def category_label(category: str | None) -> str:
    if not category:
        return CATEGORY_LABELS["uncategorized"]
    return CATEGORY_LABELS.get(category, category.replace("_", " ").title())
