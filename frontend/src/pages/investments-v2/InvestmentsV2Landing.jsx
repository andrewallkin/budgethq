import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChevronRight, Loader2, Plus } from 'lucide-react'
import BlurredValue from '../../components/BlurredValue'
import CreateAccountWizard from '../../components/investments-v2/CreateAccountWizard'
import SyncPlaywrightAccountsButton from '../../components/investments-v2/SyncPlaywrightAccountsButton'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'
import { amountInBase } from '../../investments-v2/sheetsAccounts'
import {
    labelsMatch,
    productTypeLabel,
    SOURCE_IDS,
    stripAccountCodeFromName,
} from '../../investments-v2/types'
import { formatCurrency, formatDateSafe, formatPercent } from '../../utils/numberFormatting'
import {
    PAPER_CHART,
    PaperCard,
    paperBtnPrimary,
    paperEyebrow,
    paperMoney,
    paperTitle,
} from '../../components/appUi'

const MIX_COLORS = [
    PAPER_CHART.olive,
    PAPER_CHART.umber,
    PAPER_CHART.khaki,
    '#6F5846',
    '#8A7A64',
    '#4E5C4A',
]

function isSheetsAccount(account) {
    return account.sourceId === SOURCE_IDS.GOOGLE_SHEETS
}

function accountHref(account) {
    return isSheetsAccount(account)
        ? `/investments/sheets/${account.slug}`
        : `/investments/${account.id}`
}

function accountTitle(account) {
    if (isSheetsAccount(account)) {
        const name = (account.name || '').trim()
        const sheetName = (account.sheetName || '').trim()
        if (name && (!sheetName || !labelsMatch(name, sheetName))) return name
        return 'Sheets portfolio'
    }
    return (
        stripAccountCodeFromName(account.name, account.accountCode) ||
        productTypeLabel(account.productType) ||
        'Sygnia account'
    )
}

function accountSourceLine(account) {
    const typeLabel = productTypeLabel(account.productType)
    if (typeLabel && !labelsMatch(accountTitle(account), typeLabel)) {
        return typeLabel
    }
    return null
}

function accountValueInBase(account, fx) {
    if (isSheetsAccount(account)) {
        return amountInBase(account.totalValue, account.currencyCode, fx)
    }
    const value = Number(account.totalValue)
    return Number.isNaN(value) ? 0 : value
}

function formatAccountValue(account) {
    if (isSheetsAccount(account)) {
        return formatCurrency(account.totalValue || 0, {
            currency: account.currencyCode || 'ZAR',
        })
    }
    return formatCurrency(account.totalValue || 0)
}

function MixTooltip({ active, payload, currency }) {
    if (!active || !payload?.[0]) return null
    const item = payload[0]
    const slice = item.payload || {}
    const value = Number(item.value) || 0
    const percentage = slice.percentage != null ? Number(slice.percentage) : null

    return (
        <div className="min-w-[180px] rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 shadow-sm">
            <div className="flex items-center gap-2">
                <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: slice.color || item.color }}
                    aria-hidden="true"
                />
                <p className="truncate text-sm text-[var(--paper-ink)]">{item.name}</p>
            </div>
            <BlurredValue>
                <p className={`mt-1.5 text-base text-[var(--paper-ink)] ${paperMoney}`}>
                    {formatCurrency(value, { currency })}
                </p>
            </BlurredValue>
            {percentage != null ? (
                <p className="mt-0.5 text-xs tabular-nums text-[var(--paper-muted)]">
                    {formatPercent(percentage, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
            ) : null}
        </div>
    )
}

function accountUpdatedLabel(account) {
    if (isSheetsAccount(account) || !account.asOfDate) return null
    return `As of ${formatDateSafe(account.asOfDate, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })}`
}

