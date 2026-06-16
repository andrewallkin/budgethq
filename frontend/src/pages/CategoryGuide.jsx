import { Link } from 'react-router-dom'
import { FileText, LayoutDashboard, Tags, Building2, SlidersHorizontal, BarChart2, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    NEUTRAL_CATEGORIES,
    CATEGORY_LABELS,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_EXAMPLES,
    CATEGORY_COLORS
} from '../utils/transactionCategories'

const FLOW_STEPS = [
    {
        icon: FileText,
        title: 'Payslip & Tax',
        description: 'Upload your payslip; net income is calculated using SARS PAYE, UIF, and deductions',
        link: '/salary'
    },
    {
        icon: LayoutDashboard,
        title: 'Budget Dashboard',
        description: 'Allocate net income into Needs, Wants, and Savings buckets',
        link: '/budget'
    },
    {
        icon: Tags,
        title: 'Transaction Categories',
        description: 'Each budget line item maps to a transaction category',
        link: '/category-guide'
    },
    {
        icon: Building2,
        title: 'Investec Integration',
        description: 'Bank transactions are auto-categorized as they come in',
        link: '/investec',
        investecOnly: true
    },
    {
        icon: SlidersHorizontal,
        title: 'Categorization Rules',
        description: 'Override auto-categorization by merchant name or description',
        link: '/investec/rules',
        investecOnly: true
    },
    {
        icon: BarChart2,
        title: 'Budget Analysis',
        description: 'Compares actual spending (transactions) vs budgeted amounts by category',
        link: '/investec/budget-analysis',
        investecOnly: true
    },
    {
        icon: EyeOff,
        title: 'Excluded Entries',
        description: 'Budget items marked "excluded" are visible on the dashboard but not counted in Budget Analysis',
        link: '/budget'
    }
]

