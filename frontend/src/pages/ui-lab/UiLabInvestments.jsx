import { Info, Plus } from 'lucide-react'
import { formatCurrency, formatDateSafe } from '../../utils/numberFormatting'
import { labInvestments } from './uiLabData'

export default function UiLabInvestments() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-teal-600 dark:text-teal-400">Investments 2.0</p>
                    <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                        Investments 2.0
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Connected Sygnia accounts with daily sync and performance tracking.
                    </p>
                </div>
                <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center gap-2 self-start sm:self-auto px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white opacity-60 cursor-not-allowed"
                >
                    <Plus className="w-4 h-4" />
                    Add account
                </button>
            </div>

            <div className="flex gap-3 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-4 py-3 text-sm text-sky-900 dark:text-sky-100">
                <Info className="w-5 h-5 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" aria-hidden />
                <p>
                    Sygnia portal values are <strong>T−1</strong> (prior business day). BudgetHQ syncs connected
                    accounts automatically around <strong>05:00 SAST</strong> each morning. There is no manual
                    refresh.
                </p>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Total across accounts (ZAR)
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
                    {formatCurrency(labInvestments.totalHoldings)}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {labInvestments.accounts.map((account) => (
                    <div
                        key={account.id}
                        className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white truncate">
                                    {account.name}
                                </h3>
                                <p className="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                                    {account.accountCode}
                                </p>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                    {account.accountTypeName}
                                </p>
                            </div>
                            <span className="text-xs font-medium rounded-lg px-2 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                Synced
                            </span>
                        </div>
                        <div className="mt-4 flex items-baseline justify-between gap-2">
                            <span className="text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
                                {formatCurrency(account.totalValue)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                                As of {formatDateSafe(account.asOfDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
