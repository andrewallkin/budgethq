import { useState, useEffect, Fragment } from 'react'
import axios from 'axios'
import { Calendar, AlertTriangle, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react'
import BlurredValue from '../components/BlurredValue'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../utils/numberFormatting'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { INCOME_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../utils/transactionCategories'
import ChartLegend from '../components/ChartLegend'
import HubBackLink from '../components/HubBackLink'

function formatPeriodRange(fromDate, toDate) {
    const from = new Date(fromDate)
    const to = new Date(toDate)
    const opts = { day: 'numeric', month: 'short', year: 'numeric' }
    return `${from.toLocaleDateString('en-ZA', opts)} – ${to.toLocaleDateString('en-ZA', opts)}`
}

export default function BudgetAnalysis() {
    const { blurSensitiveValues } = useAuth()
    const [loading, setLoading] = useState(true)
    const [budget, setBudget] = useState(null)
    const [transactions, setTransactions] = useState([])
    const [error, setError] = useState('')
    const [periodRange, setPeriodRange] = useState(null) // { from_date, to_date } for display

    const [selectedMonth, setSelectedMonth] = useState(null)
    const [expandedCategory, setExpandedCategory] = useState(null)

    useEffect(() => {
        if (selectedMonth === null) {
            axios.get('/api/budget/period/current')
                .then((res) => {
                    const m = String(res.data.end_month).padStart(2, '0')
                    setSelectedMonth(`${res.data.end_year}-${m}`)
                })
                .catch(() => {
                    const now = new Date()
                    setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
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
            // Fetch budget data
            const budgetResponse = await axios.get('/api/budget/default_user')
            setBudget(budgetResponse.data)

            // Get period dates (uses user's budget_period_start_day)
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
            const m = String(response.data.end_month).padStart(2, '0')
            setSelectedMonth(`${response.data.end_year}-${m}`)
        } catch (err) {
            // Fallback to calendar month
            const now = new Date()
            setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
        }
    }

    // Calculate actual spending per category
    const calculateActualSpending = () => {
        const spending = {
            income: 0,           // Aggregate of all income sub-categories
            groceries_household: 0,
            bills: 0,
            subscriptions: 0,
            transport: 0,
            lifestyle_misc: 0,
            savings: 0,
            loan_repayment: 0,
            transfers: 0,        // Track transfers but don't count toward budget
            uncategorized: 0     // Track uncategorized transactions
        }

        transactions.forEach(txn => {
            if (!txn.category) {
                // Uncategorized DEBITs count as untracked spending
                if (txn.transaction_type === 'DEBIT') {
                    spending.uncategorized += Math.abs(txn.amount)
                }
            } else if (INCOME_CATEGORIES.includes(txn.category)) {
                // All income sub-categories aggregate into income bucket
                if (txn.transaction_type === 'CREDIT') {
                    spending.income += txn.amount
                }
            } else if (spending.hasOwnProperty(txn.category)) {
                if (txn.transaction_type === 'DEBIT') {
                    spending[txn.category] += Math.abs(txn.amount)
                }
            }
        })

        return spending
    }

    // Map budget categories to transaction categories (explicit transaction_category per budget entry)
    const mapBudgetToCategories = () => {
        if (!budget) return {}

        const categoryBudgets = {
            income: budget.salary ?? budget.net_pay ?? 0,
            groceries_household: 0,
            bills: 0,
            subscriptions: 0,
            transport: 0,
            lifestyle_misc: 0,
            savings: 0,
            loan_repayment: 0,
            transfers: 0,
            uncategorized: 0
        }

        const allItems = [...(budget.needs || []), ...(budget.wants || []), ...(budget.savings || [])].filter(item => !item.excluded)
        allItems.forEach(item => {
            const cat = item.transaction_category || 'uncategorized'
            if (categoryBudgets.hasOwnProperty(cat)) {
                categoryBudgets[cat] += item.amount || 0
            }
        })

        return categoryBudgets
    }

    // Filter transactions for a given category (for expandable drill-down)
    const getTransactionsForCategory = (categoryKey) => {
        return transactions
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

    const actualSpending = calculateActualSpending()
    const budgetedAmounts = mapBudgetToCategories()

    // Calculate totals (exclude income, transfers, and uncategorized from headline budget rollup)
    const totalBudgeted = Object.values(budgetedAmounts).reduce((sum, val) => sum + val, 0) - budgetedAmounts.income - budgetedAmounts.transfers - budgetedAmounts.uncategorized
    const totalSpent = Object.values(actualSpending).reduce((sum, val) => sum + val, 0) - actualSpending.income - actualSpending.transfers

    /** Credits classified refund: extra envelope for headline summary only (not category rows/charts). */
    const refundCreditTotal = transactions.reduce((sum, txn) => {
        if (txn.category === 'refund' && txn.transaction_type === 'CREDIT') {
            return sum + Math.abs(txn.amount)
        }
        return sum
    }, 0)
    const totalBudgetedDisplay = totalBudgeted + refundCreditTotal
    const varianceDisplay = totalBudgetedDisplay - totalSpent

    // Prepare chart data (exclude income and transfers, but INCLUDE uncategorized)
    const comparisonData = Object.keys(budgetedAmounts)
        .filter(cat => cat !== 'income' && cat !== 'transfers')
        .map(category => ({
            category: CATEGORY_LABELS[category] || category,
            key: category,
            budgeted: budgetedAmounts[category],
            actual: actualSpending[category],
            variance: budgetedAmounts[category] - actualSpending[category]
        }))

    const pieData = comparisonData.map(item => ({
        name: item.category,
        key: item.key,
        value: item.actual
    })).filter(item => item.value > 0)

    if (selectedMonth === null || loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600 dark:text-gray-400">Loading budget analysis...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <HubBackLink to="/investec" label="Investec Banking" />
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        Budget Analysis
                    </h1>
                    {periodRange && budget?.budget_period_start_day !== 1 && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {formatPeriodRange(periodRange.from_date, periodRange.to_date)}
                        </p>
                    )}
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handleCurrentMonth}
                        className="px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        {budget?.budget_period_start_day !== 1 ? 'Current Period' : 'Current Month'}
                    </button>
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Budgeted</p>
                    <BlurredValue><p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(totalBudgetedDisplay)}
                    </p></BlurredValue>
                    {refundCreditTotal > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Includes <BlurredValue>{formatCurrency(refundCreditTotal)}</BlurredValue> from refunds this period
                        </p>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Spent</p>
                    <BlurredValue><p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(totalSpent)}
                    </p></BlurredValue>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Remaining</p>
                    <p className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${
                        varianceDisplay >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                        {varianceDisplay >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                        <BlurredValue>{formatCurrency(Math.abs(varianceDisplay))}</BlurredValue>
                    </p>
                </div>
            </div>

            {/* Comparison Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="w-10 px-2 py-3" aria-label="Expand" />
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Category
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Budgeted
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Actual
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Remaining
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {comparisonData.map((row) => {
                                const categoryTxns = getTransactionsForCategory(row.key)
                                const hasTransactions = categoryTxns.length > 0
                                const isExpanded = expandedCategory === row.key

                                return (
                                    <Fragment key={row.key}>
                                        <tr
                                            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${hasTransactions ? 'cursor-pointer' : ''}`}
                                            onClick={() => hasTransactions && setExpandedCategory(isExpanded ? null : row.key)}
                                        >
                                            <td className="w-10 px-2 py-3">
                                                {hasTransactions ? (
                                                    isExpanded ? (
                                                        <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                                    ) : (
                                                        <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                                    )
                                                ) : (
                                                    <span className="w-5 inline-block" />
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                                {row.category}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                                                <BlurredValue>{formatCurrency(row.budgeted)}</BlurredValue>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-semibold">
                                                <BlurredValue>{formatCurrency(row.actual)}</BlurredValue>
                                            </td>
                                            <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                                row.variance >= 0
                                                    ? 'text-green-600 dark:text-green-400'
                                                    : 'text-red-600 dark:text-red-400'
                                            }`}>
                                                {row.variance >= 0 ? '+' : ''}<BlurredValue>{formatCurrency(row.variance)}</BlurredValue>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr key={`${row.key}-expanded`} className="bg-gray-50 dark:bg-gray-800/50">
                                                <td colSpan={5} className="px-4 py-3">
                                                    <div className="pl-6 border-l-2 border-gray-200 dark:border-gray-600">
                                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                                            {categoryTxns.length} transaction{categoryTxns.length !== 1 ? 's' : ''}
                                                        </div>
                                                        <div className="max-h-48 overflow-y-auto space-y-2">
                                                            {categoryTxns.map((txn) => (
                                                                <div
                                                                    key={txn.id}
                                                                    className="flex justify-between items-center text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0"
                                                                >
                                                                    <span className="text-gray-600 dark:text-gray-400 shrink-0 w-24">
                                                                        {txn.transaction_date
                                                                            ? new Date(txn.transaction_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
                                                                            : '—'}
                                                                    </span>
                                                                    <span className="flex-1 min-w-0 truncate px-2 text-gray-900 dark:text-white" title={txn.description}>
                                                                        {txn.description || '—'}
                                                                    </span>
                                                                    <BlurredValue className="shrink-0 font-medium text-gray-900 dark:text-white">
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
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar Chart */}
                <div className={`bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Budgeted vs Actual
                    </h2>
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={comparisonData} margin={{ left: 30, bottom: 80 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                                dataKey="category"
                                stroke="#9CA3AF"
                                angle={-45}
                                textAnchor="end"
                                height={100}
                            />
                            <YAxis stroke="#9CA3AF" />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#1F2937',
                                    border: '1px solid #374151',
                                    borderRadius: '8px',
                                    color: '#F9FAFB'
                                }}
                                formatter={(value) => formatCurrency(value)}
                            />
                            <Legend
                                verticalAlign="top"
                                height={36}
                            />
                            <Bar dataKey="budgeted" fill="#3b82f6" name="Budgeted" />
                            <Bar dataKey="actual" fill="#10b981" name="Actual" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Pie Chart */}
                <div className={`bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Spending Breakdown
                    </h2>
                    {pieData.length > 0 ? (
                        <div>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={100}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={CATEGORY_COLORS[entry.key] || '#6b7280'}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1F2937',
                                            border: '1px solid #374151',
                                            borderRadius: '8px',
                                            color: '#F9FAFB'
                                        }}
                                        formatter={(value) => formatCurrency(value)}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <ChartLegend
                                payload={pieData.map((entry) => ({
                                    value: entry.name,
                                    color: CATEGORY_COLORS[entry.key] || '#6b7280'
                                }))}
                                formatter={(value) => {
                                    const item = pieData.find((d) => d.name === value)
                                    const total = pieData.reduce((s, d) => s + d.value, 0)
                                    const pct = item && total > 0 ? (item.value / total) * 100 : 0
                                    return `${value} (${pct.toFixed(1)}%)`
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-[300px] text-gray-600 dark:text-gray-400">
                            No spending data for this month
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
