import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
    ComposedChart,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Edit2, Trash2 } from 'lucide-react'
import ConfirmModal from '../ConfirmModal'
import BlurredValue from '../BlurredValue'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, formatDateSafe } from '../../utils/numberFormatting'
import {
    PAPER_CHART,
    PaperCard,
    paperBtnGhost,
    paperBtnPrimary,
    paperEyebrow,
    paperField,
    paperIconBtn,
    paperIconBtnDanger,
    paperMoney,
    paperMoneyTone,
    paperSegment,
    paperTableHead,
    paperTableRow,
} from '../appUi'
import {
    getSygniaAccountHistory,
    createSygniaSnapshot,
    updateSygniaSnapshot,
    deleteSygniaSnapshot,
    createSygniaContribution,
    updateSygniaContribution,
    deleteSygniaContribution,
} from '../../investments-v2/api'

const TIME_RANGES = [
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' },
]

const formatCurrencyLocal = (value) => {
    if (value === null || value === undefined) return 'R 0.00'
    return formatCurrency(value)
}

const SygniaHistoryContext = createContext(null)

function useSygniaHistory() {
    const ctx = useContext(SygniaHistoryContext)
    if (!ctx) {
        throw new Error('Sygnia history components must be used within SygniaHistoryProvider')
    }
    return ctx
}

