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
            <div className="bg-gradient-to-r from-teal-600 to-slate-700 p-7 md:p-8 rounded-xl shadow-lg">
                <h1 className="text-3xl font-bold text-white">Investec Banking</h1>
                <p className="text-teal-100 mt-2 max-w-3xl text-base leading-relaxed">
                    Manage your Investec banking from one place: accounts, transactions, budget analysis, and categorization rules.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
                {CARDS.map(({ path, title, description, icon: Icon }) => (
                    <Link
                        key={path}
                        to={path}
                        className="bg-white dark:bg-gray-800 p-7 md:p-8 min-h-[9.5rem] md:min-h-[10.5rem] rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm hover:border-teal-400 dark:hover:border-teal-500 focus-visible:border-teal-400 dark:focus-visible:border-teal-500 transition-colors flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 dark:focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                    >
                        <div className="flex items-start gap-4 md:gap-5">
                            <div className="p-3 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 shrink-0">
                                <Icon className="w-8 h-8 md:w-9 md:h-9" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">{title}</h2>
                                <p className="text-base text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{description}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
