import { useState, useEffect } from 'react'
import axios from 'axios'
import { RefreshCw, Star, Shield, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { formatCurrency, formatDateSafe, formatDateTimeSafe } from '../utils/numberFormatting'
import {
    getAccountKind,
    setAccountKind,
    setInvestecEmergencyCleared,
    clearInvestecEmergencyCleared,
    withInvestecEmergencyOverlay,
} from '../utils/accountLocalMeta'
import { summarizeAccountBalances } from '../utils/accountBalances'
import BlurredValue from '../components/BlurredValue'
import AddManualAccountModal from '../components/AddManualAccountModal'
import { BankingLoading, BankingPageHeader } from '../components/BankingNav'
import ConfirmModal from '../components/ConfirmModal'
import { useAutoClearingMessage } from '../hooks/useAutoClearingMessage'
import {
    PaperCard,
    paperDivider,
    paperEyebrow,
    paperMoney,
    paperMoneyTone,
} from '../components/appUi'

const btnBase =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const fieldInput =
    'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'

const compactToggle =
    'inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50'
const compactIdle = `${compactToggle} border border-[var(--paper-line)] bg-transparent text-[var(--paper-muted)] hover:border-[var(--paper-ink)] hover:text-[var(--paper-ink)]`
const compactOn = `${compactToggle} border border-[var(--paper-ink)]/25 bg-[var(--paper-canvas)] text-[var(--paper-ink)]`
const kindIdle = `${compactToggle} border-0 text-[var(--paper-muted)] hover:text-[var(--paper-ink)]`
const kindOn = `${compactToggle} border-0 bg-[var(--paper-ink)] text-[var(--paper-card)]`
const kindLoanOn = `${compactToggle} border-0 bg-[var(--paper-brick)]/12 text-[var(--paper-brick)]`

function StatusMarks({ marks }) {
    const visible = marks.filter(Boolean)
    if (visible.length === 0) return null
    return (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--paper-muted)]">
            {visible.map((mark, i) => (
                <span key={mark.label} className="inline-flex items-center gap-1.5">
                    {i > 0 ? <span aria-hidden="true">·</span> : null}
                    <span className={mark.className}>{mark.label}</span>
                </span>
            ))}
        </p>
    )
}

function MetaFacts({ items }) {
    return (
        <dl className="mt-3 grid max-w-xl grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {items.map((item) => (
                <div key={item.label} className="min-w-0">
                    <dt className="text-[11px] text-[var(--paper-muted)]">{item.label}</dt>
                    <dd className="mt-0.5 truncate text-sm tabular-nums text-[var(--paper-ink)]">{item.value}</dd>
                </div>
            ))}
        </dl>
    )
}

function KindToggle({ kind, onChange }) {
    return (
        <div
            role="group"
            aria-label="Account type"
            className="inline-flex rounded-full border border-[var(--paper-line)] p-0.5"
        >
            <button
                type="button"
                aria-pressed={kind !== 'loan'}
                onClick={() => onChange('cash')}
                className={kind !== 'loan' ? kindOn : kindIdle}
            >
                Cash
            </button>
            <button
                type="button"
                aria-pressed={kind === 'loan'}
                onClick={() => onChange('loan')}
                className={kind === 'loan' ? kindLoanOn : kindIdle}
            >
                Loan
            </button>
        </div>
    )
}

