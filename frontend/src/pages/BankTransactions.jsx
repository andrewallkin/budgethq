import { useState, useEffect, useMemo, useRef } from 'react'
import axios from 'axios'
import { Search, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, Sparkles, Download, Link2, SlidersHorizontal, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import BlurredValue from '../components/BlurredValue'
import TransactionDetailsModal from '../components/TransactionDetailsModal'
import TransactionExportModal from '../components/TransactionExportModal'
import { BankingLoading, BankingPageHeader } from '../components/BankingNav'
import {
    PaperCard,
    PaperDialog,
    paperBtnDanger,
    paperBtnGhost,
    paperBtnPrimary,
    paperEyebrow,
    paperField,
    paperMoney,
    paperMoneyTone,
    paperSegment,
} from '../components/appUi'
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, NEUTRAL_CATEGORIES, CATEGORY_LABELS } from '../utils/transactionCategories'

const TRANSACTION_TYPES = [
    { value: 'All', label: 'All types' },
    { value: 'CREDIT', label: 'Money in' },
    { value: 'DEBIT', label: 'Money out' },
]

const DATE_PRESETS = [
    { id: 'any', label: 'Any time' },
    { id: '30', label: 'Last 30 days' },
    { id: 'month', label: 'This month' },
    { id: '90', label: 'Last 90 days' },
    { id: 'year', label: 'This year' },
]

