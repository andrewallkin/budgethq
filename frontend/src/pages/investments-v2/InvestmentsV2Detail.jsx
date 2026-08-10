import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import SygniaDetailView from '../../components/investments-v2/SygniaDetailView'
import SygniaSyncStatusBadge from '../../components/investments-v2/SygniaSyncStatusBadge'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'
import { SOURCE_IDS } from '../../investments-v2/types'
import { formatDateSafe, formatDateTimeSafe } from '../../utils/numberFormatting'

export default function InvestmentsV2Detail() {
    const { accountId } = useParams()
    const { getAccount, fetchAccountDetail, loading: accountsLoading } = useInvestmentsV2()
    const account = getAccount(accountId)
    const [detail, setDetail] = useState(null)
    const [detailLoading, setDetailLoading] = useState(true)
    const [detailError, setDetailError] = useState(null)

    useEffect(() => {
        if (!account) {
            setDetail(null)
            setDetailLoading(false)
            return
        }

        if (account.sourceId !== SOURCE_IDS.SYGNIA_PLAYWRIGHT) {
            setDetailLoading(false)
            setDetailError('This account type is not supported yet.')
            return
        }

        let cancelled = false
        setDetailLoading(true)
        setDetailError(null)
        fetchAccountDetail(account.id)
            .then((payload) => {
                if (!cancelled) setDetail(payload)
            })
            .catch((err) => {
                if (!cancelled) {
                    setDetailError(err.message || 'Failed to load account detail')
                }
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [account, fetchAccountDetail])

    if (accountsLoading && !account) {
        return (
            <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading account…
            </div>
        )
    }

    if (!account) {
        return <Navigate to="/investments-v2" replace />
    }

    const meta = detail || account
    const typeLabel =
        meta.account_type_name ||
        meta.accountTypeName ||
        meta.account_type_code ||
        meta.accountTypeCode ||
        null

    return (
        <div className="space-y-6 pb-6">
            <div>
                <Link
                    to="/investments-v2"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Investments 2.0
                </Link>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                                {meta.name}
                            </h1>
                            {meta.reg28_compliant != null && (
                                <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                        meta.reg28_compliant
                                            ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                            : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                    }`}
                                >
                                    <ShieldCheck className="w-3 h-3" aria-hidden />
                                    Reg 28 {meta.reg28_compliant ? 'compliant' : 'non-compliant'}
                                </span>
                            )}
                        </div>
                        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">Account code</dt>
                                <dd className="font-mono font-medium text-gray-900 dark:text-white">
                                    {meta.account_code || account.accountCode}
                                </dd>
                            </div>
                            {typeLabel && (
                                <div>
                                    <dt className="text-gray-500 dark:text-gray-400">Account type</dt>
                                    <dd className="font-medium text-gray-900 dark:text-white">{typeLabel}</dd>
                                </div>
                            )}
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">Value as of</dt>
                                <dd className="font-medium text-gray-900 dark:text-white">
                                    {formatDateSafe(meta.as_of_date || account.asOfDate, {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                    })}
                                </dd>
                            </div>
                            {(meta.last_synced_at || account.lastSyncedAt) && (
                                <div>
                                    <dt className="text-gray-500 dark:text-gray-400">Last synced</dt>
                                    <dd className="font-medium text-gray-900 dark:text-white">
                                        {formatDateTimeSafe(meta.last_synced_at || account.lastSyncedAt)}
                                    </dd>
                                </div>
                            )}
                        </dl>
                    </div>
                    <SygniaSyncStatusBadge
                        status={meta.last_sync_status || account.lastSyncStatus}
                        error={meta.last_sync_error || account.lastSyncError}
                    />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
                    Sygnia values are T−1. BudgetHQ syncs around 05:00 SAST daily — no manual refresh.
                </p>
            </div>

            {detailLoading && (
                <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Loading account data…
                </div>
            )}

            {detailError && !detailLoading && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                    {detailError}
                </p>
            )}

            {!detailLoading && !detailError && detail && (
                <SygniaDetailView accountId={account.id} detail={detail} />
            )}
        </div>
    )
}