export default function CategoryGuide() {
    const { showInvestecNav } = useAuth()
    const steps = showInvestecNav ? FLOW_STEPS : FLOW_STEPS.filter(s => !s.investecOnly)

    return (
        <div className="space-y-6 sm:space-y-8 w-full px-4 sm:px-6 lg:px-8">
            {/* Page header */}
            <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-2">
                    Budget Category Guide
                </h1>
                <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
                    {showInvestecNav
                        ? 'Transaction categories used across Budget Dashboard, Transactions, and Categorization Rules.'
                        : 'Transaction categories for choosing budget line item categories on the Budget Dashboard.'}
                </p>
            </div>

            {/* How Budgeting Works */}
            <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">How Budgeting Works</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                    {steps.map((step, i) => {
                        const Icon = step.icon
                        return (
                            <Link
                                key={step.title}
                                to={step.link}
                                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-center hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all group"
                            >
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mx-auto mb-2 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                                    <Icon size={15} />
                                </div>
                                <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">{i + 1}</div>
                                <div className="text-xs font-semibold text-gray-900 dark:text-white leading-tight mb-1">{step.title}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 leading-tight hidden sm:block">{step.description}</div>
                            </Link>
                        )
                    })}
                </div>
            </section>

            {/* Where categories are used callout */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    {showInvestecNav ? (
                        <>
                            Categories appear in three places:{' '}
                            <Link to="/budget" className="font-semibold underline underline-offset-2 hover:text-blue-600 dark:hover:text-blue-300">
                                Budget Dashboard
                            </Link>{' '}
                            (map budget items to a category),{' '}
                            <Link to="/investec/rules" className="font-semibold underline underline-offset-2 hover:text-blue-600 dark:hover:text-blue-300">
                                Categorization Rules
                            </Link>{' '}
                            (auto-assign categories to transactions), and{' '}
                            <Link to="/investec/budget-analysis" className="font-semibold underline underline-offset-2 hover:text-blue-600 dark:hover:text-blue-300">
                                Budget Analysis
                            </Link>{' '}
                            (compare spending vs budget). View all transactions on the{' '}
                            <Link to="/investec/transactions" className="font-semibold underline underline-offset-2 hover:text-blue-600 dark:hover:text-blue-300">
                                Transactions
                            </Link>{' '}
                            page.
                        </>
                    ) : (
                        <>
                            Categories are used on the{' '}
                            <Link to="/budget" className="font-semibold underline underline-offset-2 hover:text-blue-600 dark:hover:text-blue-300">
                                Budget Dashboard
                            </Link>{' '}
                            to map each budget line item to a category.
                        </>
                    )}
                </p>
            </div>

            {/* Category columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                {/* Left: Income + Neutral stacked */}
                <div className="flex flex-col gap-6">
                    {/* Income */}
                    <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex-1 flex flex-col">
                        <div className="p-6 sm:p-8">
                            <h2 className="text-sm sm:text-base font-medium uppercase tracking-wider text-green-600 dark:text-green-400 mb-3">
                                Income
                            </h2>
                            <ul className="space-y-4 sm:space-y-5">
                                {INCOME_CATEGORIES.map(cat => (
                                    <li key={cat} className="text-gray-700 dark:text-gray-300">
                                        <div className="flex items-start gap-2">
                                            <span
                                                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                                                style={{ backgroundColor: CATEGORY_COLORS[cat] ?? '#10b981' }}
                                            />
                                            <div>
                                                <span className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">
                                                    {CATEGORY_LABELS[cat]}
                                                </span>
                                                <span className="text-gray-500 dark:text-gray-400"> — </span>
                                                <span>{CATEGORY_DESCRIPTIONS[cat]}</span>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                                    e.g. {CATEGORY_EXAMPLES[cat]}
                                                </p>
                                                {cat === 'reimbursements' && showInvestecNav && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                        Reimbursements are not earnings. Link to the expense you fronted to reduce category spend.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>

                    {/* Neutral */}
                    <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="p-6 sm:p-8">
                            <h2 className="text-sm sm:text-base font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                                Neutral
                            </h2>
                            <ul className="space-y-4 sm:space-y-5">
                                {NEUTRAL_CATEGORIES.map(cat => (
                                    <li key={cat} className="text-gray-700 dark:text-gray-300">
                                        <div className="flex items-start gap-2">
                                            <span
                                                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                                                style={{ backgroundColor: CATEGORY_COLORS[cat] ?? '#6b7280' }}
                                            />
                                            <div>
                                                <span className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">
                                                    {CATEGORY_LABELS[cat]}
                                                </span>
                                                <span className="text-gray-500 dark:text-gray-400"> — </span>
                                                <span>{CATEGORY_DESCRIPTIONS[cat]}</span>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                                    e.g. {CATEGORY_EXAMPLES[cat]}
                                                </p>
                                                {cat === 'transfers' && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                        Transfers between your own accounts don't affect budget totals{showInvestecNav ? ' in Budget Analysis' : ''}.
                                                    </p>
                                                )}
                                                {cat === 'refund' && showInvestecNav && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                        Refunds are not earnings. Link to the original debit to reduce category spend, or leave unlinked for budget envelope headroom.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                                <li className="text-gray-700 dark:text-gray-300">
                                    <div className="flex items-start gap-2">
                                        <span
                                            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                                            style={{ backgroundColor: CATEGORY_COLORS.uncategorized }}
                                        />
                                        <div>
                                            <span className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">
                                                {CATEGORY_LABELS.uncategorized}
                                            </span>
                                            <span className="text-gray-500 dark:text-gray-400"> — </span>
                                            <span>{CATEGORY_DESCRIPTIONS.uncategorized}</span>
                                            {showInvestecNav && (
                                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                    Transactions without a category appear in Budget Analysis as uncategorized until a Categorization Rule assigns them.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            </ul>
                        </div>
                    </section>
                </div>

                {/* Right: Expenses in 2-column grid */}
                <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 sm:p-8">
                        <h2 className="text-sm sm:text-base font-medium uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-3">
                            Expenses
                        </h2>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                            {EXPENSE_CATEGORIES.map((cat, i) => (
                                <li key={cat} className={i === EXPENSE_CATEGORIES.length - 1 && EXPENSE_CATEGORIES.length % 2 !== 0 ? 'sm:col-span-2' : ''}>
                                    <div className="flex items-start gap-2">
                                        <span
                                            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                                            style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                                        />
                                        <div>
                                            <p className="font-semibold text-sm text-gray-900 dark:text-white leading-snug">
                                                {CATEGORY_LABELS[cat]}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug mt-0.5">
                                                {CATEGORY_DESCRIPTIONS[cat]}
                                            </p>
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                e.g. {CATEGORY_EXAMPLES[cat]}
                                            </p>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            </div>

        </div>
    )
}
