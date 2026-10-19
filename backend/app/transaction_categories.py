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
    "subscriptions", "transport", "savings", "loan_repayment", "irregular", "refund", "transfers",
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
    "irregular": "Irregular",
    "transfers": "Transfers",
    "uncategorized": "Uncategorized",
}


def category_label(category: str | None) -> str:
    if not category:
        return CATEGORY_LABELS["uncategorized"]
    return CATEGORY_LABELS.get(category, category.replace("_", " ").title())


# Canonical descriptions/examples for each category. The AI categorizer prompt
# and the frontend mirror (frontend/src/utils/transactionCategories.js) echo
# these; this module is the source of truth.
CATEGORY_DESCRIPTIONS = {
    "salary": "Regular salary, wages, employer payments",
    "side_income": "Freelance income, consulting fees, side jobs",
    "investment_income": "Dividends, interest received, rental income",
    "refund": "Merchant refunds, cashbacks, money back from retailers",
    "reimbursements": "Travel per diems, expense claims, friends paying you back for costs you fronted",
    "other_income": "Gifts received, bonuses, miscellaneous windfall credits",
    "groceries": "Food and drink purchased for home — supermarkets, butchers, delis, and fresh produce stores",
    "household_home": "Recurring home costs — electricity, cleaning services, garden supplies, and homeware. Infrequent repairs belong in Irregular",
    "dining_takeaways": "Any food or drink consumed out of home — restaurants, coffee shops, takeaways, Uber Eats, and bar tabs",
    "shopping_clothing": "Retail purchases for personal use — clothing, accessories, homeware décor, and online shopping (Takealot, Temu)",
    "travel_accommodation": "Trip-related costs — Airbnb, hotels, and any accommodation or travel bookings outside daily commuting",
    "entertainment": "Events and leisure for yourself — concert tickets, Webtickets, sports events, and social outings. Gifts belong in Irregular",
    "health_wellness": "Physical health and body maintenance — physio, pharmacy, doctor visits, recovery treatments, and personal care products",
    "bills": "Fixed essential obligations — levies, rates, insurance premiums, medical aid, and bank charges",
    "subscriptions": "Monthly digital and membership services — streaming, phone contracts, gym memberships, and software. Yearly renewals belong in Irregular",
    "transport": "Getting around — fuel, Uber rides, parking, and tolls. Servicing, tyres, licence discs, and repairs belong in Irregular",
    "savings": "Money put to work for the future — TFSA, retirement annuity, unit trusts, and investment contributions",
    "loan_repayment": "Debt servicing — bond repayments, personal loans, and vehicle finance instalments",
    "irregular": "Necessary costs that do not follow a monthly pattern — vehicle maintenance and repairs, yearly renewals, gifts, and other infrequent essentials. Assign this yourself; new transactions stay uncategorized until you do",
    "transfers": "Money movements between your own accounts",
    "uncategorized": "Not yet categorized",
}

CATEGORY_EXAMPLES = {
    "salary": "Payroll, employer deposits",
    "side_income": "Upwork, Fiverr, client payments",
    "investment_income": "Bank interest, dividend credits",
    "refund": "Returns, reversals, cashback",
    "reimbursements": "Per diems, expense claims, friend repayments",
    "other_income": "Bonuses, gifts",
    "groceries": "Woolworths, Pick n Pay, Checkers, Shoprite",
    "household_home": "Eskom, cleaning services, @Home, garden supplies",
    "dining_takeaways": "Restaurants, coffee shops, Uber Eats, Mr D",
    "shopping_clothing": "Takealot, Temu, MRP, clothing stores",
    "travel_accommodation": "Airbnb, hotels, flights",
    "entertainment": "Webtickets, Computicket, concerts, events",
    "health_wellness": "Clicks, Dis-Chem, physio, doctor",
    "bills": "Levies, rates, medical aid, insurance, bank charges",
    "subscriptions": "Netflix, DSTV, Spotify, gym",
    "transport": "Engen, Shell, Uber, Bolt, tolls",
    "savings": "TFSA, RA, unit trusts",
    "loan_repayment": "Home loan, vehicle finance",
    "irregular": "Car service, tyres, licence disc, yearly Google One, birthdays",
    "transfers": "FNB, Capitec, inter-account",
    "uncategorized": "—",
}

BUDGET_TRANSACTION_CATEGORIES = [
    "groceries", "household_home", "dining_takeaways", "shopping_clothing",
    "travel_accommodation", "entertainment", "health_wellness", "bills",
    "subscriptions", "transport", "savings", "loan_repayment", "irregular",
    "transfers", "uncategorized",
]

BUDGET_LINKABLE_CATEGORIES = set(BUDGET_TRANSACTION_CATEGORIES)