export default function InvestmentsV2Landing() {
    const { accounts, totalHoldings, baseCurrency, fx, fxNote, holdingsOmitted, loading, error } =
        useInvestmentsV2()
    const holdingsCurrency = baseCurrency || 'ZAR'
    const [wizardOpen, setWizardOpen] = useState(false)
    const navigate = useNavigate()
    const playwrightAccountIds = accounts
        .filter((account) => account.sourceId === SOURCE_IDS.SYGNIA_PLAYWRIGHT)
        .map((account) => account.id)

    const mix = useMemo(() => {
        const rows = accounts
            .map((account, index) => {
                const baseValue = accountValueInBase(account, fx)
                return {
                    account,
                    id: account.id,
                    label: accountTitle(account),
                    baseValue,
                    color: MIX_COLORS[index % MIX_COLORS.length],
                }
            })
            .filter((row) => row.baseValue != null && row.baseValue > 0)
            .sort((a, b) => b.baseValue - a.baseValue)
        const total = rows.reduce((sum, row) => sum + row.baseValue, 0)
        return {
            rows: rows.map((row) => ({
                ...row,
                name: row.label,
                value: row.baseValue,
                percentage: total > 0 ? (row.baseValue / total) * 100 : 0,
                total,
            })),
            total,
        }
    }, [accounts, fx])

    return (
        <div className="mx-auto max-w-[1080px] space-y-8">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className={paperTitle}>Investments</h1>
                    <p className={`mt-1 ${paperEyebrow}`}>
                        {loading
                            ? 'Loading accounts…'
                            : accounts.length === 0
                              ? 'Sygnia and Google Sheets in one place'
                              : `${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
                    </p>
                </div>
                <div className="flex flex-col items-start gap-2 self-start sm:items-end sm:self-auto">
                    <div className="flex flex-wrap items-start gap-2">
                        {playwrightAccountIds.length > 0 && (
                            <SyncPlaywrightAccountsButton accountIds={playwrightAccountIds} />
                        )}
                        <button type="button" onClick={() => setWizardOpen(true)} className={paperBtnPrimary}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Add account
                        </button>
                    </div>
                </div>
            </header>

            {error && (
                <PaperCard className="px-5 py-4 text-sm text-[var(--paper-brick)]">{error}</PaperCard>
            )}

            {loading && (
                <div className="flex items-center justify-center py-12 text-[var(--paper-muted)]">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading accounts…
                </div>
            )}

            {!loading && accounts.length === 0 && (
                <PaperCard className="px-6 py-12 text-center">
                    <h2 className="text-lg font-semibold text-[var(--paper-ink)]">No accounts yet</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-[var(--paper-muted)]">
                        Connect a Sygnia account or add a Google Sheets portfolio.
                    </p>
                    <button type="button" onClick={() => setWizardOpen(true)} className={`${paperBtnPrimary} mt-6`}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add account
                    </button>
                </PaperCard>
            )}

            {!loading && accounts.length > 0 && (
                <>
                    <PaperCard className="overflow-hidden">
                        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-[var(--paper-line)]">
                            <div className="flex h-full flex-col p-5 sm:p-6">
                                <div>
                                    <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Holdings</h2>
                                    <p className={`mt-1 ${paperEyebrow}`}>Combined in {holdingsCurrency}</p>
                                </div>
                                <div className="flex flex-1 items-center justify-center py-6">
                                    <BlurredValue>
                                        <p
                                            className={`text-center text-[2.35rem] leading-[1.1] text-[var(--paper-ink)] sm:text-5xl ${paperMoney}`}
                                        >
                                            {formatCurrency(totalHoldings, { currency: holdingsCurrency })}
                                        </p>
                                    </BlurredValue>
                                </div>
                                {(fxNote || holdingsOmitted) && (
                                    <p className="text-sm leading-snug text-[var(--paper-muted)]">
                                        {fxNote ||
                                            `Some Google Sheets values could not be converted to ${holdingsCurrency} and were left out of this total.`}
                                    </p>
                                )}
                            </div>
                            <div className="border-t border-[var(--paper-line)] p-5 md:border-t-0 sm:p-6">
                                <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Mix</h2>
                                {mix.rows.length > 0 ? (
                                    <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                                        <div className="mx-auto h-44 w-44 shrink-0 sm:mx-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={mix.rows}
                                                        dataKey="value"
                                                        nameKey="name"
                                                        innerRadius="58%"
                                                        outerRadius="88%"
                                                        paddingAngle={mix.rows.length > 1 ? 3 : 0}
                                                        startAngle={90}
                                                        endAngle={-270}
                                                        stroke="none"
                                                    >
                                                        {mix.rows.map((row) => (
                                                            <Cell key={row.id} fill={row.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        content={<MixTooltip currency={holdingsCurrency} />}
                                                        wrapperStyle={{ outline: 'none' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <ul className="min-w-0 flex-1 space-y-2.5">
                                            {mix.rows.map((row) => (
                                                <li key={row.id} className="flex items-center justify-between gap-3">
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <span
                                                            className="h-2 w-2 shrink-0 rounded-full"
                                                            style={{ background: row.color }}
                                                            aria-hidden="true"
                                                        />
                                                        <span className="truncate text-sm text-[var(--paper-ink)]">
                                                            {row.label}
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0 text-sm tabular-nums text-[var(--paper-muted)]">
                                                        {formatPercent(row.percentage, {
                                                            minimumFractionDigits: 0,
                                                            maximumFractionDigits: 0,
                                                        })}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <p className="mt-4 text-sm text-[var(--paper-muted)]">
                                        Account values will show here once they have a holdings total.
                                    </p>
                                )}
                            </div>
                        </div>
                    </PaperCard>

                    <section>
                        <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Accounts</h2>
                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {accounts.map((account) => {
                                const title = accountTitle(account)
                                const sourceLine = accountSourceLine(account)
                                const updatedLabel = accountUpdatedLabel(account)
                                const sheetsCurrency = isSheetsAccount(account)
                                    ? account.currencyCode || null
                                    : null
                                const hasMeta =
                                    Boolean(sheetsCurrency) ||
                                    Boolean(account.accountCode && !isSheetsAccount(account)) ||
                                    Boolean(updatedLabel)

                                return (
                                    <PaperCard
                                        key={account.id}
                                        as={Link}
                                        to={accountHref(account)}
                                        className="group cursor-pointer p-5 transition-colors duration-200 hover:bg-[var(--paper-canvas)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20 sm:p-6"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                {sourceLine ? (
                                                    <p className={paperEyebrow}>{sourceLine}</p>
                                                ) : null}
                                                <h3
                                                    className={`${sourceLine ? 'mt-1' : ''} truncate font-medium text-[var(--paper-ink)]`}
                                                >
                                                    {title}
                                                </h3>
                                            </div>
                                            <ChevronRight
                                                className="mt-1 h-4 w-4 shrink-0 text-[var(--paper-line)] transition-colors duration-200 group-hover:text-[var(--paper-muted)]"
                                                aria-hidden="true"
                                            />
                                        </div>
                                        <BlurredValue>
                                            <p className={`mt-5 text-2xl text-[var(--paper-ink)] ${paperMoney}`}>
                                                {formatAccountValue(account)}
                                            </p>
                                        </BlurredValue>
                                        {hasMeta ? (
                                            <p className="mt-2 truncate text-xs text-[var(--paper-muted)]">
                                                {sheetsCurrency}
                                                {account.accountCode && !isSheetsAccount(account) ? (
                                                    <span className="font-mono">{account.accountCode}</span>
                                                ) : null}
                                                {account.accountCode && !isSheetsAccount(account) && updatedLabel
                                                    ? ' · '
                                                    : null}
                                                {updatedLabel}
                                            </p>
                                        ) : null}
                                    </PaperCard>
                                )
                            })}
                        </div>
                    </section>
                </>
            )}

            <CreateAccountWizard
                isOpen={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onCreated={(account) => {
                    setWizardOpen(false)
                    if (account?.sourceId === SOURCE_IDS.GOOGLE_SHEETS && account?.slug) {
                        navigate(`/investments/sheets/${account.slug}`)
                    } else if (account?.id != null) {
                        navigate(`/investments/${account.id}`)
                    }
                }}
            />
        </div>
    )
}
