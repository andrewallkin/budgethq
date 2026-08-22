import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Wallet, Loader2 } from 'lucide-react'
import BlurredValue from '../../components/BlurredValue'
import CreateAccountWizard from '../../components/investments-v2/CreateAccountWizard'
import DeleteSygniaAccountButton from '../../components/investments-v2/DeleteSygniaAccountButton'
import SygniaManualSyncButton from '../../components/investments-v2/SygniaManualSyncButton'
import SygniaSyncStatusBadge from '../../components/investments-v2/SygniaSyncStatusBadge'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'
import {
    productTypeLabel,
    stripAccountCodeFromName,
    labelsMatch,
    SOURCE_IDS,
} from '../../investments-v2/types'
import { formatCurrency, formatDateSafe } from '../../utils/numberFormatting'

export default function InvestmentsV2Landing() {
    const { accounts, totalHoldings, fxNote, holdingsOmitted, loading, error, refreshAccounts } =
        useInvestmentsV2()
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
                        Google Sheets portfolios and connected Sygnia accounts.
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
                    {(fxNote || holdingsOmitted) && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                            {fxNote ||
                                'Some Google Sheets values could not be converted to ZAR and were left out of this total.'}
                        </p>
                    )}
                </div>
            )}

            {!loading && accounts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 px-6 py-12 text-center">
                    <Wallet className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" aria-hidden />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No accounts connected</h2>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                        Connect a Sygnia account or open a Google Sheets portfolio once one exists under
                        Investments.
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
                    accounts.map((account) => {
                        const isSheets = account.sourceId === SOURCE_IDS.GOOGLE_SHEETS
                        const to = isSheets
                            ? `/investments-v2/sheets/${account.slug}`
                            : `/investments-v2/${account.id}`
                        const budgetTypeLabel = productTypeLabel(account.productType)
                        const title =
                            stripAccountCodeFromName(account.name, account.accountCode) ||
                            budgetTypeLabel ||
                            'Sygnia account'
                        const showType = budgetTypeLabel && !labelsMatch(title, budgetTypeLabel)
                        return (
                            <Link
                                key={account.id}
                                to={to}
                                className="group bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm hover:border-teal-400 dark:hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        {isSheets ? (
                                            <>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                                                    {account.name}
                                                </h3>
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    Google Sheets
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                                                    Sheet tab: {account.sheetName || 'Not set'}
                                                </p>
                                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                    Currency: {account.currencyCode || 'ZAR'}
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-balance group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                                                    {title}
                                                </h3>
                                                {account.accountCode && (
                                                    <p className="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400">
                                                        {account.accountCode}
                                                    </p>
                                                )}
                                                {showType && (
                                                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                                        {budgetTypeLabel}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    {!isSheets && (
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <SygniaSyncStatusBadge
                                                status={account.lastSyncStatus}
                                                error={account.lastSyncError}
                                                compact
                                            />
                                            <SygniaManualSyncButton
                                                accountId={account.id}
                                                compact
                                                onSynced={async () => {
                                                    await refreshAccounts()
                                                }}
                                            />
                                            <DeleteSygniaAccountButton
                                                accountId={account.id}
                                                accountName={account.name}
                                                compact
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="mt-4 flex items-baseline justify-between gap-2">
                                    <BlurredValue>
                                        <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">
                                            {isSheets
                                                ? formatCurrency(account.totalValue || 0, {
                                                      currency: account.currencyCode || 'ZAR',
                                                  })
                                                : formatCurrency(account.totalValue || 0)}
                                        </span>
                                    </BlurredValue>
                                    {!isSheets && account.asOfDate && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                                            As of{' '}
                                            {formatDateSafe(account.asOfDate, {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        )
                    })}
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