function shortDateTime(value) {
    if (!value) return '—'
    return formatDateTimeSafe(value, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

export default function AccountsDashboard() {
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [accounts, setAccounts] = useState([])
    const [manualAccounts, setManualAccounts] = useState([])
    const [error, setError] = useState('')
    const [success, setSuccess] = useAutoClearingMessage(8000)
    const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false)
    const [confirmDeleteManualOpen, setConfirmDeleteManualOpen] = useState(false)
    const [pendingInvestecAccountId, setPendingInvestecAccountId] = useState(null)
    const [pendingManualAccountId, setPendingManualAccountId] = useState(null)
    const [addModalOpen, setAddModalOpen] = useState(false)
    const [editingBalanceId, setEditingBalanceId] = useState(null)
    const [editingBalanceValue, setEditingBalanceValue] = useState('')
    const [metaVersion, setMetaVersion] = useState(0)

    const bumpMeta = () => setMetaVersion((n) => n + 1)

    useEffect(() => {
        fetchAllAccounts()
    }, [])

    const fetchAllAccounts = async () => {
        try {
            setError('')
            const [investecRes, manualRes] = await Promise.all([
                axios.get('/api/investec/accounts'),
                axios.get('/api/manual-accounts'),
            ])
            setAccounts(investecRes.data)
            setManualAccounts(manualRes.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load accounts')
        } finally {
            setLoading(false)
        }
    }

    const handleSyncAll = async () => {
        setError('')
        setSuccess('')
        setSyncing(true)

        try {
            await axios.post('/api/investec/accounts/sync')
            setSuccess('All accounts synced successfully')
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to sync accounts')
        } finally {
            setSyncing(false)
        }
    }

    const handleTogglePrimary = async (account) => {
        try {
            await axios.patch(`/api/investec/accounts/${account.id}`, { is_primary: !account.is_primary })
            setSuccess(account.is_primary ? 'Primary flag removed' : 'Primary account updated')
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update account')
        }
    }

    const handleToggleEmergencyFund = async (account) => {
        try {
            if (account.is_emergency_fund_account) {
                setInvestecEmergencyCleared(account.id)
                bumpMeta()
                setSuccess('Emergency fund flag removed')
                return
            }
            clearInvestecEmergencyCleared()
            bumpMeta()
            await axios.post(`/api/investec/accounts/${account.id}/set-emergency-fund`)
            setSuccess('Emergency fund account updated')
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update account')
        }
    }

    const handleKindChange = (source, accountId, kind) => {
        setAccountKind(source, accountId, kind)
        bumpMeta()
    }

    const handleDeactivateRequest = (accountId) => {
        setPendingInvestecAccountId(accountId)
        setConfirmDeactivateOpen(true)
    }

    const handleDeactivateConfirm = async () => {
        if (pendingInvestecAccountId == null) return
        const accountId = pendingInvestecAccountId
        setPendingInvestecAccountId(null)
        try {
            await axios.patch(`/api/investec/accounts/${accountId}`, { is_active: false })
            setSuccess('Account deactivated')
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to deactivate account')
        }
    }

    const handleUpdateManualAccount = async (accountId, updates) => {
        try {
            await axios.patch(`/api/manual-accounts/${accountId}`, updates)
            setSuccess('Account updated')
            setEditingBalanceId(null)
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update account')
        }
    }

    const handleDeleteManualRequest = (accountId) => {
        setPendingManualAccountId(accountId)
        setConfirmDeleteManualOpen(true)
    }

    const handleDeleteManualConfirm = async () => {
        if (pendingManualAccountId == null) return
        const accountId = pendingManualAccountId
        setPendingManualAccountId(null)
        try {
            await axios.delete(`/api/manual-accounts/${accountId}`)
            setSuccess('Account deleted')
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete account')
        }
    }

    const handleBalanceBlur = (accountId) => {
        const num = parseFloat(editingBalanceValue)
        if (!isNaN(num) && num >= 0) {
            handleUpdateManualAccount(accountId, { balance: num })
        }
        setEditingBalanceId(null)
        setEditingBalanceValue('')
    }

    const visibleInvestec = accounts
        .filter((a) => a.is_active)
        .map((account) => withInvestecEmergencyOverlay(account))

    const balances = summarizeAccountBalances(accounts, manualAccounts)
    const lastSynced =
        accounts.length > 0
            ? accounts.reduce((latest, acc) => {
                  if (!acc.last_synced) return latest
                  const accDate = new Date(acc.last_synced)
                  return accDate > latest ? accDate : latest
              }, new Date(0))
            : null

    const sortedInvestecAccounts = [...visibleInvestec].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
        if (a.is_emergency_fund_account !== b.is_emergency_fund_account) return a.is_emergency_fund_account ? -1 : 1
        return a.id - b.id
    })

    void metaVersion

    if (loading) {
        return <BankingLoading title="Accounts" message="Loading accounts…" />
    }

    return (
        <div className="mx-auto max-w-[1080px] space-y-6">
            <BankingPageHeader
                title="Accounts"
                actions={
                    <>
                        <button
                            type="button"
                            onClick={handleSyncAll}
                            disabled={syncing || accounts.length === 0}
                            className={btnPrimary}
                        >
                            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                            {syncing ? 'Syncing...' : 'Sync all'}
                        </button>
                        <button type="button" onClick={() => setAddModalOpen(true)} className={btnGhost}>
                            <Plus className="h-4 w-4" />
                            Add manual account
                        </button>
                    </>
                }
            />

            {error && (
                <PaperCard className="flex items-center gap-2 p-4 text-[var(--paper-brick)]">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <span>{error}</span>
                </PaperCard>
            )}

            {success && (
                <PaperCard className="p-4 text-[var(--paper-olive)]">{success}</PaperCard>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <PaperCard className="p-5">
                    <p className={paperEyebrow}>Total cash</p>
                    <BlurredValue>
                        <p className={`mt-3 text-right text-2xl ${paperMoney} ${paperMoneyTone(balances.cashTotal)}`}>
                            {formatCurrency(balances.cashTotal)}
                        </p>
                    </BlurredValue>
                </PaperCard>

                <PaperCard className="p-5">
                    <p className={paperEyebrow}>Liabilities</p>
                    <BlurredValue>
                        <p className={`mt-3 text-right text-2xl ${paperMoney} text-[var(--paper-brick)]`}>
                            {formatCurrency(balances.liabilityTotal)}
                        </p>
                    </BlurredValue>
                </PaperCard>

                <PaperCard className="p-5">
                    <p className={paperEyebrow}>Accounts</p>
                    <p className={`mt-3 text-right text-2xl text-[var(--paper-ink)] ${paperMoney}`}>
                        {visibleInvestec.length + manualAccounts.length}
                    </p>
                </PaperCard>

                <PaperCard className="p-5">
                    <p className={paperEyebrow}>Last synced</p>
                    <p className="mt-3 text-right text-sm font-medium tabular-nums text-[var(--paper-ink)]">
                        {lastSynced && lastSynced > new Date(0)
                            ? formatDateSafe(lastSynced.toISOString(), {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : '—'}
                    </p>
                </PaperCard>
            </div>

            <PaperCard className="p-5 sm:p-6">
                <p className={paperEyebrow}>Investec accounts</p>
                {accounts.length === 0 ? (
                    <div className="mt-6 text-center">
                        <p className="text-sm text-[var(--paper-muted)]">
                            No Investec accounts connected. Connect in Settings to sync balances and transactions.
                        </p>
                        <a href="/settings" className={`${btnPrimary} mt-4 inline-flex`}>
                            Go to Settings
                        </a>
                    </div>
                ) : (
                    <div className={`mt-1 ${paperDivider}`}>
                        {sortedInvestecAccounts.map((account) => {
                            const kind = getAccountKind('investec', account)
                            const isLoan = kind === 'loan'
                            const balance = account.current_balance || 0
                            const headline = account.reference_name || account.product_name || 'Investec'
                            const subline =
                                account.product_name && account.product_name !== headline
                                    ? account.product_name
                                    : null

                            return (
                                <article key={account.id} className="py-5">
                                    <div className="flex items-start justify-between gap-6">
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-medium text-[var(--paper-ink)]">
                                                {account.account_name}
                                            </h3>
                                            <StatusMarks
                                                marks={[
                                                    account.is_primary
                                                        ? { label: 'Primary', className: 'text-[var(--paper-ink)]' }
                                                        : null,
                                                    account.is_emergency_fund_account
                                                        ? { label: 'Emergency', className: 'text-[var(--paper-olive)]' }
                                                        : null,
                                                    isLoan
                                                        ? { label: 'Loan', className: 'text-[var(--paper-brick)]' }
                                                        : null,
                                                ]}
                                            />
                                            <p className="mt-2 text-sm text-[var(--paper-ink)]">{headline}</p>
                                            {subline ? (
                                                <p className="mt-0.5 text-xs text-[var(--paper-muted)]">{subline}</p>
                                            ) : null}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <BlurredValue>
                                                {isLoan ? (
                                                    <p className={`text-xl ${paperMoney} text-[var(--paper-brick)]`}>
                                                        {formatCurrency(Math.abs(balance))}
                                                    </p>
                                                ) : (
                                                    <p className={`text-xl ${paperMoney} ${paperMoneyTone(balance)}`}>
                                                        {formatCurrency(balance)}
                                                    </p>
                                                )}
                                            </BlurredValue>
                                        </div>
                                    </div>
                                    <MetaFacts
                                        items={[
                                            {
                                                label: 'Available',
                                                value: formatCurrency(account.available_balance || 0),
                                            },
                                            {
                                                label: 'Updated',
                                                value: shortDateTime(account.balance_updated_at),
                                            },
                                            {
                                                label: 'Synced',
                                                value: shortDateTime(account.last_synced),
                                            },
                                        ]}
                                    />
                                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                        <button
                                            type="button"
                                            aria-pressed={account.is_primary}
                                            onClick={() => handleTogglePrimary(account)}
                                            className={account.is_primary ? compactOn : compactIdle}
                                            title={account.is_primary ? 'Remove primary flag' : 'Set as primary account'}
                                        >
                                            <Star className="h-3 w-3" fill={account.is_primary ? 'currentColor' : 'none'} />
                                            Primary
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={account.is_emergency_fund_account}
                                            onClick={() => handleToggleEmergencyFund(account)}
                                            className={account.is_emergency_fund_account ? compactOn : compactIdle}
                                            title={
                                                account.is_emergency_fund_account
                                                    ? 'Remove emergency fund flag'
                                                    : 'Set as emergency fund'
                                            }
                                        >
                                            <Shield className="h-3 w-3" />
                                            Emergency
                                        </button>
                                        <KindToggle
                                            kind={kind}
                                            onChange={(next) => handleKindChange('investec', account.id, next)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleDeactivateRequest(account.id)}
                                            className="cursor-pointer px-2 py-1 text-[11px] text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-brick)]"
                                        >
                                            Deactivate
                                        </button>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                )}
            </PaperCard>

            <PaperCard className="p-5 sm:p-6">
                <p className={paperEyebrow}>Manual accounts</p>
                {manualAccounts.length === 0 ? (
                    <div className="mt-6 text-center">
                        <p className="text-sm text-[var(--paper-muted)]">
                            No manual accounts yet. Add accounts you track manually (e.g. other bank accounts).
                        </p>
                        <button type="button" onClick={() => setAddModalOpen(true)} className={`${btnGhost} mt-4`}>
                            <Plus className="h-4 w-4" />
                            Add manual account
                        </button>
                    </div>
                ) : (
                    <div className={`mt-1 ${paperDivider}`}>
                        {manualAccounts.map((account) => {
                            const kind = getAccountKind('manual', account)
                            const isLoan = kind === 'loan'
                            const balance = account.balance || 0

                            return (
                                <article key={account.id} className="py-5">
                                    {editingBalanceId === account.id ? (
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-medium text-[var(--paper-ink)]">{account.name}</h3>
                                                <p className="mt-1 text-xs text-[var(--paper-muted)]">Manual</p>
                                            </div>
                                            <BlurredValue as="div" className="w-40 shrink-0">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={editingBalanceValue}
                                                    onChange={(e) => setEditingBalanceValue(e.target.value)}
                                                    onBlur={() => handleBalanceBlur(account.id)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleBalanceBlur(account.id)}
                                                    className={`${fieldInput} text-right text-lg font-semibold tabular-nums`}
                                                    autoFocus
                                                />
                                            </BlurredValue>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex items-start justify-between gap-6">
                                                <div className="min-w-0">
                                                    <h3 className="text-sm font-medium text-[var(--paper-ink)]">{account.name}</h3>
                                                    <StatusMarks
                                                        marks={[
                                                            account.is_emergency_savings
                                                                ? { label: 'Emergency', className: 'text-[var(--paper-olive)]' }
                                                                : null,
                                                            isLoan
                                                                ? { label: 'Loan', className: 'text-[var(--paper-brick)]' }
                                                                : null,
                                                        ]}
                                                    />
                                                    <p className="mt-2 text-sm text-[var(--paper-muted)]">Manual</p>
                                                </div>
                                                <span
                                                    className="cursor-pointer rounded-md px-1 text-right transition-colors hover:bg-[var(--paper-canvas)]"
                                                    onClick={() => {
                                                        setEditingBalanceId(account.id)
                                                        setEditingBalanceValue(String(account.balance ?? 0))
                                                    }}
                                                >
                                                    <BlurredValue>
                                                        <p
                                                            className={`min-w-[6rem] text-xl ${paperMoney} ${
                                                                isLoan ? 'text-[var(--paper-brick)]' : paperMoneyTone(balance)
                                                            }`}
                                                        >
                                                            {formatCurrency(isLoan ? Math.abs(balance) : balance)}
                                                        </p>
                                                    </BlurredValue>
                                                </span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    aria-pressed={account.is_emergency_savings}
                                                    onClick={() =>
                                                        handleUpdateManualAccount(account.id, {
                                                            is_emergency_savings: !account.is_emergency_savings,
                                                        })
                                                    }
                                                    className={account.is_emergency_savings ? compactOn : compactIdle}
                                                >
                                                    <Shield className="h-3 w-3" />
                                                    Emergency
                                                </button>
                                                <KindToggle
                                                    kind={kind}
                                                    onChange={(next) => handleKindChange('manual', account.id, next)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteManualRequest(account.id)}
                                                    className="cursor-pointer rounded-md p-1.5 text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-brick)]"
                                                    title="Delete account"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            )
                        })}
                    </div>
                )}
            </PaperCard>

            <AddManualAccountModal
                isOpen={addModalOpen}
                onClose={() => setAddModalOpen(false)}
                onSuccess={() => {
                    setSuccess('Manual account added')
                    fetchAllAccounts()
                }}
            />

            <ConfirmModal
                isOpen={confirmDeactivateOpen}
                onClose={() => {
                    setConfirmDeactivateOpen(false)
                    setPendingInvestecAccountId(null)
                }}
                onConfirm={handleDeactivateConfirm}
                title="Deactivate account?"
                message="Deactivate this account? Transaction history will be preserved."
                confirmText="Deactivate"
                variant="warning"
            />

            <ConfirmModal
                isOpen={confirmDeleteManualOpen}
                onClose={() => {
                    setConfirmDeleteManualOpen(false)
                    setPendingManualAccountId(null)
                }}
                onConfirm={handleDeleteManualConfirm}
                title="Delete manual account?"
                message="Delete this manual account?"
                confirmText="Delete"
                variant="danger"
            />
        </div>
    )
}
