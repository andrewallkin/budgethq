import { useState, useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import BlurredValue from '../components/BlurredValue'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatPercent } from '../utils/numberFormatting'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EARNINGS_CATEGORIES, EXPENSE_CATEGORIES, OFFSET_CATEGORIES, CATEGORY_LABELS } from '../utils/transactionCategories'
import { BankingLoading, BankingPageHeader } from '../components/BankingNav'
import {
    PAPER_BUDGET_COLORS,
    PAPER_CHART,
    PaperCard,
    paperBtnGhost,
    paperDivider,
    paperEyebrow,
    paperIconBtn,
    paperMoney,
    paperMoneyTone,
} from '../components/appUi'

const PAPER_CATEGORY_COLORS = {
    needs: PAPER_BUDGET_COLORS.Needs,
    wants: PAPER_BUDGET_COLORS.Wants,
    savings: PAPER_BUDGET_COLORS.Savings,
    default: PAPER_CHART.olive,
    accent: PAPER_CHART.khaki,
    umber: PAPER_CHART.umber,
}

const SPEND_BREAKDOWN_COLORS = [
    PAPER_CATEGORY_COLORS.umber,
    PAPER_CATEGORY_COLORS.accent,
    PAPER_CATEGORY_COLORS.default,
    PAPER_CATEGORY_COLORS.needs,
    PAPER_CATEGORY_COLORS.wants,
    PAPER_BUDGET_COLORS.Unallocated,
]

function formatPeriodRange(fromDate, toDate) {
    const from = new Date(fromDate)
    const to = new Date(toDate)
    const opts = { day: 'numeric', month: 'short', year: 'numeric' }
    return `${from.toLocaleDateString('en-ZA', opts)} – ${to.toLocaleDateString('en-ZA', opts)}`
}

function monthKeyFromParts(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`
}

function shiftMonthKey(key, delta) {
    const [year, month] = key.split('-').map(Number)
    const next = new Date(year, month - 1 + delta, 1)
    return monthKeyFromParts(next.getFullYear(), next.getMonth() + 1)
}

function formatMonthLabel(key) {
    const [year, month] = key.split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
}

function PeriodSwitcher({ value, isCurrent, onChange, onCurrent }) {
    return (
        <div className="inline-flex items-center rounded-lg border border-[var(--paper-line)] bg-[var(--paper-card)] p-1">
            <button
                type="button"
                className={paperIconBtn}
                aria-label="Previous period"
                onClick={() => onChange(shiftMonthKey(value, -1))}
            >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <label className="relative mx-0.5 block h-10 w-[7.75rem] cursor-pointer">
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium tabular-nums text-[var(--paper-ink)]">
                    {formatMonthLabel(value)}
                </span>
                <span className="sr-only">Budget period</span>
                <input
                    type="month"
                    value={value}
                    onChange={(e) => {
                        if (e.target.value) onChange(e.target.value)
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </label>
            <button
                type="button"
                className={paperIconBtn}
                aria-label="Next period"
                onClick={() => onChange(shiftMonthKey(value, 1))}
            >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            {isCurrent ? null : (
                <button
                    type="button"
                    onClick={onCurrent}
                    className={`${paperIconBtn} px-3 text-sm font-medium`}
                >
                    Now
                </button>
            )}
        </div>
    )
}

function formatAxisRand(value) {
    const n = Number(value) || 0
    if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`
    return String(Math.round(n))
}

function splitCategoryLabel(value) {
    const raw = String(value ?? '')
    if (raw.includes('&')) {
        const [left, ...rest] = raw.split(/\s*&\s*/)
        return [`${left} &`, rest.join(' & ')]
    }
    if (raw.length <= 18) return [raw]
    const cut = raw.lastIndexOf(' ', 16)
    return [raw.slice(0, cut > 8 ? cut : 16), raw.slice(cut > 8 ? cut + 1 : 16)]
}

