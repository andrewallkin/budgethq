import { useState, useEffect } from 'react'
import axios from 'axios'
import { Calendar, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency } from '../utils/numberFormatting'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { INCOME_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../utils/transactionCategories'
import ChartLegend from '../components/ChartLegend'

function formatPeriodRange(fromDate, toDate) {
    const from = new Date(fromDate)
    const to = new Date(toDate)
    const opts = { day: 'numeric', month: 'short', year: 'numeric' }
    return `${from.toLocaleDateString('en-ZA', opts)} – ${to.toLocaleDateString('en-ZA', opts)}`
}

export default function BudgetAnalysis() {
    const [loading, setLoading] = useState(true)
    const [budget, setBudget] = useState(null)
    const [transactions, setTransactions] = useState([])
    const [error, setError] = useState('')
    const [periodRange, setPeriodRange] = useState(null) // { from_date, to_date } for display

    const [selectedMonth, setSelectedMonth] = useState(null)

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

    const actualSpending = calculateActualSpending()
    const budgetedAmounts = mapBudgetToCategories()

    // Calculate totals and variance (exclude income, transfers, and uncategorized from budgeted)
    const totalBudgeted = Object.values(budgetedAmounts).reduce((sum, val) => sum + val, 0) - budgetedAmounts.income - budgetedAmounts.transfers - budgetedAmounts.uncategorized
    const totalSpent = Object.values(actualSpending).reduce((sum, val) => sum + val, 0) - actualSpending.income - actualSpending.transfers
    const variance = totalBudgeted - totalSpent

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
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(totalBudgeted)}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Spent</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(totalSpent)}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Variance</p>
                    <p className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${
                        variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                        {variance >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                        {formatCurrency(Math.abs(variance))}
                    </p>
                </div>
            </div>

            {/* Comparison Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
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
                                    Variance
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {comparisonData.map((row) => (
                                <tr key={row.category} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                        {row.category}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                                        {formatCurrency(row.budgeted)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-semibold">
                                        {formatCurrency(row.actual)}
                                    </td>
                                    <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                        row.variance >= 0
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400'
                                    }`}>
                                        {row.variance >= 0 ? '+' : ''}{formatCurrency(row.variance)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar Chart */}
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
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
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
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
