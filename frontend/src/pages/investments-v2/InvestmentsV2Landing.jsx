import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Wallet, Loader2, Info } from 'lucide-react'
import BlurredValue from '../../components/BlurredValue'
import CreateAccountWizard from '../../components/investments-v2/CreateAccountWizard'
import SygniaSyncStatusBadge from '../../components/investments-v2/SygniaSyncStatusBadge'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'
import { formatCurrency, formatDateSafe } from '../../utils/numberFormatting'

function SyncInfoBanner() {
    return (
        <div className="flex gap-3 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-4 py-3 text-sm text-sky-900 dark:text-sky-100">
            <Info className="w-5 h-5 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" aria-hidden />
            <p>
                Sygnia portal values are <strong>T−1</strong> (prior business day). BudgetHQ syncs connected
                accounts automatically around <strong>05:00 SAST</strong> each morning. There is no manual
                refresh.
            </p>
        </div>
    )
}

export default function InvestmentsV2Landing() {
    const { accounts, totalHoldings, loading, error } = useInvestmentsV2()
    const [wizardOpen, setWizardOpen] = useState(false)
    const navigate = useNavigate()

    return (
        <div className="space-y-6">
            {error && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                    {error}
                </p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        Investments 2.0
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Connected Sygnia accounts with daily sync and performance tracking.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setWizardOpen(true)}
                    className="inline-flex items-center justify-center gap-2 self-start sm:self-auto px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-sm transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add account
                </button>
            </div>

            <SyncInfoBanner />

            {loading && (
                <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading accounts…
                </div>
            )}

            {!loading && accounts.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Total across accounts (ZAR)
                    </p>
                    <BlurredValue>
                        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                            {formatCurrency(totalHoldings)}
                        </p>
                    </BlurredValue>
                </div>
            )}

            {!loading && accounts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 px-6 py-12 text-center">
                    <Wallet className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" aria-hidden />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No accounts connected</h2>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                        Connect a Sygnia account to sync holdings, portfolio value, and track deposits over time.
                    </p>
                    <button
                        type="button"
                        onClick={() => setWizardOpen(true)}
                        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add account
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {!loading &&
                    accounts.map((account) => (
                        <Link
                            key={account.id}
                            to={`/investments-v2/${account.id}`}
                            className="group bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm hover:border-teal-400 dark:hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                                        {account.name}
                                    </h3>
                                    <p className="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                                        {account.accountCode}
                                    </p>
                                    {account.accountTypeName && (
                                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                            {account.accountTypeName}
                                        </p>
                                    )}
                                </div>
                                <SygniaSyncStatusBadge
                                    status={account.lastSyncStatus}
                                    error={account.lastSyncError}
                                    compact
                                />
                            </div>
                            <div className="mt-4 flex items-baseline justify-between gap-2">
                                <BlurredValue>
                                    <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                                        {formatCurrency(account.totalValue || 0)}
                                    </span>
                                </BlurredValue>
                                {account.asOfDate && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                                        As of {formatDateSafe(account.asOfDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                )}
                            </div>
                        </Link>
                    ))}
            </div>

            <CreateAccountWizard
                isOpen={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onCreated={(account) => {
                    setWizardOpen(false)
                    if (account?.id != null) {
                        navigate(`/investments-v2/${account.id}`)
                    }
                }}
            />
        </div>
    )
}
