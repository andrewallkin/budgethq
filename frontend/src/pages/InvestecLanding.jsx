import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { CreditCard, Receipt, Tag, TrendingUp } from 'lucide-react'
import BlurredValue from '../components/BlurredValue'
import { BankingPageHeader } from '../components/BankingNav'
import { summarizeAccountBalances } from '../utils/accountBalances'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import { PaperCard, paperMoney } from '../components/appUi'

const CARDS = [
    {
        path: '/investec/accounts',
        label: 'Accounts',
        title: 'Review balances',
        description: 'Sync accounts, set primary and emergency fund, and manage manual accounts.',
        icon: CreditCard,
    },
    {
        path: '/investec/transactions',
        label: 'Transactions',
        title: 'Review spend',
        description: 'Browse transactions, categorize spending, and export statements.',
        icon: Receipt,
    },
    {
        path: '/investec/budget-analysis',
        label: 'Analysis',
        title: 'Compare to budget',
        description: 'See how actual spending tracks against your monthly budget.',
        icon: TrendingUp,
    },
    {
        path: '/investec/rules',
        label: 'Rules',
        title: 'Fix categories',
        description: 'Create rules so recurring merchants get the right category automatically.',
        icon: Tag,
    },
]

export default function InvestecLanding() {
    const [status, setStatus] = useState({
        loading: true,
        connected: false,
        accountCount: 0,
        totalCash: 0,
        liabilityTotal: 0,
        loanCount: 0,
        lastSynced: null,
    })

    useEffect(() => {
        const load = async () => {
            const safeGet = async (url) => {
                try {
                    const response = await axios.get(url)
                    return response.data
                } catch {
                    return null
                }
            }

            const [credentialsData, investecAccountsData, manualAccountsData] = await Promise.all([
                safeGet('/api/investec/credentials/status'),
                safeGet('/api/investec/accounts'),
                safeGet('/api/manual-accounts'),
            ])

            const investecAccounts = Array.isArray(investecAccountsData) ? investecAccountsData : []
            const manualAccounts = Array.isArray(manualAccountsData) ? manualAccountsData : []
            const activeInvestec = investecAccounts.filter((a) => a.is_active !== false)
            const balances = summarizeAccountBalances(investecAccounts, manualAccounts)

            const lastSynced = activeInvestec.reduce((latest, account) => {
                if (!account.last_synced) return latest
                const accountDate = new Date(account.last_synced)
                return !latest || accountDate > latest ? accountDate : latest
            }, null)

            setStatus({
                loading: false,
                connected: Boolean(credentialsData?.is_connected),
                accountCount: activeInvestec.length + manualAccounts.length,
                totalCash: balances.cashTotal,
                liabilityTotal: balances.liabilityTotal,
                loanCount: balances.loanCount,
                lastSynced: lastSynced && !Number.isNaN(lastSynced.getTime()) ? lastSynced : null,
            })
        }

        load()
    }, [])

    return (
        <div className="mx-auto max-w-[1080px] space-y-6">
            <BankingPageHeader
                title="Overview"
                description="Accounts, transactions, budget analysis, and categorization — in one place."
            />

            {!status.loading && (
                <PaperCard className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
                    <span className="text-sm text-[var(--paper-muted)]">
                        {status.connected ? (
                            <span className="text-[var(--paper-olive)]">Connected</span>
                        ) : (
                            <span>Not connected</span>
                        )}
                    </span>
                    <span className="text-sm text-[var(--paper-muted)]">
                        {status.accountCount} account{status.accountCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-sm text-[var(--paper-muted)]">
                        Last synced{' '}
                        {status.lastSynced
                            ? formatDateSafe(status.lastSynced.toISOString(), {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : '—'}
                    </span>
                    <span className="ml-auto text-right text-sm text-[var(--paper-ink)]">
                        <span className="block">
                            Total cash{' '}
                            <BlurredValue>
                                <span className={paperMoney}>{formatCurrency(status.totalCash)}</span>
                            </BlurredValue>
                        </span>
                        {status.loanCount > 0 ? (
                            <span className="mt-0.5 block text-xs text-[var(--paper-brick)]">
                                Liabilities{' '}
                                <BlurredValue>
                                    <span className={paperMoney}>{formatCurrency(status.liabilityTotal)}</span>
                                </BlurredValue>
                            </span>
                        ) : null}
                    </span>
                </PaperCard>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {CARDS.map(({ path, label, title, description, icon: Icon }) => (
                    <Link
                        key={path}
                        to={path}
                        className="paper-card group block cursor-pointer p-5 transition-colors hover:bg-[var(--paper-canvas)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/30 sm:p-6"
                    >
                        <div className="flex items-center gap-2 text-[var(--paper-muted)]">
                            <Icon className="h-4 w-4" aria-hidden />
                            <span className="text-xs font-medium uppercase tracking-[0.12em]">{label}</span>
                        </div>
                        <h2 className="mt-3 text-lg font-semibold text-[var(--paper-ink)]">{title}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-[var(--paper-muted)]">{description}</p>
                    </Link>
                ))}
            </div>
        </div>
    )
}
