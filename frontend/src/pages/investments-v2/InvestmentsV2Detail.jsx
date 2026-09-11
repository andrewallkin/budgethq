import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Calculator, Loader2, ShieldCheck } from 'lucide-react'
import HubBackLink from '../../components/HubBackLink'
import SygniaDetailView from '../../components/investments-v2/SygniaDetailView'
import DeleteSygniaAccountButton from '../../components/investments-v2/DeleteSygniaAccountButton'
import SyncPlaywrightAccountsButton from '../../components/investments-v2/SyncPlaywrightAccountsButton'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'
import { SOURCE_IDS, productTypeLabel, stripAccountCodeFromName, labelsMatch } from '../../investments-v2/types'
import { formatDateSafe, formatDateTimeSafe } from '../../utils/numberFormatting'
import { PaperCard, paperBackLink, paperEyebrow, paperTitle } from '../../components/appUi'

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

        if (account.sourceId === SOURCE_IDS.GOOGLE_SHEETS) {
            setDetailLoading(false)
            setDetailError(null)
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
            <div className="mx-auto flex max-w-[1080px] items-center justify-center py-16 text-[var(--paper-muted)]">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                Loading account…
            </div>
        )
    }

    if (!account) {
        if (/^\d+$/.test(accountId) || String(accountId).includes(':')) {
            return <Navigate to="/investments" replace />
        }
        return <Navigate to={`/investments/sheets/${accountId}`} replace />
    }

    if (account.sourceId === SOURCE_IDS.GOOGLE_SHEETS && account.slug) {
        return <Navigate to={`/investments/sheets/${account.slug}`} replace />
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
    const lastSyncStatus = meta.last_sync_status || account.lastSyncStatus
    const lastSyncError = meta.last_sync_error || account.lastSyncError

    const applySyncedDetail = (payload) => {
        if (!payload) return
        const next = { ...payload }
        delete next.sync
        setDetail(next)
        setDetailError(null)
    }

    return (
        <div className="mx-auto max-w-[1080px] space-y-8 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <HubBackLink to="/investments" label="Investments" />
                {productType === 'ra' && (
                    <Link
                        to="/investments/calculator"
                        state={{ fromAccountId: account.id }}
                        className={paperBackLink}
                    >
                        <Calculator className="h-4 w-4 shrink-0" aria-hidden />
                        RA tax calculator
                    </Link>
                )}
            </div>

            <PaperCard className="p-5 sm:p-6">
                <div className="min-w-0">
                    <p className={paperEyebrow}>Sygnia account</p>
                    <h1 className={`mt-1.5 text-balance ${paperTitle}`}>{title}</h1>
                    {(showSygniaType || showBudgetType) && (
                        <p className="mt-1 text-sm text-[var(--paper-muted)]">
                            {[showSygniaType && typeLabel, showBudgetType && budgetType]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    )}
                    <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        {accountCode && (
                            <div className="relative flex items-center gap-1.5">
                                <dt className="sr-only">Account code</dt>
                                <dd className="font-mono font-medium tabular-nums text-[var(--paper-ink)]">
                                    {accountCode}
                                </dd>
                            </div>
                        )}
                        {reg28 != null && (
                            <div className="relative flex items-center gap-1.5">
                                <dt className="sr-only">Regulation 28</dt>
                                <dd
                                    className={`inline-flex items-center gap-1 ${
                                        reg28 ? 'text-[var(--paper-olive)]' : 'text-[var(--paper-brick)]'
                                    }`}
                                >
                                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Reg 28 {reg28 ? 'compliant' : 'non-compliant'}
                                </dd>
                            </div>
                        )}
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--paper-muted)]">
                        {asOf && (
                            <span>
                                As of{' '}
                                <time dateTime={asOf}>
                                    {formatDateSafe(asOf, {
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                    })}
                                </time>
                            </span>
                        )}
                        {asOf && lastSynced && (
                            <span className="text-[var(--paper-line)]" aria-hidden>
                                ·
                            </span>
                        )}
                        {lastSynced && <span>Synced {formatDateTimeSafe(lastSynced)}</span>}
                        {(asOf || lastSynced) && (
                            <span className="text-[var(--paper-line)]" aria-hidden>
                                ·
                            </span>
                        )}
                        <SyncPlaywrightAccountsButton
                            accountIds={[account.id]}
                            onSynced={applySyncedDetail}
                            variant="inline"
                        />
                    </div>
                    {lastSyncStatus === 'error' && lastSyncError && (
                        <p role="alert" className="mt-3 text-sm text-[var(--paper-brick)]">
                            Last sync failed: {lastSyncError}
                        </p>
                    )}
                </div>
            </PaperCard>

            {detailLoading && (
                <div className="flex items-center justify-center py-12 text-[var(--paper-muted)]">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading account data…
                </div>
            )}

            {detailError && !detailLoading && (
                <PaperCard className="px-5 py-4 text-sm text-[var(--paper-brick)]">{detailError}</PaperCard>
            )}

            {!detailLoading && !detailError && detail && (
                <SygniaDetailView accountId={account.id} detail={detail} />
            )}

            <section className="border-t border-[var(--paper-line)] pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-sm font-medium text-[var(--paper-muted)]">
                            Disconnect from BudgetHQ
                        </h2>
                        <p className="mt-0.5 max-w-lg text-xs text-[var(--paper-muted)]">
                            Removes synced holdings and history here. Your broker account stays open.
                        </p>
                    </div>
                    <DeleteSygniaAccountButton
                        accountId={account.id}
                        accountName={meta.name}
                        onDeleted={() => navigate('/investments')}
                    />
                </div>
            </section>
        </div>
    )
}