function toIsoDate(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function datesForPreset(id) {
    const today = new Date()
    if (id === 'any') return { from_date: '', to_date: '' }
    if (id === '30' || id === '90') {
        const from = new Date(today)
        from.setDate(from.getDate() - (id === '30' ? 29 : 89))
        return { from_date: toIsoDate(from), to_date: toIsoDate(today) }
    }
    if (id === 'month') {
        return {
            from_date: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
            to_date: toIsoDate(today),
        }
    }
    return {
        from_date: toIsoDate(new Date(today.getFullYear(), 0, 1)),
        to_date: toIsoDate(today),
    }
}

function matchingDatePreset(fromDate, toDate) {
    return DATE_PRESETS.find((preset) => {
        const next = datesForPreset(preset.id)
        return next.from_date === fromDate && next.to_date === toDate
    })?.id
}

function accountDisplayName(account) {
    return account?.reference_name || account?.account_name || 'Account'
}

function parseIsoDate(value) {
    if (!value) return null
    const date = new Date(`${value}T00:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
}

function DateField({ id, label, value, onChange, placeholder }) {
    const [open, setOpen] = useState(false)
    const selected = parseIsoDate(value)
    const [year, setYear] = useState(() => (selected || new Date()).getFullYear())
    const [month, setMonth] = useState(() => (selected || new Date()).getMonth())

    useEffect(() => {
        if (!open) return
        const next = parseIsoDate(value) || new Date()
        setYear(next.getFullYear())
        setMonth(next.getMonth())
    }, [open, value])

    const shiftMonth = (delta) => {
        const next = new Date(year, month + delta, 1)
        setYear(next.getFullYear())
        setMonth(next.getMonth())
    }

    const firstWeekday = new Date(year, month, 1).getDay()
    const mondayPad = (firstWeekday + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = [...Array(mondayPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
    const monthLabel = new Date(year, month, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

    return (
        <div>
            <label className={`${paperEyebrow} mb-1.5 block`} htmlFor={id}>
                {label}
            </label>
            <button
                type="button"
                id={id}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen((current) => !current)}
                className={`${paperField} flex items-center justify-between gap-2 text-left`}
            >
                <span className={value ? 'text-[var(--paper-ink)]' : 'text-[var(--paper-muted)]'}>
                    {selected
                        ? formatDateSafe(value, { day: 'numeric', month: 'short', year: 'numeric' })
                        : placeholder}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
            </button>
            {open ? (
                <div className="mt-2 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => shiftMonth(-1)}
                            className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-md text-[var(--paper-muted)] hover:bg-[var(--paper-card)] hover:text-[var(--paper-ink)]"
                            aria-label="Previous month"
                        >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <p className="text-sm font-medium text-[var(--paper-ink)]">{monthLabel}</p>
                        <button
                            type="button"
                            onClick={() => shiftMonth(1)}
                            className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-md text-[var(--paper-muted)] hover:bg-[var(--paper-card)] hover:text-[var(--paper-ink)]"
                            aria-label="Next month"
                        >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--paper-muted)]">
                        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                            <span key={`${day}-${index}`}>{day}</span>
                        ))}
                    </div>
                    <div className="mt-1 grid grid-cols-7 gap-1">
                        {cells.map((day, index) => {
                            if (day == null) return <span key={`pad-${index}`} />
                            const iso = toIsoDate(new Date(year, month, day))
                            const isSelected = value === iso
                            return (
                                <button
                                    key={iso}
                                    type="button"
                                    onClick={() => {
                                        onChange(iso)
                                        setOpen(false)
                                    }}
                                    className={`min-h-9 cursor-pointer rounded-md text-sm tabular-nums transition-colors ${
                                        isSelected
                                            ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                            : 'text-[var(--paper-ink)] hover:bg-[var(--paper-card)]'
                                    }`}
                                >
                                    {day}
                                </button>
                            )
                        })}
                    </div>
                    {value ? (
                        <button
                            type="button"
                            onClick={() => {
                                onChange('')
                                setOpen(false)
                            }}
                            className="mt-2 cursor-pointer text-xs text-[var(--paper-muted)] hover:text-[var(--paper-ink)]"
                        >
                            Clear date
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

function AccountPicker({ accounts, value, onChange }) {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef(null)
    const selected = accounts.find((account) => String(account.id) === String(value))

    useEffect(() => {
        if (!open) return undefined
        const onDoc = (event) => {
            if (!wrapRef.current?.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDoc)
        window.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDoc)
            window.removeEventListener('keydown', onKey)
        }
    }, [open])

    const choose = (nextValue) => {
        onChange(nextValue)
        setOpen(false)
    }

    return (
        <div ref={wrapRef} className="relative">
            <p className={`${paperEyebrow} mb-1.5`} id="txn-account-label">
                Account
            </p>
            <button
                type="button"
                aria-labelledby="txn-account-label"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className={`${paperField} flex items-center gap-2 text-left`}
            >
                <Wallet className="h-4 w-4 shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                    {selected ? accountDisplayName(selected) : 'All accounts'}
                    {selected?.is_primary ? (
                        <span className="text-[var(--paper-muted)]"> · Primary</span>
                    ) : null}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
            </button>
            {open ? (
                <ul
                    role="listbox"
                    aria-labelledby="txn-account-label"
                    className="absolute z-20 mt-1 max-h-72 w-full min-w-[16rem] overflow-auto rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] py-1"
                >
                    <li>
                        <button
                            type="button"
                            role="option"
                            aria-selected={!value}
                            onClick={() => choose('')}
                            className={`flex w-full cursor-pointer flex-col items-start px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--paper-canvas)] ${
                                !value ? 'bg-[var(--paper-canvas)] text-[var(--paper-ink)]' : 'text-[var(--paper-ink)]'
                            }`}
                        >
                            All accounts
                            <span className="mt-0.5 text-xs text-[var(--paper-muted)]">Every connected account</span>
                        </button>
                    </li>
                    {accounts.map((account) => {
                        const selectedAccount = String(account.id) === String(value)
                        return (
                            <li key={account.id}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={selectedAccount}
                                    onClick={() => choose(String(account.id))}
                                    className={`flex w-full cursor-pointer flex-col items-start px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--paper-canvas)] ${
                                        selectedAccount ? 'bg-[var(--paper-canvas)]' : ''
                                    }`}
                                >
                                    {accountDisplayName(account)}
                                    <span className="mt-0.5 text-xs text-[var(--paper-muted)]">
                                        {account.is_primary ? 'Primary · default' : 'Connected account'}
                                    </span>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            ) : null}
        </div>
    )
}

function CategoryOptions() {
    return (
        <>
            <optgroup label="Income">
                {INCOME_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                    </option>
                ))}
            </optgroup>
            <optgroup label="Expenses">
                {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                    </option>
                ))}
            </optgroup>
            <optgroup label="Neutral">
                {NEUTRAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                    </option>
                ))}
            </optgroup>
        </>
    )
}

function groupTransactionsByDate(transactions) {
    const groups = []
    let currentKey = null
    for (const txn of transactions) {
        const key = String(txn.transaction_date || '').slice(0, 10)
        if (key !== currentKey) {
            currentKey = key
            groups.push({ key, items: [txn] })
        } else {
            groups[groups.length - 1].items.push(txn)
        }
    }
    return groups
}

function signedAmountFor(txn) {
    const abs = Math.abs(Number(txn.amount) || 0)
    return txn.transaction_type === 'CREDIT' ? abs : -abs
}

export default function BankTransactions() {
    const [loading, setLoading] = useState(true)
    const [transactions, setTransactions] = useState([])
    const [accounts, setAccounts] = useState([])
    const [error, setError] = useState('')
    const [hasMore, setHasMore] = useState(false)
    const [categorizingId, setCategorizingId] = useState(null)
    const [showBulkCategorizeModal, setShowBulkCategorizeModal] = useState(false)
    const [bulkCategorizing, setBulkCategorizing] = useState(false)
    const [bulkResults, setBulkResults] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [transactionToDelete, setTransactionToDelete] = useState(null)
    const [deletingId, setDeletingId] = useState(null)
    const [showDetailsModal, setShowDetailsModal] = useState(false)
    const [selectedTransaction, setSelectedTransaction] = useState(null)
    const [showExportModal, setShowExportModal] = useState(false)

    const [filters, setFilters] = useState({
        from_date: '',
        to_date: '',
        account_id: '',
        category: '',
        transaction_type: 'All',
        search: '',
        limit: 50,
        offset: 0,
    })

    const [showFilterDialog, setShowFilterDialog] = useState(false)
    const [filterDraft, setFilterDraft] = useState({
        from_date: '',
        to_date: '',
        category: '',
        transaction_type: 'All',
    })
    const [accountsLoaded, setAccountsLoaded] = useState(false)
    const initialLoadDoneRef = useRef(false)

    useEffect(() => {
        fetchAccounts()
    }, [])

    useEffect(() => {
        if (!accountsLoaded || initialLoadDoneRef.current) return
        initialLoadDoneRef.current = true
        const primary = accounts.find((a) => a.is_primary)
        const initialAccountId = primary ? String(primary.id) : ''
        setFilters((prev) => ({ ...prev, account_id: initialAccountId }))
        fetchTransactionsWithOverrides({ account_id: initialAccountId })
    }, [accountsLoaded, accounts])

    const fetchAccounts = async () => {
        try {
            const response = await axios.get('/api/investec/accounts')
            setAccounts(response.data)
        } catch (err) {
            console.error('Failed to load accounts:', err)
        } finally {
            setAccountsLoaded(true)
        }
    }

    const buildParams = (overrides = {}) => {
        const merged = { ...filters, ...overrides }
        const params = new URLSearchParams()
        if (merged.from_date) params.append('from_date', merged.from_date)
        if (merged.to_date) params.append('to_date', merged.to_date)
        if (merged.account_id) params.append('account_id', merged.account_id)
        if (merged.transaction_type !== 'All') params.append('transaction_type', merged.transaction_type)
        if (merged.search) params.append('search', merged.search)
        if (merged.category) params.append('category', merged.category)
        params.append('limit', merged.limit)
        return params
    }

    const fetchTransactions = async (append = false, overrides = {}) => {
        try {
            const params = buildParams(overrides)
            params.set('offset', append ? String(transactions.length) : '0')

            const response = await axios.get(`/api/investec/transactions?${params.toString()}`)

            if (append) {
                setTransactions((prev) => [...prev, ...response.data])
            } else {
                setTransactions(response.data)
            }

            setHasMore(response.data.length === (overrides.limit ?? filters.limit))
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load transactions')
        } finally {
            setLoading(false)
        }
    }

    const fetchTransactionsWithOverrides = (overrides = {}) => {
        setLoading(true)
        fetchTransactions(false, overrides)
    }

    const refreshSelectedTransaction = async () => {
        if (!selectedTransaction) {
            fetchTransactions()
            return
        }

        try {
            const response = await axios.get(
                `/api/investec/transactions/${selectedTransaction.id}`,
            )
            const updated = response.data
            setSelectedTransaction(updated)
            setTransactions((prev) =>
                prev.map((txn) => (txn.id === updated.id ? updated : txn)),
            )
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to refresh transaction')
        }
    }

    const handleApplyFilters = () => {
        setLoading(true)
        fetchTransactions()
    }

    const handleLoadMore = () => {
        fetchTransactions(true)
    }

    const handleCategoryChange = async (transactionId, newCategory) => {
        setError('')

        try {
            const response = await axios.patch(`/api/investec/transactions/${transactionId}`, {
                category: newCategory || null,
            })

            setTransactions(transactions.map((txn) => (txn.id === transactionId ? response.data : txn)))
            if (selectedTransaction?.id === transactionId) {
                setSelectedTransaction(response.data)
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update category')
            fetchTransactions()
        }
    }

    const handleCategorizeWithAI = async (transactionId) => {
        setCategorizingId(transactionId)
        setError('')

        try {
            const response = await axios.post(`/api/investec/transactions/${transactionId}/categorize-ai`)

            setTransactions(
                transactions.map((txn) =>
                    txn.id === transactionId
                        ? {
                              ...txn,
                              category: response.data.category,
                              ai_category_confidence: response.data.confidence,
                              user_corrected: response.data.user_corrected,
                          }
                        : txn
                )
            )
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to categorize transaction')
            fetchTransactions()
        } finally {
            setCategorizingId(null)
        }
    }

    const handleSyncTransactions = async () => {
        setSyncing(true)
        setError('')
        try {
            await axios.post('/api/investec/transactions/sync')
            await fetchTransactions()
        } catch (err) {
            setError(err.response?.data?.detail || 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }

    const handleDeleteTransaction = async () => {
        if (!transactionToDelete) return
        setDeletingId(transactionToDelete.id)
        setError('')

        try {
            await axios.delete(`/api/investec/transactions/${transactionToDelete.id}`)
            setTransactions(transactions.filter((txn) => txn.id !== transactionToDelete.id))
            setTransactionToDelete(null)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete transaction')
        } finally {
            setDeletingId(null)
        }
    }

    const handleBulkCategorize = async () => {
        setBulkCategorizing(true)
        setError('')

        try {
            const response = await axios.post('/api/investec/transactions/categorize-all-ai')
            setShowBulkCategorizeModal(false)
            setBulkResults(response.data)
            await fetchTransactions()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to categorize transactions')
            setShowBulkCategorizeModal(false)
        } finally {
            setBulkCategorizing(false)
        }
    }

    const activeAccounts = accounts.filter((a) => a.is_active)
    const noAccountsConnected = accountsLoaded && activeAccounts.length === 0
    const groupedTransactions = useMemo(() => groupTransactionsByDate(transactions), [transactions])
    const handleAccountChange = (accountId) => {
        setFilters((prev) => ({ ...prev, account_id: accountId }))
        setLoading(true)
        fetchTransactions(false, { account_id: accountId })
    }

    const openFilterDialog = () => {
        setFilterDraft({
            from_date: filters.from_date,
            to_date: filters.to_date,
            category: filters.category,
            transaction_type: filters.transaction_type,
        })
        setShowFilterDialog(true)
    }

    const applyFilterDraft = () => {
        setFilters((prev) => ({ ...prev, ...filterDraft }))
        setShowFilterDialog(false)
        setLoading(true)
        fetchTransactions(false, filterDraft)
    }

    const resetFilterDraft = () => {
        const cleared = {
            from_date: '',
            to_date: '',
            category: '',
            transaction_type: 'All',
        }
        setFilterDraft(cleared)
        setFilters((prev) => ({ ...prev, ...cleared }))
        setShowFilterDialog(false)
        setLoading(true)
        fetchTransactions(false, cleared)
    }

    const extraFilterCount = [
        filters.from_date,
        filters.to_date,
        filters.category,
        filters.transaction_type !== 'All',
    ].filter(Boolean).length
    const draftPreset = matchingDatePreset(filterDraft.from_date, filterDraft.to_date)

    const openDetails = (txn) => {
        setSelectedTransaction(txn)
        setShowDetailsModal(true)
    }

    if (loading && transactions.length === 0) {
        return <BankingLoading title="Transactions" message="Loading transactions…" />
    }

    return (
        <div className="mx-auto max-w-[1080px] space-y-6">
            <BankingPageHeader
                title="Transactions"
                actions={
                    <>
                        <button type="button" onClick={handleSyncTransactions} disabled={syncing} className={paperBtnPrimary}>
                            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                            {syncing ? 'Syncing…' : 'Sync'}
                        </button>
                        <button type="button" onClick={() => setShowBulkCategorizeModal(true)} className={paperBtnGhost}>
                            Categorize all
                        </button>
                        <button type="button" onClick={() => setShowExportModal(true)} className={paperBtnGhost}>
                            <Download className="h-4 w-4" aria-hidden="true" />
                            Export
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

            <PaperCard className="p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)_auto] lg:items-end">
                    <div>
                        <label className={`${paperEyebrow} mb-1.5 block`} htmlFor="txn-search">
                            Search
                        </label>
                        <div className="relative">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-muted)]"
                                aria-hidden="true"
                            />
                            <input
                                id="txn-search"
                                type="search"
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
                                placeholder="Merchant, description, or reference"
                                className={`${paperField} pl-9`}
                            />
                        </div>
                    </div>

                    <AccountPicker
                        accounts={activeAccounts}
                        value={filters.account_id}
                        onChange={handleAccountChange}
                    />

                    <button
                        type="button"
                        onClick={openFilterDialog}
                        className={`${paperBtnGhost} ${extraFilterCount > 0 ? 'border-[var(--paper-ink)]' : ''}`}
                        aria-haspopup="dialog"
                        aria-expanded={showFilterDialog}
                    >
                        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                        Filters
                        {extraFilterCount > 0 ? (
                            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--paper-ink)] px-1.5 text-[11px] font-medium text-[var(--paper-card)]">
                                {extraFilterCount}
                            </span>
                        ) : null}
                    </button>
                </div>
            </PaperCard>

            <PaperDialog
                open={showFilterDialog}
                onClose={() => setShowFilterDialog(false)}
                title="Filters"
                description="Narrow the list by date, money direction, or category. Leave fields on their defaults to show everything."
                maxWidth="max-w-lg"
                footer={
                    <>
                        <button type="button" onClick={resetFilterDraft} className={paperBtnGhost}>
                            Reset
                        </button>
                        <button type="button" onClick={applyFilterDraft} className={paperBtnPrimary}>
                            Show results
                        </button>
                    </>
                }
            >
                <div className="space-y-6">
                    <div>
                        <p className={`${paperEyebrow} mb-2`}>Date range</p>
                        <div className="mb-3 flex flex-wrap gap-2">
                            {DATE_PRESETS.map((preset) => {
                                const active = draftPreset === preset.id
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() =>
                                            setFilterDraft((prev) => ({ ...prev, ...datesForPreset(preset.id) }))
                                        }
                                        className={`min-h-9 cursor-pointer rounded-full border px-3 text-sm transition-colors ${
                                            active
                                                ? 'border-[var(--paper-ink)] bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                                : 'border-[var(--paper-line)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]'
                                        }`}
                                        aria-pressed={active}
                                    >
                                        {preset.label}
                                    </button>
                                )
                            })}
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <DateField
                                id="txn-from"
                                label="From"
                                value={filterDraft.from_date}
                                onChange={(from_date) => setFilterDraft((prev) => ({ ...prev, from_date }))}
                                placeholder="Any start date"
                            />
                            <DateField
                                id="txn-to"
                                label="To"
                                value={filterDraft.to_date}
                                onChange={(to_date) => setFilterDraft((prev) => ({ ...prev, to_date }))}
                                placeholder="Any end date"
                            />
                        </div>
                    </div>

                    <div>
                        <p className={`${paperEyebrow} mb-1.5`} id="txn-type-label">
                            Direction
                        </p>
                        <div className={`${paperSegment} w-full`} role="group" aria-labelledby="txn-type-label">
                            {TRANSACTION_TYPES.map((type) => {
                                const active = filterDraft.transaction_type === type.value
                                return (
                                    <button
                                        key={type.value}
                                        type="button"
                                        onClick={() =>
                                            setFilterDraft((prev) => ({
                                                ...prev,
                                                transaction_type: type.value,
                                            }))
                                        }
                                        className={`min-h-9 min-w-0 flex-1 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors ${
                                            active
                                                ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                                : 'text-[var(--paper-muted)] hover:text-[var(--paper-ink)]'
                                        }`}
                                        aria-pressed={active}
                                    >
                                        {type.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <label className={`${paperEyebrow} mb-1.5 block`} htmlFor="txn-category">
                            Category
                        </label>
                        <select
                            id="txn-category"
                            value={filterDraft.category}
                            onChange={(e) => setFilterDraft((prev) => ({ ...prev, category: e.target.value }))}
                            className={paperField}
                        >
                            <option value="">Any category</option>
                            <option value="uncategorized">Uncategorized only</option>
                            <CategoryOptions />
                        </select>
                    </div>
                </div>
            </PaperDialog>

            <PaperCard className="overflow-hidden">
                {transactions.length > 0 ? (
                    <div>
                        {groupedTransactions.map((group) => (
                            <section
                                key={group.key || 'undated'}
                                className="border-t border-[var(--paper-line)] first:border-t-0"
                            >
                                <header className="flex items-end justify-between gap-3 border-b border-[var(--paper-line)] bg-[var(--paper-canvas)] px-4 py-3.5 sm:px-5">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--paper-muted)]">
                                            {formatDateSafe(group.key, { weekday: 'long' })}
                                        </p>
                                        <h2 className="mt-0.5 text-base font-semibold tracking-tight text-[var(--paper-ink)] sm:text-lg">
                                            {formatDateSafe(group.key, {
                                                day: 'numeric',
                                                month: 'long',
                                                year: 'numeric',
                                            })}
                                        </h2>
                                    </div>
                                    <p className="shrink-0 pb-0.5 text-xs tabular-nums text-[var(--paper-muted)]">
                                        {group.items.length}
                                        {group.items.length === 1 ? ' item' : ' items'}
                                    </p>
                                </header>
                                <ul>
                                    {group.items.map((txn) => {
                                        const signedAmount = signedAmountFor(txn)
                                        const needsAi = !txn.category && !txn.user_corrected

                                        return (
                                            <li
                                                key={txn.id}
                                                className="border-b border-[var(--paper-line)] last:border-0"
                                            >
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-[var(--paper-canvas)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--paper-accent)]/20 sm:gap-4 sm:px-5"
                                                    onClick={(e) => {
                                                        if (e.target.closest('button, select')) return
                                                        openDetails(txn)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.target.closest('button, select')) return
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault()
                                                            openDetails(txn)
                                                        }
                                                    }}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-start gap-2">
                                                            {txn.status === 'PENDING' && (
                                                                <span
                                                                    className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--paper-accent)]"
                                                                    title="Pending"
                                                                />
                                                            )}
                                                            {txn.has_links && (
                                                                <Link2
                                                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]"
                                                                    aria-hidden="true"
                                                                />
                                                            )}
                                                            <p className="break-words text-sm text-[var(--paper-ink)]">
                                                                {txn.description}
                                                            </p>
                                                        </div>
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                            <select
                                                                aria-label={`Category for ${txn.description}`}
                                                                value={txn.category || ''}
                                                                onChange={(e) =>
                                                                    handleCategoryChange(txn.id, e.target.value)
                                                                }
                                                                className="max-w-full cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 pl-1 pr-6 text-xs text-[var(--paper-muted)] transition-colors hover:border-[var(--paper-line)] hover:bg-[var(--paper-canvas)] focus:border-[var(--paper-line)] focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                                                            >
                                                                <option value="">Uncategorized</option>
                                                                <CategoryOptions />
                                                            </select>
                                                            {needsAi && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCategorizeWithAI(txn.id)}
                                                                    disabled={categorizingId === txn.id}
                                                                    className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20 disabled:opacity-50"
                                                                    aria-label="Auto-categorize with AI"
                                                                >
                                                                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                                                    {categorizingId === txn.id ? 'Working…' : 'AI'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <BlurredValue>
                                                        <p
                                                            className={`shrink-0 pt-0.5 text-right text-sm ${paperMoney} ${paperMoneyTone(signedAmount)}`}
                                                        >
                                                            {signedAmount > 0 ? '+' : ''}
                                                            {formatCurrency(signedAmount)}
                                                        </p>
                                                    </BlurredValue>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </section>
                        ))}
                    </div>
                ) : (
                    <div className="px-5 py-14 text-center">
                        {noAccountsConnected ? (
                            <>
                                <p className="text-sm text-[var(--paper-muted)]">
                                    No Investec accounts connected yet.
                                </p>
                                <Link to="/settings" className={`${paperBtnPrimary} mt-4 inline-flex`}>
                                    Connect in Settings
                                </Link>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-[var(--paper-muted)]">
                                    No transactions match your filters.
                                </p>
                                <p className="mt-2 text-sm text-[var(--paper-muted)]">
                                    Sync to pull the latest from Investec, or try a different search.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleSyncTransactions}
                                    disabled={syncing}
                                    className={`${paperBtnPrimary} mt-4`}
                                >
                                    <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                                    Sync transactions
                                </button>
                            </>
                        )}
                    </div>
                )}

                {hasMore && (
                    <div className="border-t border-[var(--paper-line)] p-4 text-center">
                        <button type="button" onClick={handleLoadMore} className={paperBtnGhost}>
                            Load more
                        </button>
                    </div>
                )}
            </PaperCard>

            <TransactionDetailsModal
                isOpen={showDetailsModal}
                onClose={() => {
                    setShowDetailsModal(false)
                    setSelectedTransaction(null)
                }}
                transaction={selectedTransaction}
                account={accounts.find((a) => a.id === selectedTransaction?.account_id)}
                onDelete={(txn) => {
                    setShowDetailsModal(false)
                    setSelectedTransaction(null)
                    setTransactionToDelete(txn)
                }}
                deletingId={deletingId}
                onTransactionUpdated={refreshSelectedTransaction}
            />

            <PaperDialog
                open={showBulkCategorizeModal}
                onClose={() => setShowBulkCategorizeModal(false)}
                title="Categorize all with AI?"
                description="This uses your OpenAI key on every uncategorized transaction and may incur costs."
                disableClose={bulkCategorizing}
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setShowBulkCategorizeModal(false)}
                            disabled={bulkCategorizing}
                            className={paperBtnGhost}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleBulkCategorize}
                            disabled={bulkCategorizing}
                            className={paperBtnPrimary}
                        >
                            {bulkCategorizing ? 'Categorizing…' : 'Categorize all'}
                        </button>
                    </>
                }
            />

            <PaperDialog
                open={Boolean(transactionToDelete)}
                onClose={() => setTransactionToDelete(null)}
                title="Delete transaction?"
                disableClose={Boolean(deletingId)}
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => setTransactionToDelete(null)}
                            disabled={Boolean(deletingId)}
                            className={paperBtnGhost}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleDeleteTransaction}
                            disabled={deletingId === transactionToDelete?.id}
                            className={paperBtnDanger}
                        >
                            {deletingId === transactionToDelete?.id ? 'Deleting…' : 'Delete'}
                        </button>
                    </>
                }
            >
                {transactionToDelete && (
                    <div>
                        <p className="break-words text-sm text-[var(--paper-ink)]">
                            {transactionToDelete.description}
                        </p>
                        <p
                            className={`mt-3 text-xl ${paperMoney} ${paperMoneyTone(signedAmountFor(transactionToDelete))}`}
                        >
                            {transactionToDelete.transaction_type === 'CREDIT' ? '+' : '-'}
                            <BlurredValue>{formatCurrency(Math.abs(transactionToDelete.amount))}</BlurredValue>
                        </p>
                    </div>
                )}
            </PaperDialog>

            <TransactionExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                accounts={accounts}
                initialFromDate={filters.from_date}
                initialToDate={filters.to_date}
            />

            <PaperDialog
                open={Boolean(bulkResults)}
                onClose={() => setBulkResults(null)}
                title="Categorization complete"
                footer={
                    <button type="button" onClick={() => setBulkResults(null)} className={`${paperBtnPrimary} w-full sm:w-auto`}>
                        Close
                    </button>
                }
            >
                {bulkResults && (
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between gap-4">
                            <dt className="text-[var(--paper-muted)]">Total</dt>
                            <dd className="tabular-nums text-[var(--paper-ink)]">{bulkResults.total}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-[var(--paper-muted)]">Categorized</dt>
                            <dd className="tabular-nums text-[var(--paper-olive)]">{bulkResults.categorized}</dd>
                        </div>
                        {bulkResults.failed > 0 && (
                            <div className="flex justify-between gap-4">
                                <dt className="text-[var(--paper-muted)]">Failed</dt>
                                <dd className="tabular-nums text-[var(--paper-brick)]">{bulkResults.failed}</dd>
                            </div>
                        )}
                    </dl>
                )}
            </PaperDialog>
        </div>
    )
}