export function SygniaHistoryProvider({ accountId, refreshKey, children }) {
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [valueSnapshots, setValueSnapshots] = useState([])
    const [contributions, setContributions] = useState([])
    const [chartData, setChartData] = useState([])
    const [contributionsCurrentFy, setContributionsCurrentFy] = useState(0)
    const [financialYearLabel, setFinancialYearLabel] = useState('')
    const [totalContributionsFromApi, setTotalContributionsFromApi] = useState(0)
    const [latestPortfolioValueFromApi, setLatestPortfolioValueFromApi] = useState(0)
    const [selectedRange, setSelectedRange] = useState('all')

    const currentMonth = () => new Date().toISOString().slice(0, 7)
    const [entryMonth, setEntryMonth] = useState(() => new Date().toISOString().slice(0, 7))
    const [portfolioValue, setPortfolioValue] = useState('')
    const [contributionAmount, setContributionAmount] = useState('')
    const [snapshotError, setSnapshotError] = useState(null)
    const [contributionError, setContributionError] = useState(null)

    const [editingSnapshotId, setEditingSnapshotId] = useState(null)
    const [editingContributionId, setEditingContributionId] = useState(null)
    const [editingMonthKey, setEditingMonthKey] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState({ open: false, type: null, id: null, monthKey: null })

    const fetchHistory = useCallback(async () => {
        if (!accountId) return
        setLoading(true)
        try {
            const res = await getSygniaAccountHistory(accountId, selectedRange)
            setValueSnapshots(res.value_snapshots || [])
            setContributions(res.contributions || [])
            setChartData(res.chart_data || [])
            setContributionsCurrentFy(res.contributions_current_fy ?? 0)
            setFinancialYearLabel(res.financial_year_label || '')
            setTotalContributionsFromApi(res.total_contributions ?? 0)
            setLatestPortfolioValueFromApi(res.latest_portfolio_value ?? 0)
        } catch (err) {
            console.error('Failed to fetch Sygnia history', err)
        } finally {
            setLoading(false)
        }
    }, [accountId, selectedRange])

    useEffect(() => {
        fetchHistory()
    }, [fetchHistory, refreshKey])

    const portfolioValueNum = latestPortfolioValueFromApi
    const totalContributionsNum = totalContributionsFromApi
    const growth = portfolioValueNum - totalContributionsNum
    const growthPercent = totalContributionsNum > 0 ? (growth / totalContributionsNum) * 100 : null

    const handleCancelEditMonth = () => {
        setEditingMonthKey(null)
        setEditingSnapshotId(null)
        setEditingContributionId(null)
        setEntryMonth(currentMonth())
        setPortfolioValue('')
        setContributionAmount('')
        setSnapshotError(null)
        setContributionError(null)
    }

    const handleSaveMonth = async (e) => {
        e.preventDefault()

        const hasPortfolioValue = portfolioValue !== ''
        const hasContribution = contributionAmount !== ''

        const pv = hasPortfolioValue ? parseFloat(portfolioValue) || 0 : null
        const amount = hasContribution ? parseFloat(contributionAmount) || 0 : null

        if (pv !== null && pv < 0) {
            setSnapshotError('Value must be non-negative')
            return
        }
        if (amount !== null && amount < 0) {
            setContributionError('Amount must be non-negative')
            return
        }

        setSnapshotError(null)
        setContributionError(null)
        setIsSaving(true)

        try {
            const ops = []

            const existingSnapshot =
                editingSnapshotId != null
                    ? valueSnapshots.find((s) => s.id === editingSnapshotId)
                    : valueSnapshots.find((s) => s.date?.slice(0, 7) === entryMonth)

            const existingContribution =
                editingContributionId != null
                    ? contributions.find((c) => c.id === editingContributionId)
                    : contributions.find((c) => c.date?.slice(0, 7) === entryMonth)

            if (pv !== null) {
                if (existingSnapshot) {
                    ops.push(
                        updateSygniaSnapshot(accountId, existingSnapshot.id, {
                            month: entryMonth,
                            portfolio_value: pv,
                        }),
                    )
                } else {
                    ops.push(
                        createSygniaSnapshot(accountId, {
                            month: entryMonth,
                            portfolio_value: pv,
                        }),
                    )
                }
            }

            if (amount !== null) {
                if (existingContribution) {
                    ops.push(
                        updateSygniaContribution(accountId, existingContribution.id, {
                            month: entryMonth,
                            amount,
                        }),
                    )
                } else {
                    ops.push(
                        createSygniaContribution(accountId, {
                            month: entryMonth,
                            amount,
                        }),
                    )
                }
            }

            if (ops.length === 0) {
                setIsSaving(false)
                return
            }

            await Promise.all(ops)
            await fetchHistory()

            setPortfolioValue('')
            setContributionAmount('')
            setEntryMonth(currentMonth())
            setEditingSnapshotId(null)
            setEditingContributionId(null)
            setEditingMonthKey(null)
        } catch (err) {
            console.error('Failed to save month data', err)
            const detail = err.response?.data?.detail
            const message = detail || 'Failed to save'
            setSnapshotError(typeof message === 'string' ? message : 'Failed to save')
            setContributionError(typeof message === 'string' ? message : 'Failed to save')
        } finally {
            setIsSaving(false)
        }
    }

    const handleEditMonth = (row) => {
        const monthKey = row.monthKey
        setEditingMonthKey(monthKey)
        setEntryMonth(monthKey)
        setPortfolioValue(row.portfolio_value != null ? String(row.portfolio_value) : '')
        setContributionAmount(row.contribution_total ? String(row.contribution_total) : '')
        setSnapshotError(null)
        setContributionError(null)

        const existingSnapshot = valueSnapshots.find((s) => s.date?.slice(0, 7) === monthKey)
        const existingContribution = contributions.find((c) => c.date?.slice(0, 7) === monthKey)
        setEditingSnapshotId(existingSnapshot ? existingSnapshot.id : null)
        setEditingContributionId(existingContribution ? existingContribution.id : null)
    }

    const handleDeleteMonth = (monthKey) => {
        setDeleteConfirm({ open: true, type: 'month', id: null, monthKey })
    }

    const handleConfirmDelete = async () => {
        const { type, id } = deleteConfirm
        try {
            if (type === 'snapshot' && id) {
                await deleteSygniaSnapshot(accountId, id)
            } else if (type === 'contribution' && id) {
                await deleteSygniaContribution(accountId, id)
            } else if (type === 'month' && deleteConfirm.monthKey) {
                const month = deleteConfirm.monthKey
                const monthSnapshots = valueSnapshots.filter((s) => s.date?.slice(0, 7) === month)
                const monthContributions = contributions.filter((c) => c.date?.slice(0, 7) === month)

                const ops = [
                    ...monthSnapshots.map((s) => deleteSygniaSnapshot(accountId, s.id)),
                    ...monthContributions.map((c) => deleteSygniaContribution(accountId, c.id)),
                ]

                if (ops.length > 0) {
                    await Promise.all(ops)
                }
            }
            await fetchHistory()

            if (type === 'month' && editingMonthKey === deleteConfirm.monthKey) {
                handleCancelEditMonth()
            }
        } catch (err) {
            console.error('Failed to delete', err)
        } finally {
            setDeleteConfirm({ open: false, type: null, id: null, monthKey: null })
        }
    }

    const portfolioValueByMonth = new Map(
        chartData.map((point) => [point.date?.slice(0, 7), point.portfolio_value ?? null]),
    )

    const monthlyMap = {}
    valueSnapshots.forEach((snap) => {
        const monthKey = snap.date?.slice(0, 7)
        if (!monthKey) return
        if (!monthlyMap[monthKey]) {
            monthlyMap[monthKey] = {
                monthKey,
                date: snap.date,
                portfolio_value: null,
                contribution_total: 0,
            }
        }
    })
    contributions.forEach((c) => {
        const monthKey = c.date?.slice(0, 7)
        if (!monthKey) return
        if (!monthlyMap[monthKey]) {
            monthlyMap[monthKey] = {
                monthKey,
                date: c.date,
                portfolio_value: null,
                contribution_total: 0,
            }
        }
        monthlyMap[monthKey].contribution_total += c.amount || 0
    })
    Object.values(monthlyMap).forEach((row) => {
        if (portfolioValueByMonth.has(row.monthKey)) {
            row.portfolio_value = portfolioValueByMonth.get(row.monthKey)
        }
    })
    const monthlyRows = Object.values(monthlyMap)
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
        .reverse()

    const value = {
        loading,
        isSaving,
        chartData,
        contributionsCurrentFy,
        financialYearLabel,
        selectedRange,
        setSelectedRange,
        entryMonth,
        setEntryMonth,
        portfolioValue,
        setPortfolioValue,
        contributionAmount,
        setContributionAmount,
        snapshotError,
        contributionError,
        editingMonthKey,
        deleteConfirm,
        setDeleteConfirm,
        portfolioValueNum,
        totalContributionsNum,
        growth,
        growthPercent,
        monthlyRows,
        handleSaveMonth,
        handleEditMonth,
        handleCancelEditMonth,
        handleDeleteMonth,
        handleConfirmDelete,
    }

    return <SygniaHistoryContext.Provider value={value}>{children}</SygniaHistoryContext.Provider>
}