function CategoryTick({ x, y, payload }) {
    const lines = splitCategoryLabel(payload?.value)
    return (
        <g transform={`translate(${x},${y})`}>
            <text textAnchor="end" fill="var(--paper-ink)" fontSize={12}>
                {lines.map((line, i) => (
                    <tspan key={`${line}-${i}`} x={0} dy={i === 0 ? (lines.length > 1 ? -7 : 4) : 14}>
                        {line}
                    </tspan>
                ))}
            </text>
        </g>
    )
}

function PaperChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    return (
        <div className="min-w-[200px] rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 shadow-sm">
            <p className="text-xs text-[var(--paper-muted)]">{label}</p>
            <ul className="mt-2 space-y-1.5">
                {payload.map((row) => (
                    <li key={row.dataKey || row.name} className="flex items-center justify-between gap-6 text-sm">
                        <span className="inline-flex items-center gap-2 text-[var(--paper-muted)]">
                            <span className="h-2 w-2 rounded-full" style={{ background: row.color || row.payload?.color }} aria-hidden="true" />
                            {row.name}
                        </span>
                        <span className={`tabular-nums text-[var(--paper-ink)] ${paperMoney}`}>
                            {formatCurrency(row.value)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function PaceBar({ budgeted, actual }) {
    const scale = Math.max(budgeted, actual, 1)
    const budgetPct = Math.min(100, (budgeted / scale) * 100)
    const actualPct = Math.min(100, (actual / scale) * 100)
    const over = actual > budgeted && budgeted > 0
    const unbudgeted = budgeted <= 0 && actual > 0

    return (
        <div className="mt-2 space-y-1" aria-hidden="true">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-line)]">
                <div
                    className="h-full rounded-full bg-[var(--paper-accent)]"
                    style={{ width: `${budgetPct}%` }}
                />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-line)]">
                <div
                    className="h-full rounded-full"
                    style={{
                        width: `${actualPct}%`,
                        background: over || unbudgeted ? 'var(--paper-brick)' : 'var(--paper-olive)',
                    }}
                />
            </div>
        </div>
    )
}

function KpiCell({ label, value, hint, toneClass = 'text-[var(--paper-ink)]', children }) {
    return (
        <div className="p-5 sm:p-6">
            <p className={paperEyebrow}>{label}</p>
            <BlurredValue>
                <p className={`mt-3 text-3xl ${paperMoney} ${toneClass}`}>{value}</p>
            </BlurredValue>
            {hint ? <p className="mt-2 text-sm leading-relaxed text-[var(--paper-muted)]">{hint}</p> : null}
            {children}
        </div>
    )
}

export default function BudgetAnalysis() {
    const { blurSensitiveValues } = useAuth()
    const [loading, setLoading] = useState(true)
    const [budget, setBudget] = useState(null)
    const [transactions, setTransactions] = useState([])
    const [error, setError] = useState('')
    const [periodRange, setPeriodRange] = useState(null)

    const [selectedMonth, setSelectedMonth] = useState(null)
    const [currentPeriodKey, setCurrentPeriodKey] = useState(null)
    const [expandedCategory, setExpandedCategory] = useState(null)
    const [showIdleCategories, setShowIdleCategories] = useState(false)

    const rememberCurrentPeriod = (year, month) => {
        const key = monthKeyFromParts(year, month)
        setCurrentPeriodKey(key)
        return key
    }

    useEffect(() => {
        if (selectedMonth === null) {
            axios.get('/api/budget/period/current')
                .then((res) => {
                    setSelectedMonth(rememberCurrentPeriod(res.data.end_year, res.data.end_month))
                })
                .catch(() => {
                    const now = new Date()
                    setSelectedMonth(rememberCurrentPeriod(now.getFullYear(), now.getMonth() + 1))
                })
            return
        }
        setExpandedCategory(null)
        fetchData()
    }, [selectedMonth])

    const fetchData = async () => {
        setLoading(true)
        setError('')
        try {
            const budgetResponse = await axios.get('/api/budget/default_user')
            setBudget(budgetResponse.data)

            const [year, month] = selectedMonth.split('-').map(Number)
            const periodResponse = await axios.get(`/api/budget/period?year=${year}&month=${month}`)
            const { from_date: fromDate, to_date: toDate } = periodResponse.data
            setPeriodRange({ from_date: fromDate, to_date: toDate })

            const txnResponse = await axios.get(`/api/investec/transactions?from_date=${fromDate}&to_date=${toDate}&limit=500`)
            setTransactions(txnResponse.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load data')
        } finally {
            setLoading(false)
        }
    }

    const handleCurrentMonth = async () => {
        try {
            const response = await axios.get('/api/budget/period/current')
            setSelectedMonth(rememberCurrentPeriod(response.data.end_year, response.data.end_month))
        } catch (err) {
            const now = new Date()
            setSelectedMonth(rememberCurrentPeriod(now.getFullYear(), now.getMonth() + 1))
        }
    }

    const SPEND_KEYS = [...EXPENSE_CATEGORIES, 'transfers', 'uncategorized']

    const aggregateSpending = (txns) => {
        const spending = { income: 0 }
        SPEND_KEYS.forEach(k => { spending[k] = 0 })

        txns.forEach(txn => {
            if (!txn.category) {
                if (txn.transaction_type === 'DEBIT') {
                    spending.uncategorized += Math.abs(txn.amount)
                }
            } else if (EARNINGS_CATEGORIES.includes(txn.category)) {
                if (txn.transaction_type === 'CREDIT') {
                    spending.income += txn.amount
                }
            } else if (spending.hasOwnProperty(txn.category)) {
                if (txn.transaction_type === 'DEBIT') {
                    spending[txn.category] += Math.abs(txn.amount)
                }
            }
        })

        const categoryOffsets = {}
        txns.forEach(txn => {
            if (txn.transaction_type !== 'DEBIT' || !txn.linked_credits?.length || !txn.category) {
                return
            }
            if (!EXPENSE_CATEGORIES.includes(txn.category)) {
                return
            }
            const offset = txn.linked_credits.reduce((sum, link) => sum + link.link_amount, 0)
            categoryOffsets[txn.category] = (categoryOffsets[txn.category] || 0) + offset
        })

        Object.entries(categoryOffsets).forEach(([category, offset]) => {
            if (spending[category] !== undefined) {
                spending[category] = Math.max(0, spending[category] - offset)
            }
        })

        return spending
    }

    const computeOffsetTotals = (txns) => {
        const allocatedByCreditId = {}
        const loadedDebitIds = new Set(
            txns.filter(t => t.transaction_type === 'DEBIT').map(t => t.id)
        )
        let linkedOffsetTotal = 0

        txns.forEach(txn => {
            txn.linked_credits?.forEach(link => {
                allocatedByCreditId[link.transaction_id] =
                    (allocatedByCreditId[link.transaction_id] || 0) + link.link_amount
                linkedOffsetTotal += link.link_amount
            })
            txn.linked_debits?.forEach(link => {
                if (!loadedDebitIds.has(link.transaction_id)) {
                    linkedOffsetTotal += link.link_amount
                }
            })
        })

        let unlinkedRefundTotal = 0
        let unlinkedReimbursementTotal = 0
        let reimbursementsTotal = 0

        txns.forEach(txn => {
            if (txn.transaction_type !== 'CREDIT' || !OFFSET_CATEGORIES.includes(txn.category)) {
                return
            }
            const amount = Math.abs(txn.amount)
            if (txn.category === 'reimbursements') {
                reimbursementsTotal += amount
            }
            const allocated = txn.linked_debits?.length
                ? txn.linked_debits.reduce((sum, link) => sum + link.link_amount, 0)
                : (allocatedByCreditId[txn.id] || 0)
            const unallocated = amount - allocated
            if (unallocated <= 0.009) {
                return
            }
            if (txn.category === 'refund') {
                unlinkedRefundTotal += unallocated
            } else if (txn.category === 'reimbursements') {
                unlinkedReimbursementTotal += unallocated
            }
        })

        return {
            unlinkedRefundTotal,
            unlinkedReimbursementTotal,
            unlinkedOffsetTotal: unlinkedRefundTotal + unlinkedReimbursementTotal,
            linkedOffsetTotal,
            reimbursementsTotal,
        }
    }

    const mapBudgetedAmounts = () => {
        const monthly = {}
        SPEND_KEYS.forEach(k => { monthly[k] = 0 })

        if (!budget) return monthly

        const allItems = [...(budget.needs || []), ...(budget.wants || []), ...(budget.savings || [])].filter(item => !item.excluded)
        allItems.forEach(item => {
            const cat = item.transaction_category || 'uncategorized'
            if (Object.prototype.hasOwnProperty.call(monthly, cat)) {
                monthly[cat] += item.amount || 0
            }
        })

        return monthly
    }

    const getTransactionsForCategory = (categoryKey, txns = transactions) => {
        return txns
            .filter(txn => {
                if (categoryKey === 'uncategorized') {
                    return !txn.category && txn.transaction_type === 'DEBIT'
                }
                return txn.category === categoryKey && txn.transaction_type === 'DEBIT'
            })
            .sort((a, b) => {
                const da = a.transaction_date ? new Date(a.transaction_date) : new Date(0)
                const db = b.transaction_date ? new Date(b.transaction_date) : new Date(0)
                return db - da
            })
    }

    const actualSpending = aggregateSpending(transactions)
    const monthlyBudget = mapBudgetedAmounts()

    const monthlySlugs = [...EXPENSE_CATEGORIES, 'uncategorized']

    const totalBudgeted = monthlySlugs.reduce((sum, s) => sum + monthlyBudget[s], 0) - monthlyBudget.uncategorized
    const totalSpent = monthlySlugs.reduce((sum, s) => sum + actualSpending[s], 0)

    const {
        unlinkedOffsetTotal,
        linkedOffsetTotal,
        reimbursementsTotal,
    } = computeOffsetTotals(transactions)

    const totalBudgetedDisplay = totalBudgeted + unlinkedOffsetTotal
    const varianceDisplay = totalBudgetedDisplay - totalSpent
    const isOverspent = varianceDisplay < 0
    const spendOfBudgetPct = totalBudgetedDisplay > 0 ? (totalSpent / totalBudgetedDisplay) * 100 : null
    const budgetUsedWidth = spendOfBudgetPct == null ? 0 : Math.min(100, spendOfBudgetPct)

    const comparisonData = monthlySlugs.map(category => ({
        category: CATEGORY_LABELS[category] || category,
        key: category,
        budgeted: monthlyBudget[category],
        actual: actualSpending[category],
        variance: monthlyBudget[category] - actualSpending[category]
    }))

    const sortComparison = (a, b) => {
        const aOver = a.variance < 0 ? 0 : 1
        const bOver = b.variance < 0 ? 0 : 1
        if (aOver !== bOver) return aOver - bOver
        return b.actual - a.actual || b.budgeted - a.budgeted
    }

    const activeRows = comparisonData.filter((row) => row.budgeted > 0 || row.actual > 0).sort(sortComparison)
    const idleRows = comparisonData.filter((row) => row.budgeted <= 0 && row.actual <= 0)
    const visibleRows = showIdleCategories ? [...activeRows, ...idleRows] : activeRows

    const pieData = [...EXPENSE_CATEGORIES, 'uncategorized']
        .map(category => ({
            name: CATEGORY_LABELS[category] || category,
            key: category,
            value: actualSpending[category]
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)

    const pieTotal = pieData.reduce((sum, item) => sum + item.value, 0)
    const pieChartData = pieData.map((item, index) => ({
        ...item,
        total: pieTotal,
        percentage: pieTotal === 0 ? 0 : (item.value / pieTotal) * 100,
        color: item.key === 'uncategorized'
            ? 'var(--paper-brick)'
            : SPEND_BREAKDOWN_COLORS[index % SPEND_BREAKDOWN_COLORS.length],
    }))

    const uncategorizedSpend = actualSpending.uncategorized || 0
    const uncategorizedShare = totalSpent > 0 ? (uncategorizedSpend / totalSpent) * 100 : 0

    const budgetedHint = (() => {
        if (unlinkedOffsetTotal <= 0 && reimbursementsTotal <= 0) {
            return 'Monthly pots for this period'
        }
        return (
            <>
                Includes{' '}
                {unlinkedOffsetTotal > 0 && (
                    <>
                        <BlurredValue>{formatCurrency(unlinkedOffsetTotal)}</BlurredValue>
                        {' '}from unlinked refunds/reimbursements
                    </>
                )}
                {unlinkedOffsetTotal > 0 && reimbursementsTotal > 0 ? ' · ' : null}
                {reimbursementsTotal > 0 && (
                    <>
                        <BlurredValue>{formatCurrency(reimbursementsTotal)}</BlurredValue>
                        {' '}reimbursements (not earnings)
                    </>
                )}
            </>
        )
    })()

    const periodActions = selectedMonth ? (
        <PeriodSwitcher
            value={selectedMonth}
            isCurrent={currentPeriodKey != null && selectedMonth === currentPeriodKey}
            onChange={setSelectedMonth}
            onCurrent={handleCurrentMonth}
        />
    ) : null

    if (selectedMonth === null || loading) {
        return (
            <BankingLoading
                title="Budget analysis"
                message="Loading budget analysis…"
                actions={periodActions}
            />
        )
    }

    const renderComparisonRow = (row) => {
        const categoryTxns = getTransactionsForCategory(row.key)
        const hasTransactions = categoryTxns.length > 0
        const isExpanded = expandedCategory === row.key

        return (
            <Fragment key={row.key}>
                <tr className="align-top">
                    <td className="w-10 px-2 py-3.5">
                        {hasTransactions ? (
                            <button
                                type="button"
                                className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/40"
                                aria-expanded={isExpanded}
                                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.category}`}
                                onClick={() => setExpandedCategory(isExpanded ? null : row.key)}
                            >
                                {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                )}
                            </button>
                        ) : (
                            <span className="inline-block w-10" />
                        )}
                    </td>
                    <td className="min-w-[11rem] px-4 py-3.5">
                        <p className="text-sm font-medium text-[var(--paper-ink)]">{row.category}</p>
                        <PaceBar budgeted={row.budgeted} actual={row.actual} />
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm tabular-nums text-[var(--paper-muted)]">
                        <BlurredValue>{formatCurrency(row.budgeted)}</BlurredValue>
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-[var(--paper-ink)]">
                        <BlurredValue>{formatCurrency(row.actual)}</BlurredValue>
                    </td>
                    <td className={`px-4 py-3.5 text-right text-sm font-semibold tabular-nums ${paperMoneyTone(row.variance)}`}>
                        {row.variance > 0 ? '+' : ''}
                        <BlurredValue>{formatCurrency(row.variance)}</BlurredValue>
                    </td>
                </tr>
                {isExpanded && (
                    <tr key={`${row.key}-expanded`} className="bg-[var(--paper-canvas)]/40">
                        <td colSpan={5} className="px-4 py-3 sm:px-6">
                            <div className="border-l-2 border-[var(--paper-line)] pl-4 sm:pl-6">
                                <p className="mb-2 text-xs text-[var(--paper-muted)]">
                                    {categoryTxns.length} transaction{categoryTxns.length !== 1 ? 's' : ''}
                                </p>
                                <div className={`max-h-48 overflow-y-auto ${paperDivider}`}>
                                    {categoryTxns.map((txn) => (
                                        <div
                                            key={txn.id}
                                            className="grid grid-cols-[5.5rem_1fr_auto] items-baseline gap-4 py-2.5"
                                        >
                                            <span className="shrink-0 text-xs tabular-nums text-[var(--paper-muted)]">
                                                {txn.transaction_date
                                                    ? new Date(txn.transaction_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : '—'}
                                            </span>
                                            <span className="min-w-0 truncate text-sm text-[var(--paper-ink)]" title={txn.description}>
                                                {txn.description || '—'}
                                            </span>
                                            <BlurredValue className={`shrink-0 text-sm tabular-nums text-[var(--paper-ink)] ${paperMoney}`}>
                                                {formatCurrency(Math.abs(txn.amount))}
                                            </BlurredValue>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </td>
                    </tr>
                )}
            </Fragment>
        )
    }

    return (
        <div className="mx-auto max-w-[1080px] space-y-8">
            <BankingPageHeader
                title="Budget analysis"
                description={
                    periodRange && budget?.budget_period_start_day !== 1
                        ? formatPeriodRange(periodRange.from_date, periodRange.to_date)
                        : undefined
                }
                actions={periodActions}
            />

            {error && (
                <PaperCard className="flex items-center gap-2 p-4 text-[var(--paper-brick)]">
                    <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </PaperCard>
            )}

            {uncategorizedShare >= 25 && (
                <PaperCard className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div>
                        <p className="text-sm font-medium text-[var(--paper-ink)]">
                            {formatPercent(uncategorizedShare, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} of spend is uncategorized
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-[var(--paper-muted)]">
                            Assign categories on Transactions or add Rules so analysis can compare spend to your budget pots.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link to="/investec/transactions" className={paperBtnGhost}>Transactions</Link>
                        <Link to="/investec/rules" className={paperBtnGhost}>Rules</Link>
                    </div>
                </PaperCard>
            )}

            <PaperCard className="overflow-hidden">
                <div className="grid grid-cols-1 divide-y divide-[var(--paper-line)] md:grid-cols-3 md:divide-x md:divide-y-0">
                    <KpiCell
                        label="Total budgeted"
                        value={formatCurrency(totalBudgetedDisplay)}
                        hint={budgetedHint}
                    />
                    <KpiCell
                        label="Total spent"
                        value={formatCurrency(totalSpent)}
                        hint={
                            linkedOffsetTotal > 0 ? (
                                <>
                                    <BlurredValue>{formatCurrency(linkedOffsetTotal)}</BlurredValue>
                                    {' '}offset by linked refunds/reimbursements
                                </>
                            ) : spendOfBudgetPct != null ? (
                                `${formatPercent(spendOfBudgetPct, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} of budget`
                            ) : (
                                'Debits in this period'
                            )
                        }
                    />
                    <KpiCell
                        label={isOverspent ? 'Overspent' : 'Remaining'}
                        value={formatCurrency(Math.abs(varianceDisplay))}
                        toneClass={isOverspent ? paperMoneyTone(-1) : 'text-[var(--paper-ink)]'}
                        hint={
                            isOverspent
                                ? 'Spend is above the monthly budget'
                                : 'Left against the monthly budget'
                        }
                    >
                        {totalBudgetedDisplay > 0 ? (
                            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--paper-line)]" aria-hidden="true">
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${budgetUsedWidth}%`,
                                        background: isOverspent ? 'var(--paper-brick)' : 'var(--paper-olive)',
                                    }}
                                />
                            </div>
                        ) : null}
                    </KpiCell>
                </div>
            </PaperCard>

            <PaperCard className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-[var(--paper-line)] px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Monthly comparison</h2>
                        <p className="mt-1 text-sm text-[var(--paper-muted)]">
                            Budgeted vs actual by category. Bars are budget (top) and spend (bottom).
                        </p>
                    </div>
                    {idleRows.length > 0 ? (
                        <button
                            type="button"
                            className="inline-flex min-h-[40px] cursor-pointer items-center text-sm text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)]"
                            onClick={() => setShowIdleCategories((open) => !open)}
                        >
                            {showIdleCategories ? 'Hide unused categories' : `Show ${idleRows.length} unused`}
                        </button>
                    ) : null}
                </div>
                {visibleRows.length === 0 ? (
                    <p className="px-5 py-10 text-sm text-[var(--paper-muted)] sm:px-6">
                        No budgeted amounts or spend in this period.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[36rem]">
                            <thead>
                                <tr className="border-b border-[var(--paper-line)]">
                                    <th className="w-10 px-2 py-3" aria-label="Expand" />
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-[0.12em] text-[var(--paper-muted)]">
                                        Category
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.12em] text-[var(--paper-muted)]">
                                        Budgeted
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.12em] text-[var(--paper-muted)]">
                                        Actual
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-[0.12em] text-[var(--paper-muted)]">
                                        Remaining
                                    </th>
                                </tr>
                            </thead>
                            <tbody className={paperDivider}>
                                {visibleRows.map(renderComparisonRow)}
                            </tbody>
                        </table>
                    </div>
                )}
            </PaperCard>

            <PaperCard className={`p-5 sm:p-6 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Budgeted vs actual</h2>
                <p className="mt-1 text-sm text-[var(--paper-muted)]">
                    Categories with a budget or spend this period.
                </p>
                {activeRows.length > 0 ? (
                    <div className="mt-4" style={{ height: Math.max(320, activeRows.length * 44 + 56) }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={activeRows}
                                layout="vertical"
                                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                                barCategoryGap="22%"
                                barGap={4}
                            >
                                <CartesianGrid
                                    horizontal={false}
                                    stroke="var(--paper-line)"
                                    strokeDasharray="3 6"
                                />
                                <XAxis
                                    type="number"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--paper-muted)', fontSize: 12 }}
                                    tickFormatter={formatAxisRand}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="category"
                                    width={128}
                                    interval={0}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={<CategoryTick />}
                                />
                                <Tooltip
                                    content={<PaperChartTooltip />}
                                    cursor={{ fill: 'rgba(139,94,52,0.06)' }}
                                    wrapperStyle={{ outline: 'none' }}
                                />
                                <Legend
                                    verticalAlign="top"
                                    align="right"
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: 12, color: 'var(--paper-muted)', paddingBottom: 12 }}
                                />
                                <Bar
                                    dataKey="budgeted"
                                    name="Budgeted"
                                    fill={PAPER_BUDGET_COLORS.Needs}
                                    radius={[0, 4, 4, 0]}
                                    maxBarSize={14}
                                />
                                <Bar
                                    dataKey="actual"
                                    name="Actual"
                                    fill={PAPER_BUDGET_COLORS.Savings}
                                    radius={[0, 4, 4, 0]}
                                    maxBarSize={14}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="mt-8 text-sm text-[var(--paper-muted)]">Nothing to chart for this period.</p>
                )}
            </PaperCard>

            <PaperCard className={`p-5 sm:p-6 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Spending breakdown</h2>
                <p className="mt-1 text-sm text-[var(--paper-muted)]">
                    {pieChartData.length > 0 ? (
                        <>
                            Share of spend this period
                            {' · '}
                            <BlurredValue>{formatCurrency(pieTotal)}</BlurredValue>
                        </>
                    ) : (
                        'Share of all spend this period.'
                    )}
                </p>
                {pieChartData.length > 0 ? (
                    <div className="mt-4" style={{ height: Math.max(240, pieChartData.length * 52 + 40) }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={pieChartData}
                                layout="vertical"
                                margin={{ top: 8, right: 72, left: 8, bottom: 8 }}
                                barCategoryGap="28%"
                            >
                                <CartesianGrid
                                    horizontal={false}
                                    stroke="var(--paper-line)"
                                    strokeDasharray="3 6"
                                />
                                <XAxis
                                    type="number"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'var(--paper-muted)', fontSize: 12 }}
                                    tickFormatter={formatAxisRand}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={128}
                                    interval={0}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={<CategoryTick />}
                                />
                                <Tooltip
                                    content={<PaperChartTooltip />}
                                    cursor={{ fill: 'rgba(139,94,52,0.06)' }}
                                    wrapperStyle={{ outline: 'none' }}
                                />
                                <Bar dataKey="value" name="Spend" radius={[0, 6, 6, 0]} maxBarSize={22}>
                                    {pieChartData.map((item) => (
                                        <Cell key={item.key} fill={item.color} />
                                    ))}
                                    <LabelList
                                        dataKey="percentage"
                                        position="right"
                                        formatter={(value) => {
                                            const n = Number(value) || 0
                                            if (n > 0 && n < 1) return '<1%'
                                            return `${Math.round(n)}%`
                                        }}
                                        style={{ fill: 'var(--paper-muted)', fontSize: 12 }}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="mt-8 text-sm text-[var(--paper-muted)]">No spending data for this period.</p>
                )}
            </PaperCard>
        </div>
    )
}
