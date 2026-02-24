const CATEGORY_COLORS = {
    // Income
    salary: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    side_income: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    investment_income: 'bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300',
    refund: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
    other_income: 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400',
    // Expenses
    groceries_household: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    bills: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    subscriptions: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
    transport: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    lifestyle_misc: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
    savings: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
    loan_repayment: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    // Neutral
    transfers: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    uncategorized: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
}

const CATEGORY_LABELS = {
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

export default function CategoryBadge({ category, className = '' }) {
    const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.uncategorized
    const label = CATEGORY_LABELS[category] || 'Unknown'

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}>
            {label}
        </span>
    )
}