export function SygniaOverviewCards() {
    const {
        loading,
        portfolioValueNum,
        totalContributionsNum,
        growth,
        growthPercent,
        contributionsCurrentFy,
        financialYearLabel,
        chartData,
        monthlyRows,
    } = useSygniaHistory()

    if (loading && chartData.length === 0 && monthlyRows.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-[var(--paper-muted)]">
                Loading performance data…
            </p>
        )
    }

    const hasDeposits = totalContributionsNum > 0
    const fyLabel = financialYearLabel ? ` (${financialYearLabel})` : ''

    const stats = [
        { label: 'Portfolio value', value: formatCurrencyLocal(portfolioValueNum), tone: 'text-[var(--paper-ink)]' },
        { label: 'Total deposits', value: formatCurrencyLocal(totalContributionsNum), tone: 'text-[var(--paper-ink)]' },
        {
            label: 'Growth',
            value: formatCurrencyLocal(growth),
            tone: hasDeposits ? paperMoneyTone(growth) : 'text-[var(--paper-ink)]',
            hint: hasDeposits && growthPercent !== null
                ? `${growthPercent.toFixed(2)}% on deposits`
                : !hasDeposits
                  ? 'No deposits recorded yet'
                  : null,
        },
        {
            label: `FY deposits${fyLabel}`,
            value: formatCurrencyLocal(contributionsCurrentFy),
            tone: 'text-[var(--paper-ink)]',
        },
    ]

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
                <PaperCard key={stat.label} className="p-5 sm:p-6">
                    <p className={`${paperEyebrow} text-xs`}>{stat.label}</p>
                    <BlurredValue>
                        <p className={`mt-3 text-2xl sm:text-[1.75rem] ${paperMoney} ${stat.tone}`}>
                            {stat.value}
                        </p>
                    </BlurredValue>
                    {stat.hint ? (
                        <p className="mt-1.5 text-xs text-[var(--paper-muted)]">{stat.hint}</p>
                    ) : null}
                </PaperCard>
            ))}
        </div>
    )
}

