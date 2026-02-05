import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
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
import ConfirmModal from '../components/ConfirmModal'
import { formatCurrency } from '../utils/numberFormatting'

const TIME_RANGES = [
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' },
]

const formatCurrencyLocal = (value) => {
    if (value === null || value === undefined) return 'R 0.00'
    return formatCurrency(value)
}

export default function RAPerformance() {
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

    // Shared month picker for both portfolio value and contributions (YYYY-MM)
    const currentMonth = () => new Date().toISOString().slice(0, 7)
    const [entryMonth, setEntryMonth] = useState(() => new Date().toISOString().slice(0, 7))
    const [portfolioValue, setPortfolioValue] = useState('')
    const [contributionAmount, setContributionAmount] = useState('')
    const [snapshotError, setSnapshotError] = useState(null)
    const [contributionError, setContributionError] = useState(null)

    // Track when editing an existing month row
    const [editingSnapshotId, setEditingSnapshotId] = useState(null)
    const [editingContributionId, setEditingContributionId] = useState(null)
    const [editingMonthKey, setEditingMonthKey] = useState(null)

    // Delete confirm
    const [deleteConfirm, setDeleteConfirm] = useState({ open: false, type: null, id: null, monthKey: null })

    const fetchHistory = useCallback(async () => {
        setLoading(true)
        try {
            const res = await axios.get(`/api/ra/history?range=${selectedRange}`)
            setValueSnapshots(res.data.value_snapshots || [])
            setContributions(res.data.contributions || [])
            setChartData(res.data.chart_data || [])
            setContributionsCurrentFy(res.data.contributions_current_fy ?? 0)
            setFinancialYearLabel(res.data.financial_year_label || '')
            setTotalContributionsFromApi(res.data.total_contributions ?? 0)
            setLatestPortfolioValueFromApi(res.data.latest_portfolio_value ?? 0)
        } catch (err) {
            console.error('Failed to fetch RA history', err)
        } finally {
            setLoading(false)
        }
    }, [selectedRange])

    useEffect(() => {
        fetchHistory()
    }, [fetchHistory])

    // Overview: latest portfolio value and total contributions from API (all time, unfiltered by range)
    const portfolioValueNum = latestPortfolioValueFromApi
    const totalContributionsNum = totalContributionsFromApi
    const growth = portfolioValueNum - totalContributionsNum
    const growthPercent = totalContributionsNum > 0 ? (growth / totalContributionsNum) * 100 : null

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

            // Existing records for this month (if any)
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
                        axios.put(`/api/ra/snapshot/${existingSnapshot.id}`, {
                            month: entryMonth,
                            portfolio_value: pv,
                        }),
                    )
                } else {
                    ops.push(
                        axios.post('/api/ra/snapshot', {
                            month: entryMonth,
                            portfolio_value: pv,
                        }),
                    )
                }
            }

            if (amount !== null) {
                if (existingContribution) {
                    ops.push(
                        axios.put(`/api/ra/contributions/${existingContribution.id}`, {
                            month: entryMonth,
                            amount,
                        }),
                    )
                } else {
                    ops.push(
                        axios.post('/api/ra/contributions', {
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
            if (detail) {
                // If backend returns a specific error, surface it in a generic way
                setSnapshotError(detail)
                setContributionError(detail)
            } else {
                setSnapshotError('Failed to save')
                setContributionError('Failed to save')
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleEditMonth = (row) => {
        const monthKey = row.monthKey
        setEditingMonthKey(monthKey)
        setEntryMonth(monthKey)

        // Pre-fill from row aggregates
        setPortfolioValue(row.portfolio_value != null ? String(row.portfolio_value) : '')
        setContributionAmount(row.contribution_total ? String(row.contribution_total) : '')
        setSnapshotError(null)
        setContributionError(null)

        // Track underlying record ids if they exist
        const existingSnapshot = valueSnapshots.find((s) => s.date?.slice(0, 7) === monthKey)
        const existingContribution = contributions.find((c) => c.date?.slice(0, 7) === monthKey)
        setEditingSnapshotId(existingSnapshot ? existingSnapshot.id : null)
        setEditingContributionId(existingContribution ? existingContribution.id : null)
    }

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

    const handleDeleteMonth = (monthKey) => {
        setDeleteConfirm({ open: true, type: 'month', id: null, monthKey })
    }

    const handleConfirmDelete = async () => {
        const { type, id } = deleteConfirm
        try {
            if (type === 'snapshot' && id) {
                await axios.delete(`/api/ra/snapshot/${id}`)
            } else if (type === 'contribution' && id) {
                await axios.delete(`/api/ra/contributions/${id}`)
            } else if (type === 'month' && deleteConfirm.monthKey) {
                const month = deleteConfirm.monthKey
                const monthSnapshots = valueSnapshots.filter((s) => s.date?.slice(0, 7) === month)
                const monthContributions = contributions.filter((c) => c.date?.slice(0, 7) === month)

                const ops = [
                    ...monthSnapshots.map((s) => axios.delete(`/api/ra/snapshot/${s.id}`)),
                    ...monthContributions.map((c) => axios.delete(`/api/ra/contributions/${c.id}`)),
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

    const formatChartDate = (dateStr) => {
        if (!dateStr) return ''
        const d = new Date(dateStr + (dateStr.length === 10 ? 'Z' : ''))
        return d.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
    }

    const formatTableMonth = (dateStr) => {
        if (!dateStr) return ''
        return new Date(dateStr + 'Z').toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
    }

    const hasChartData = chartData.length > 0 && chartData.some((d) => d.portfolio_value != null || d.cumulative_contributions > 0)

    // Consolidated monthly view combining snapshots and summed contributions
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
    const monthlyRows = Object.values(monthlyMap).sort((a, b) => a.monthKey.localeCompare(b.monthKey)).reverse()

    if (loading && valueSnapshots.length === 0 && contributions.length === 0) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">📈 RA Performance</h1>
                <p className="text-gray-600 dark:text-gray-400">
                    Track your retirement annuity portfolio value and contributions over time.
                </p>
            </div>

            {/* Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Portfolio value</p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white">
                        {formatCurrencyLocal(portfolioValueNum)}
                    </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total contributions</p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white">
                        {formatCurrencyLocal(totalContributionsNum)}
                    </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Growth</p>
                    <p className={`text-xl font-semibold ${growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrencyLocal(growth)}
                    </p>
                    {growthPercent !== null && (
                        <p className={`text-sm font-medium ${growth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {growthPercent.toFixed(2)}%
                        </p>
                    )}
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Contributions this financial year ({financialYearLabel})
                    </p>
                    <p className="text-xl font-semibold text-gray-900 dark:text-white">
                        {formatCurrencyLocal(contributionsCurrentFy)}
                    </p>
                </div>
            </div>

            {/* Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Portfolio value & contributions over time
                    </h2>
                    <div className="flex gap-2">
                        {TIME_RANGES.map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setSelectedRange(key)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
                    <p className="text-gray-500 dark:text-gray-400 py-8 text-center">
                        Add value snapshots and contributions above to see the chart.
                    </p>
                ) : (
                    <ResponsiveContainer width="100%" height={360}>
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-600" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={formatChartDate}
                                className="text-gray-600 dark:text-gray-400"
                            />
                            <YAxis
                                tickFormatter={(v) => `R ${(v / 1000).toFixed(0)}k`}
                                className="text-gray-600 dark:text-gray-400"
                            />
                            <Tooltip
                                formatter={(value) => [value != null ? formatCurrency(value) : '—']}
                                labelFormatter={formatChartDate}
                                contentStyle={{ backgroundColor: 'var(--tooltip-bg, #fff)', border: '1px solid #e5e7eb' }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="portfolio_value"
                                name="Portfolio value"
                                stroke="#2563eb"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                connectNulls
                            />
                            <Line
                                type="monotone"
                                dataKey="cumulative_contributions"
                                name="Contributions (cumulative)"
                                stroke="#16a34a"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Monthly snapshots & contributions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Monthly snapshots & contributions</h2>

                {/* Centered combined month/value/contribution editor */}
                <div className="mb-6 flex justify-center">
                    <form
                        onSubmit={handleSaveMonth}
                        className="w-full max-w-3xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-4 md:px-6 md:py-5 shadow-sm space-y-3"
                    >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Add or edit month</p>
                            {editingMonthKey && (
                                <p className="text-xs text-blue-600 dark:text-blue-400">
                                    Editing {new Date(`${editingMonthKey}-01T00:00:00Z`).toLocaleDateString('en-ZA', {
                                        month: 'short',
                                        year: 'numeric',
                                    })}
                                </p>
                            )}
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Month</label>
                                <input
                                    type="month"
                                    value={entryMonth}
                                    onChange={(e) => setEntryMonth(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Portfolio value (R)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0"
                                    value={portfolioValue}
                                    onChange={(e) => setPortfolioValue(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                {snapshotError && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{snapshotError}</p>
                                )}
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Contributions (R)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0"
                                    value={contributionAmount}
                                    onChange={(e) => setContributionAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                {contributionError && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{contributionError}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 pt-1">
                            {editingMonthKey && (
                                <button
                                    type="button"
                                    onClick={handleCancelEditMonth}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                {isSaving ? 'Saving...' : editingMonthKey ? 'Update month' : 'Add month'}
                            </button>
                        </div>
                    </form>
                </div>

                {monthlyRows.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-700 dark:text-gray-300">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-600">
                                    <th className="py-2 pr-4 font-medium">Month</th>
                                    <th className="py-2 pr-4 font-medium">Portfolio value</th>
                                    <th className="py-2 pr-4 font-medium">Contributions</th>
                                    <th className="py-2 pr-2 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyRows.map((row) => (
                                    <tr key={row.monthKey} className="border-b border-gray-100 dark:border-gray-700">
                                        <td className="py-2 pr-4">{formatTableMonth(row.date)}</td>
                                        <td className="py-2 pr-4">{row.portfolio_value != null ? formatCurrencyLocal(row.portfolio_value) : '—'}</td>
                                        <td className="py-2 pr-4">{row.contribution_total ? formatCurrencyLocal(row.contribution_total) : '—'}</td>
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
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No monthly data yet. Add a value or contribution above.</p>
                )}
            </div>

            <ConfirmModal
                isOpen={deleteConfirm.open}
                onClose={() => setDeleteConfirm({ open: false, type: null, id: null, monthKey: null })}
                onConfirm={handleConfirmDelete}
                title={
                    deleteConfirm.type === 'snapshot'
                        ? 'Delete value snapshot?'
                        : deleteConfirm.type === 'contribution'
                        ? 'Delete contribution?'
                        : 'Delete all data for this month?'
                }
                message="This cannot be undone."
                confirmText="Delete"
                variant="danger"
            />
        </div>
    )
}
