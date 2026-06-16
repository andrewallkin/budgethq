/**
 * Shared transaction category constants for Investec integration.
 * Used by Budget Dashboard, Budget Analysis, and Categorization Rules.
 */

export const EARNINGS_CATEGORIES = ['salary', 'side_income', 'investment_income', 'other_income']
export const INCOME_CATEGORIES = [...EARNINGS_CATEGORIES, 'reimbursements']
export const NEUTRAL_CATEGORIES = ['transfers', 'refund']
/** Credits that offset prior debits (refunds, reimbursements) — excluded from earnings */
export const OFFSET_CATEGORIES = ['refund', 'reimbursements']
export const EXPENSE_CATEGORIES = [
    'groceries',
    'household_home',
    'dining_takeaways',
    'shopping_clothing',
    'travel_accommodation',
    'entertainment',
    'health_wellness',
    'bills',
    'subscriptions',
    'transport',
    'savings',
    'loan_repayment',
]
export const CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...NEUTRAL_CATEGORIES]

/** Categories that budget entries can map to (expense + transfers + uncategorized) */
export const BUDGET_TRANSACTION_CATEGORIES = [...EXPENSE_CATEGORIES, 'transfers', 'uncategorized']

/** Budget cadence options for a budget line item */
export const BUDGET_CADENCES = ['monthly', 'annual', 'tracking']
export const CADENCE_LABELS = {
    monthly: 'Monthly',
    annual: 'Annual',
    tracking: 'Tracking only',
}

export const CATEGORY_LABELS = {
    income: 'Income',
    salary: 'Salary',
    side_income: 'Side Income',
    investment_income: 'Investment Income',
    refund: 'Refund',
    reimbursements: 'Reimbursements',
    other_income: 'Other Income',
    groceries: 'Groceries',
    household_home: 'Household & Home',
    dining_takeaways: 'Dining & Takeaways',
    shopping_clothing: 'Shopping & Clothing',
    travel_accommodation: 'Travel & Accommodation',
    entertainment: 'Entertainment',
    health_wellness: 'Health & Wellness',
    bills: 'Bills',
    subscriptions: 'Subscriptions',
    transport: 'Transport',
    savings: 'Savings',
    loan_repayment: 'Loan Repayment',
    transfers: 'Transfers',
    uncategorized: 'Uncategorized'
}

export const CATEGORY_COLORS = {
    income: '#10b981',
    groceries: '#3b82f6',
    household_home: '#0ea5e9',
    dining_takeaways: '#f59e0b',
    shopping_clothing: '#ec4899',
    travel_accommodation: '#8b5cf6',
    entertainment: '#d946ef',
    health_wellness: '#22c55e',
    bills: '#f97316',
    subscriptions: '#6366f1',
    transport: '#a855f7',
    savings: '#14b8a6',
    loan_repayment: '#ef4444',
    refund: '#06b6d4',
    reimbursements: '#0891b2',
    transfers: '#6b7280',
    uncategorized: '#9ca3af'
}

/** Short descriptions for each category (from backend transaction_categorizer) */
export const CATEGORY_DESCRIPTIONS = {
    salary: 'Regular salary, wages, employer payments',
    side_income: 'Freelance income, consulting fees, side jobs',
    investment_income: 'Dividends, interest received, rental income',
    refund: 'Merchant refunds, cashbacks, money back from retailers',
    reimbursements: 'Travel per diems, expense claims, friends paying you back for costs you fronted',
    other_income: 'Gifts received, bonuses, miscellaneous windfall credits',
    groceries: 'Food and drink purchased for home — supermarkets, butchers, delis, and fresh produce stores',
    household_home: 'Recurring home costs and once-off home spend — electricity, cleaning services, garden supplies, and homeware',
    dining_takeaways: 'Any food or drink consumed out of home — restaurants, coffee shops, takeaways, Uber Eats, and bar tabs',
    shopping_clothing: 'Retail purchases for personal use — clothing, accessories, homeware décor, and online shopping (Takealot, Temu)',
    travel_accommodation: 'Trip-related costs — Airbnb, hotels, and any accommodation or travel bookings outside daily commuting',
    entertainment: 'Events, activities, and leisure spend — concert tickets, Webtickets, sports events, and social outings',
    health_wellness: 'Physical health and body maintenance — physio, pharmacy, doctor visits, recovery treatments, and personal care products',
    bills: 'Fixed essential obligations — levies, rates, insurance premiums, medical aid, and bank charges',
    subscriptions: 'Recurring digital and membership services — streaming, phone contracts, gym memberships, and software',
    transport: 'Getting around — fuel, Uber rides, parking, tolls, and vehicle-related costs',
    savings: 'Money put to work for the future — TFSA, retirement annuity, unit trusts, and investment contributions',
    loan_repayment: 'Debt servicing — bond repayments, personal loans, and vehicle finance instalments',
    transfers: 'Money movements between your own accounts',
    uncategorized: 'Not yet categorized'
}

/** SA-specific example merchants for each category */
export const CATEGORY_EXAMPLES = {
    salary: 'Payroll, employer deposits',
    side_income: 'Upwork, Fiverr, client payments',
    investment_income: 'Bank interest, dividend credits',
    refund: 'Returns, reversals, cashback',
    reimbursements: 'Per diems, expense claims, friend repayments',
    other_income: 'Bonuses, gifts',
    groceries: 'Woolworths, Pick n Pay, Checkers, Shoprite',
    household_home: 'Eskom, cleaning services, @Home, garden supplies',
    dining_takeaways: 'Restaurants, coffee shops, Uber Eats, Mr D',
    shopping_clothing: 'Takealot, Temu, MRP, clothing stores',
    travel_accommodation: 'Airbnb, hotels, flights',
    entertainment: 'Webtickets, Computicket, concerts, events',
    health_wellness: 'Clicks, Dis-Chem, physio, doctor',
    bills: 'Levies, rates, medical aid, insurance, bank charges',
    subscriptions: 'Netflix, DSTV, Spotify, gym',
    transport: 'Engen, Shell, Uber, Bolt, tolls',
    savings: 'TFSA, RA, unit trusts',
    loan_repayment: 'Home loan, vehicle finance',
    transfers: 'FNB, Capitec, inter-account',
    uncategorized: '—'
}
