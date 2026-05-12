import { Link } from 'react-router-dom'
import { CreditCard, Receipt, Tag, TrendingUp } from 'lucide-react'

const CARDS = [
    {
        path: '/investec/accounts',
        title: 'Bank Accounts',
        description: 'Sync balances, set primary and emergency fund accounts, and manage manual accounts.',
        icon: CreditCard,
    },
    {
        path: '/investec/transactions',
        title: 'Transactions',
        description: 'Review Investec transactions and categorization.',
        icon: Receipt,
    },
    {
        path: '/investec/budget-analysis',
        title: 'Budget Analysis',
        description: 'Compare actual spending to your budget by category.',
        icon: TrendingUp,
    },
    {
        path: '/investec/rules',
        title: 'Categorization Rules',
        description: 'Create rules to override automatic transaction categories.',
        icon: Tag,
    },
]

export default function InvestecLanding() {
    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-teal-600 to-slate-700 p-6 rounded-xl shadow-lg">
                <h1 className="text-3xl font-bold text-white">Investec Banking</h1>
                <p className="text-teal-100 mt-1 max-w-2xl">
                    Choose an area to work in. Balances, transactions, budget comparison, and categorization rules work the same as before — they are just organized from this home screen.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
                {CARDS.map(({ path, title, description, icon: Icon }) => (
                    <Link
                        key={path}
                        to={path}
                        className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm hover:border-teal-400 dark:hover:border-teal-500 transition-colors flex flex-col gap-3"
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 shrink-0">
                                <Icon className="w-6 h-6" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</p>
                            </div>
                        </div>
                        <span className="text-sm font-medium text-teal-600 dark:text-teal-400">Open →</span>
                    </Link>
                ))}
            </div>
        </div>
    )
}
