import {
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    CATEGORY_LABELS,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_EXAMPLES
} from '../utils/transactionCategories'

export default function CategoryGuide() {
    return (
        <div className="space-y-6 sm:space-y-8 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-2">
                    Budget Category Guide
                </h1>
                <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
                    Transaction categories used across Budget Dashboard, Transactions, and Categorization Rules.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.25fr_0.75fr] gap-6 lg:gap-8 items-stretch">
                <section className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 sm:p-8 text-base sm:text-lg flex-1">
                        <h2 className="text-sm sm:text-base font-medium uppercase tracking-wider text-green-600 dark:text-green-400 mb-3">
                            Income
                        </h2>
                        <ul className="space-y-4 sm:space-y-5">
                            {INCOME_CATEGORIES.map(cat => (
                                <li key={cat} className="text-gray-700 dark:text-gray-300">
                                    <span className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">
                                        {CATEGORY_LABELS[cat]}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400"> — </span>
                                    <span>{CATEGORY_DESCRIPTIONS[cat]}</span>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        e.g. {CATEGORY_EXAMPLES[cat]}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 sm:p-8 text-base sm:text-lg flex-1">
                        <h2 className="text-sm sm:text-base font-medium uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-3">
                            Expenses
                        </h2>
                        <ul className="space-y-4 sm:space-y-5">
                            {EXPENSE_CATEGORIES.map(cat => (
                                <li key={cat} className="text-gray-700 dark:text-gray-300">
                                    <span className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">
                                        {CATEGORY_LABELS[cat]}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400"> — </span>
                                    <span>{CATEGORY_DESCRIPTIONS[cat]}</span>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        e.g. {CATEGORY_EXAMPLES[cat]}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <section className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 sm:p-8 text-base sm:text-lg flex-1">
                        <h2 className="text-sm sm:text-base font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                            Neutral
                        </h2>
                        <ul className="space-y-4 sm:space-y-5">
                            <li className="text-gray-700 dark:text-gray-300">
                                <span className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">
                                    {CATEGORY_LABELS.transfers}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400"> — </span>
                                <span>{CATEGORY_DESCRIPTIONS.transfers}</span>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    e.g. {CATEGORY_EXAMPLES.transfers}
                                </p>
                            </li>
                            <li className="text-gray-700 dark:text-gray-300">
                                <span className="font-medium text-base sm:text-lg text-gray-900 dark:text-white">
                                    {CATEGORY_LABELS.uncategorized}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400"> — </span>
                                <span>{CATEGORY_DESCRIPTIONS.uncategorized}</span>
                            </li>
                        </ul>
                    </div>
                </section>
            </div>
        </div>
    )
}
