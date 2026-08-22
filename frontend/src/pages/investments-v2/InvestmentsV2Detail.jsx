import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calculator, Loader2, ShieldCheck } from 'lucide-react'
import SygniaDetailView from '../../components/investments-v2/SygniaDetailView'
import DeleteSygniaAccountButton from '../../components/investments-v2/DeleteSygniaAccountButton'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'
import { SOURCE_IDS, productTypeLabel, stripAccountCodeFromName, labelsMatch } from '../../investments-v2/types'
import { formatDateSafe, formatDateTimeSafe } from '../../utils/numberFormatting'

export default function InvestmentsV2Detail() {
    const { accountId } = useParams()
    const navigate = useNavigate()
    const { getAccount, fetchAccountDetail, loading: accountsLoading } =
        useInvestmentsV2()
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

    const productType = account?.productType ?? detail?.product_type ?? null

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
    const accountCode = meta.account_code || account.accountCode
    const typeLabel =
        meta.account_type_name ||
        meta.accountTypeName ||
        meta.account_type_code ||
        meta.accountTypeCode ||
        null
    const title =
        stripAccountCodeFromName(meta.name, accountCode) ||
        productTypeLabel(productType) ||
        meta.name
    const showSygniaType = typeLabel && !labelsMatch(typeLabel, title)
    const budgetType = productTypeLabel(productType)
    const showBudgetType = budgetType && !labelsMatch(budgetType, title) && !labelsMatch(budgetType, typeLabel)
    const reg28 = meta.reg28_compliant ?? account.reg28Compliant
    const asOf = meta.as_of_date || account.asOfDate
    const lastSynced = meta.last_synced_at || account.lastSyncedAt

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

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white text-balance">
                            {title}
                        </h1>
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                            {accountCode && (
                                <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
                                    {accountCode}
                                </span>
                            )}
                            {accountCode && reg28 != null && (
                                <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                                    ·
                                </span>
                            )}
                            {reg28 != null && (
                                <span
                                    className={`inline-flex items-center gap-1 ${
                                        reg28
                                            ? 'text-green-700 dark:text-green-300'
                                            : 'text-amber-700 dark:text-amber-300'
                                    }`}
                                >
                                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                                    Reg 28 {reg28 ? 'compliant' : 'non-compliant'}
                                </span>
                            )}
                            {showSygniaType && (
                                <>
                                    <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                                        ·
                                    </span>
                                    <span>{typeLabel}</span>
                                </>
                            )}
                            {showBudgetType && (
                                <>
                                    <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                                        ·
                                    </span>
                                    <span>{budgetType}</span>
                                </>
                            )}
                        </div>
                        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                            {asOf && (
                                <>
                                    As of{' '}
                                    {formatDateSafe(asOf, {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                    })}
                                </>
                            )}
                            {asOf && lastSynced && (
                                <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                                    {' '}
                                    ·{' '}
                                </span>
                            )}
                            {lastSynced && <>Last synced {formatDateTimeSafe(lastSynced)}</>}
                        </p>
                        {productType === 'ra' && (
                            <p className="mt-2">
                                <Link
                                    to="/investments-v2/ra/calculator"
                                    state={{ fromAccountId: account.id }}
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 dark:text-teal-300 hover:text-teal-800 dark:hover:text-teal-200"
                                >
                                    <Calculator className="w-4 h-4" aria-hidden />
                                    RA tax calculator
                                </Link>
                            </p>
                        )}
                    </div>
                </div>
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

            <section className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-gray-800 p-5">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Remove account</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
                    Disconnect this account from BudgetHQ. Synced holdings and history are deleted
                    here; the account at the broker is not closed.
                </p>
                <div className="mt-4">
                    <DeleteSygniaAccountButton
                        accountId={account.id}
                        accountName={meta.name}
                        onDeleted={() => navigate('/investments-v2')}
                    />
                </div>
            </section>
        </div>
    )
}
