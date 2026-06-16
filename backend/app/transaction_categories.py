"""Shared transaction category display labels (mirrors frontend transactionCategories.js)."""

EARNINGS_CATEGORIES = {
    "salary",
    "side_income",
    "investment_income",
    "other_income",
}

INCOME_CATEGORIES = EARNINGS_CATEGORIES | {"reimbursements"}

NEUTRAL_CATEGORIES = {"transfers", "refund"}

OFFSET_CATEGORIES = {"refund", "reimbursements"}

# Canonical list of valid classification slugs for transactions and rules.
# Excludes "uncategorized", which is represented as None / empty string.
VALID_TRANSACTION_CATEGORIES = [
    "salary", "side_income", "investment_income", "reimbursements", "other_income",
    "groceries", "household_home", "dining_takeaways", "shopping_clothing",
    "travel_accommodation", "entertainment", "health_wellness", "bills",
    "subscriptions", "transport", "savings", "loan_repayment", "refund", "transfers",
]

_VALID_TRANSACTION_CATEGORIES_SET = set(VALID_TRANSACTION_CATEGORIES)


def is_valid_category(category: str | None) -> bool:
    """True if the category is a recognized classification slug."""
    return category in _VALID_TRANSACTION_CATEGORIES_SET


CATEGORY_LABELS = {
    "income": "Income",
    "salary": "Salary",
    "side_income": "Side Income",
    "investment_income": "Investment Income",
    "refund": "Refund",
    "reimbursements": "Reimbursements",
    "other_income": "Other Income",
    "groceries": "Groceries",
    "household_home": "Household & Home",
    "dining_takeaways": "Dining & Takeaways",
    "shopping_clothing": "Shopping & Clothing",
    "travel_accommodation": "Travel & Accommodation",
    "entertainment": "Entertainment",
    "health_wellness": "Health & Wellness",
    "bills": "Bills",
    "subscriptions": "Subscriptions",
    "transport": "Transport",
    "savings": "Savings",
    "loan_repayment": "Loan Repayment",
    "transfers": "Transfers",
    "uncategorized": "Uncategorized",
}


def category_label(category: str | None) -> str:
    if not category:
        return CATEGORY_LABELS["uncategorized"]
    return CATEGORY_LABELS.get(category, category.replace("_", " ").title())
