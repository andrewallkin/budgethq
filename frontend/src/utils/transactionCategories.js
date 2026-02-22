/**
 * Shared transaction category constants for Investec integration.
 * Used by Budget Dashboard, Budget Analysis, and Categorization Rules.
 */

export const INCOME_CATEGORIES = ['salary', 'side_income', 'investment_income', 'refund', 'other_income']
export const EXPENSE_CATEGORIES = ['groceries_household', 'bills', 'subscriptions', 'transport', 'lifestyle_misc', 'savings', 'loan_repayment']
export const CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, 'transfers']

/** Categories that budget entries can map to (expense + transfers + uncategorized) */
export const BUDGET_TRANSACTION_CATEGORIES = [...EXPENSE_CATEGORIES, 'transfers', 'uncategorized']

export const CATEGORY_LABELS = {
    income: 'Income',
    salary: 'Salary',
    side_income: 'Side Income',
    investment_income: 'Investment Income',
    refund: 'Refund',
    other_income: 'Other Income',
    groceries_household: 'Groceries & Household',
    bills: 'Bills',
    subscriptions: 'Subscriptions',
    transport: 'Transport',
    lifestyle_misc: 'Lifestyle & Misc',
    savings: 'Savings',
    loan_repayment: 'Loan Repayment',
    transfers: 'Transfers',
    uncategorized: 'Uncategorized'
}

export const CATEGORY_COLORS = {
    income: '#10b981',
    groceries_household: '#3b82f6',
    bills: '#f97316',
    subscriptions: '#6366f1',
    transport: '#a855f7',
    lifestyle_misc: '#ec4899',
    savings: '#14b8a6',
    loan_repayment: '#ef4444',
    transfers: '#6b7280',
    uncategorized: '#9ca3af'
}

/** Short descriptions for each category (from backend transaction_categorizer) */
export const CATEGORY_DESCRIPTIONS = {
    salary: 'Regular salary, wages, employer payments',
    side_income: 'Freelance income, consulting fees, side jobs',
    investment_income: 'Dividends, interest received, rental income',
    refund: 'Merchant refunds, cashbacks, money back from retailers',
    other_income: 'Gifts received, bonuses, miscellaneous credits',
    groceries_household: 'Food shopping, household essentials, pharmacy',
    bills: 'Rent, utilities, insurance, medical aid — fixed essential costs',
    subscriptions: 'Streaming, gym, phone contracts, recurring digital services',
    transport: 'Fuel, Uber, public transport, parking, tolls',
    lifestyle_misc: 'Dining out, shopping, entertainment, travel, hobbies',
    savings: 'Savings accounts, investments, TFSA, RA contributions',
    loan_repayment: 'Bond repayments, personal loans, vehicle finance',
    transfers: 'Money movements between your own accounts',
    uncategorized: 'Not yet categorized'
}

/** SA-specific example merchants for each category */
export const CATEGORY_EXAMPLES = {
    salary: 'Payroll, employer deposits',
    side_income: 'Upwork, Fiverr, client payments',
    investment_income: 'Bank interest, dividend credits',
    refund: 'Returns, reversals, cashback',
    other_income: 'Bonuses, gifts',
    groceries_household: 'Woolworths, Pick n Pay, Checkers, Shoprite',
    bills: 'Eskom, water, medical aid, insurance',
    subscriptions: 'Netflix, DSTV, Spotify, gym',
    transport: 'Engen, Shell, Uber, Bolt',
    lifestyle_misc: 'Restaurants, clothing, travel',
    savings: 'TFSA, RA, unit trusts',
    loan_repayment: 'Home loan, vehicle finance',
    transfers: 'FNB, Capitec, inter-account',
    uncategorized: '—'
}
