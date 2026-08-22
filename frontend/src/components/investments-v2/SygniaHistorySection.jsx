import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
    LineChart,
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
        monthlyMap[monthKey].portfolio_value = snap.portfolio_value || 0
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
            <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">
                Loading performance data…
            </p>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Portfolio value</p>
                <BlurredValue>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white">
                        {formatCurrencyLocal(portfolioValueNum)}
                    </p>
                </BlurredValue>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Total deposits</p>
                <BlurredValue>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white">
                        {formatCurrencyLocal(totalContributionsNum)}
                    </p>
                </BlurredValue>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Growth</p>
                <BlurredValue>
                    <p
                        className={`text-xl font-semibold ${growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                    >
                        {formatCurrencyLocal(growth)}
                    </p>
                    {growthPercent !== null && (
                        <p
                            className={`text-sm font-medium ${growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                        >
                            {growthPercent.toFixed(2)}%
                        </p>
                    )}
                </BlurredValue>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Deposits this financial year ({financialYearLabel})
                </p>
                <BlurredValue>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white">
                        {formatCurrencyLocal(contributionsCurrentFy)}
                    </p>
                </BlurredValue>
            </div>
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

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6 pb-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 shrink-0" />
                    <span>Portfolio value & deposits over time</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                    {TIME_RANGES.map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedRange(key)}
                            className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                                selectedRange === key
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {!hasChartData ? (
                <p className="text-gray-500 dark:text-gray-400 py-8 text-center px-4">
                    Add portfolio values or deposits below to see the chart.
                </p>
            ) : (
                <div
                    className={`w-full -mx-2 sm:mx-0 px-0 sm:px-4 pb-4 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}
                >
                    <ResponsiveContainer width="100%" height={360}>
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-600" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={formatChartDate}
                                className="text-gray-600 dark:text-gray-400"
                                tick={{ fontSize: 12 }}
                            />
                            <YAxis
                                tickFormatter={(v) => `R ${(v / 1000).toFixed(0)}k`}
                                className="text-gray-600 dark:text-gray-400"
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                                formatter={(value) => [value != null ? formatCurrency(value) : '—']}
                                labelFormatter={formatChartDate}
                                contentStyle={{
                                    backgroundColor: 'var(--tooltip-bg, #fff)',
                                    border: '1px solid #e5e7eb',
                                }}
                                cursor={{ strokeWidth: 1 }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="portfolio_value"
                                name="Portfolio value"
                                stroke="#2563eb"
                                strokeWidth={2}
                                dot={{ r: 5 }}
                                activeDot={{ r: 8 }}
                                connectNulls
                            />
                            <Line
                                type="monotone"
                                dataKey="cumulative_contributions"
                                name="Deposits (cumulative)"
                                stroke="#16a34a"
                                strokeWidth={2}
                                dot={{ r: 5 }}
                                activeDot={{ r: 8 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
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
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Monthly snapshots & deposits
                </h2>

                <div className="mb-6 flex justify-center">
                    <form
                        onSubmit={handleSaveMonth}
                        className="w-full max-w-3xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-4 md:px-6 md:py-5 shadow-sm space-y-3"
                    >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Add or edit month</p>
                            {editingMonthKey && (
                                <p className="text-xs text-blue-600 dark:text-blue-400">
                                    Editing{' '}
                                    {new Date(`${editingMonthKey}-01T00:00:00Z`).toLocaleDateString('en-ZA', {
                                        month: 'short',
                                        year: 'numeric',
                                    })}
                                </p>
                            )}
                        </div>
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 overflow-hidden">
                            <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Month</label>
                                <input
                                    type="month"
                                    value={entryMonth}
                                    onChange={(e) => setEntryMonth(e.target.value)}
                                    className="w-full max-w-full min-w-0 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Portfolio value (R)
                                </label>
                                <BlurredValue as="div">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="any"
                                        value={portfolioValue}
                                        onChange={(e) => setPortfolioValue(e.target.value)}
                                        className="w-full min-w-0 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </BlurredValue>
                                {snapshotError && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{snapshotError}</p>
                                )}
                            </div>
                            <div className="flex flex-col gap-1 min-w-0">
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Deposits (R)
                                </label>
                                <BlurredValue as="div">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="any"
                                        value={contributionAmount}
                                        onChange={(e) => setContributionAmount(e.target.value)}
                                        className="w-full min-w-0 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </BlurredValue>
                                {contributionError && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{contributionError}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                            {editingMonthKey && (
                                <button
                                    type="button"
                                    onClick={handleCancelEditMonth}
                                    className="w-full sm:w-auto px-3 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full sm:w-auto px-3 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                {isSaving ? 'Saving…' : editingMonthKey ? 'Update month' : 'Add month'}
                            </button>
                        </div>
                    </form>
                </div>

                {monthlyRows.length > 0 ? (
                    <div className="overflow-x-auto -mx-4 px-4 sm:mx-auto sm:px-0 max-w-3xl">
                        <table className="w-full text-sm text-left text-gray-700 dark:text-gray-300">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-600">
                                    <th className="py-2 pr-4 font-medium">Month</th>
                                    <th className="py-2 pr-4 font-medium">Portfolio value</th>
                                    <th className="py-2 pr-4 font-medium">Deposits</th>
                                    <th className="py-2 pr-2 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyRows.map((row) => (
                                    <tr key={row.monthKey} className="border-b border-gray-100 dark:border-gray-700">
                                        <td className="py-2 pr-4">{formatTableMonth(row.date)}</td>
                                        <td className="py-2 pr-4">
                                            <BlurredValue>
                                                {row.portfolio_value != null
                                                    ? formatCurrencyLocal(row.portfolio_value)
                                                    : '—'}
                                            </BlurredValue>
                                        </td>
                                        <td className="py-2 pr-4">
                                            <BlurredValue>
                                                {row.contribution_total
                                                    ? formatCurrencyLocal(row.contribution_total)
                                                    : '—'}
                                            </BlurredValue>
                                        </td>
                                        <td className="py-2 pr-2">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditMonth(row)}
                                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                                                    title="Edit month"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMonth(row.monthKey)}
                                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400"
                                                    title="Delete month"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                        No monthly data yet. Add a value or deposit above.
                    </p>
                )}
            </div>

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