function PaperChartTooltip({ active, payload, label, formatLabel }) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2 shadow-sm">
            <p className="mb-1.5 text-xs text-[var(--paper-muted)]">{formatLabel(label)}</p>
            <ul className="space-y-1">
                {payload.map((entry) => (
                    <li key={entry.dataKey} className="flex items-center justify-between gap-4 text-sm">
                        <span className="flex items-center gap-1.5 text-[var(--paper-muted)]">
                            <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: entry.color }}
                                aria-hidden
                            />
                            {entry.name}
                        </span>
                        <span className={`${paperMoney} text-[var(--paper-ink)]`}>
                            {entry.value != null ? formatCurrency(entry.value) : '—'}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

export function SygniaPerformanceChart() {
    const { blurSensitiveValues } = useAuth()
    const { chartData, selectedRange, setSelectedRange } = useSygniaHistory()

    const formatChartDate = (dateStr) => {
        if (!dateStr) return ''
        const normalized = dateStr.includes('T') || dateStr.includes('Z') ? dateStr : `${dateStr}T00:00:00`
        const d = new Date(normalized)
        if (Number.isNaN(d.getTime())) return ''
        return d.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' })
    }

    const hasChartData =
        chartData.length > 0 &&
        chartData.some((d) => d.portfolio_value != null || d.cumulative_contributions > 0)

    const hasDepositsSeries = chartData.some((d) => (d.cumulative_contributions ?? 0) > 0)
    const isSparse = chartData.length <= 2
    const chartHeight = isSparse ? 240 : 320

    const portfolioValues = chartData
        .map((d) => d.portfolio_value)
        .filter((v) => v != null && !Number.isNaN(Number(v)))
    const depositValues = chartData
        .map((d) => d.cumulative_contributions)
        .filter((v) => v != null && !Number.isNaN(Number(v)))
    const allValues = [...portfolioValues, ...(hasDepositsSeries ? depositValues : [])]
    const dataMin = allValues.length ? Math.min(...allValues) : 0
    const dataMax = allValues.length ? Math.max(...allValues) : 0
    const yPadding = dataMax === dataMin ? Math.max(dataMax * 0.05, 1000) : (dataMax - dataMin) * 0.08
    const yDomain = isSparse && allValues.length
        ? [Math.max(0, dataMin - yPadding), dataMax + yPadding]
        : [0, 'auto']

    return (
        <PaperCard className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-ink)]">
                    <TrendingUp className="h-4 w-4 shrink-0 text-[var(--paper-muted)]" aria-hidden />
                    <span>Portfolio value & deposits</span>
                </h2>
                <div className={paperSegment} role="group" aria-label="Time range">
                    {TIME_RANGES.map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedRange(key)}
                            aria-pressed={selectedRange === key}
                            className={`min-h-[32px] cursor-pointer rounded px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20 ${
                                selectedRange === key
                                    ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                    : 'text-[var(--paper-muted)] hover:text-[var(--paper-ink)]'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {!hasChartData ? (
                <p className="px-5 py-10 text-center text-sm text-[var(--paper-muted)] sm:px-6">
                    Add portfolio values or deposits below to see performance over time.
                </p>
            ) : (
                <>
                    {isSparse && (
                        <p className="border-b border-[var(--paper-line)] px-5 py-3 text-xs text-[var(--paper-muted)] sm:px-6">
                            {chartData.length === 1
                                ? 'One snapshot recorded — add more months to see a trend.'
                                : 'Limited history — the chart will fill in as you add monthly data.'}
                            {!hasDepositsSeries && ' Deposits line hidden until cumulative deposits are recorded.'}
                        </p>
                    )}
                    <div
                        className={`w-full px-2 pb-4 pt-2 sm:px-4 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}
                    >
                        <ResponsiveContainer width="100%" height={chartHeight}>
                            <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                                <defs>
                                    <linearGradient id="sygniaPortfolioFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={PAPER_CHART.umber} stopOpacity={0.22} />
                                        <stop offset="100%" stopColor={PAPER_CHART.umber} stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--paper-line)" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={formatChartDate}
                                    axisLine={false}
                                    tickLine={false}
                                    stroke="var(--paper-muted)"
                                    tick={{ fill: 'var(--paper-muted)', fontSize: 11 }}
                                    dy={4}
                                />
                                <YAxis
                                    domain={yDomain}
                                    tickFormatter={(v) => {
                                        if (Math.abs(v) >= 1000) return `R ${(v / 1000).toFixed(0)}k`
                                        return formatCurrency(v)
                                    }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={56}
                                    stroke="var(--paper-muted)"
                                    tick={{ fill: 'var(--paper-muted)', fontSize: 11 }}
                                />
                                <Tooltip
                                    content={
                                        <PaperChartTooltip formatLabel={formatChartDate} />
                                    }
                                    cursor={{ stroke: 'var(--paper-muted)', strokeWidth: 1, strokeDasharray: '4 4' }}
                                />
                                <Legend
                                    wrapperStyle={{ color: 'var(--paper-muted)', fontSize: 12, paddingTop: 8 }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="portfolio_value"
                                    name="Portfolio value"
                                    stroke={PAPER_CHART.umber}
                                    strokeWidth={2}
                                    fill="url(#sygniaPortfolioFill)"
                                    dot={isSparse ? { r: 5, fill: PAPER_CHART.umber, strokeWidth: 0 } : false}
                                    activeDot={{ r: 6 }}
                                    connectNulls={false}
                                />
                                {hasDepositsSeries && (
                                    <Line
                                        type="monotone"
                                        dataKey="cumulative_contributions"
                                        name="Deposits (cumulative)"
                                        stroke={PAPER_CHART.olive}
                                        strokeWidth={2}
                                        dot={isSparse ? { r: 4, fill: PAPER_CHART.olive, strokeWidth: 0 } : { r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}
        </PaperCard>
    )
}

export function SygniaMonthlySnapshots() {
    const {
        isSaving,
        entryMonth,
        setEntryMonth,
        portfolioValue,
        setPortfolioValue,
        contributionAmount,
        setContributionAmount,
        snapshotError,
        contributionError,
        editingMonthKey,
        deleteConfirm,
        setDeleteConfirm,
        monthlyRows,
        handleSaveMonth,
        handleEditMonth,
        handleCancelEditMonth,
        handleDeleteMonth,
        handleConfirmDelete,
    } = useSygniaHistory()

    const formatTableMonth = (dateStr) => formatDateSafe(dateStr, { month: 'short', year: 'numeric' })

    return (
        <>
            <PaperCard className="overflow-hidden">
                <div className="border-b border-[var(--paper-line)] px-5 py-3.5 sm:px-6">
                    <h2 className="text-sm font-semibold text-[var(--paper-ink)]">
                        Monthly snapshots & deposits
                    </h2>
                </div>

                <form
                    onSubmit={handleSaveMonth}
                    className="border-b border-[var(--paper-line)] bg-[var(--paper-canvas)]/30 px-5 py-4 sm:px-6 sm:py-5"
                >
                    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--paper-ink)]">Add or edit month</p>
                        {editingMonthKey && (
                            <p className="text-xs text-[var(--paper-accent)]">
                                Editing{' '}
                                {new Date(`${editingMonthKey}-01T00:00:00Z`).toLocaleDateString('en-ZA', {
                                    month: 'short',
                                    year: 'numeric',
                                })}
                            </p>
                        )}
                    </div>
                    <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label htmlFor="sygnia-snapshot-month" className="text-xs font-medium text-[var(--paper-muted)]">
                                Month
                            </label>
                            <input
                                id="sygnia-snapshot-month"
                                type="month"
                                value={entryMonth}
                                onChange={(e) => setEntryMonth(e.target.value)}
                                className={paperField}
                            />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label htmlFor="sygnia-snapshot-value" className="text-xs font-medium text-[var(--paper-muted)]">
                                Portfolio value (R)
                            </label>
                            <BlurredValue as="div">
                                <input
                                    id="sygnia-snapshot-value"
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="any"
                                    value={portfolioValue}
                                    onChange={(e) => setPortfolioValue(e.target.value)}
                                    className={paperField}
                                />
                            </BlurredValue>
                            {snapshotError && (
                                <p className="text-xs text-[var(--paper-brick)]">{snapshotError}</p>
                            )}
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <label htmlFor="sygnia-snapshot-deposits" className="text-xs font-medium text-[var(--paper-muted)]">
                                Deposits (R)
                            </label>
                            <BlurredValue as="div">
                                <input
                                    id="sygnia-snapshot-deposits"
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="any"
                                    value={contributionAmount}
                                    onChange={(e) => setContributionAmount(e.target.value)}
                                    className={paperField}
                                />
                            </BlurredValue>
                            {contributionError && (
                                <p className="text-xs text-[var(--paper-brick)]">{contributionError}</p>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
                            {editingMonthKey && (
                                <button type="button" onClick={handleCancelEditMonth} className={paperBtnGhost}>
                                    Cancel
                                </button>
                            )}
                            <button type="submit" disabled={isSaving} className={paperBtnPrimary}>
                                {isSaving ? 'Saving…' : editingMonthKey ? 'Update month' : 'Add month'}
                            </button>
                        </div>
                    </div>
                </form>

                {monthlyRows.length > 0 ? (
                    <div className="overflow-x-auto px-5 py-4 sm:px-6">
                        <table className="w-full min-w-[28rem] text-left text-sm text-[var(--paper-ink)]">
                            <thead>
                                <tr className={paperTableHead}>
                                    <th className="py-2.5 pr-4">Month</th>
                                    <th className="py-2.5 pr-4">Portfolio value</th>
                                    <th className="py-2.5 pr-4">Deposits</th>
                                    <th className="py-2.5 pr-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyRows.map((row) => (
                                    <tr key={row.monthKey} className={paperTableRow}>
                                        <td className="py-2.5 pr-4">{formatTableMonth(row.date)}</td>
                                        <td className="py-2.5 pr-4 tabular-nums">
                                            <BlurredValue>
                                                {row.portfolio_value != null
                                                    ? formatCurrencyLocal(row.portfolio_value)
                                                    : '—'}
                                            </BlurredValue>
                                        </td>
                                        <td className="py-2.5 pr-4 tabular-nums">
                                            <BlurredValue>
                                                {row.contribution_total
                                                    ? formatCurrencyLocal(row.contribution_total)
                                                    : '—'}
                                            </BlurredValue>
                                        </td>
                                        <td className="py-2.5 pr-2">
                                            <div className="flex justify-end gap-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditMonth(row)}
                                                    className={paperIconBtn}
                                                    aria-label={`Edit ${formatTableMonth(row.date)}`}
                                                    title="Edit month"
                                                >
                                                    <Edit2 className="h-4 w-4" aria-hidden />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMonth(row.monthKey)}
                                                    className={paperIconBtnDanger}
                                                    aria-label={`Delete ${formatTableMonth(row.date)}`}
                                                    title="Delete month"
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="px-5 py-6 text-sm text-[var(--paper-muted)] sm:px-6">
                        No monthly data yet. Add a value or deposit above.
                    </p>
                )}
            </PaperCard>

            <ConfirmModal
                isOpen={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false, type: null, id: null, monthKey: null })}
                onConfirm={handleConfirmDelete}
                title="Delete all data for this month?"
                message="This cannot be undone."
                confirmText="Delete"
                variant="danger"
            />
        </>
    )
}

/** Default stacked layout (overview → chart → monthly). Prefer composing parts in detail view. */
export default function SygniaHistorySection({ accountId }) {
    return (
        <SygniaHistoryProvider accountId={accountId}>
            <div className="space-y-6">
                <SygniaOverviewCards />
                <SygniaPerformanceChart />
                <SygniaMonthlySnapshots />
            </div>
        </SygniaHistoryProvider>
    )
}
