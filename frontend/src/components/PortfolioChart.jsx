import { useState, useEffect } from 'react'
import axios from 'axios'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'
import { TrendingUp, TrendingDown, Calendar, RefreshCw } from 'lucide-react'

const TIME_RANGES = [
    { key: '1d', label: '1D' },
    { key: '7d', label: '7D' },
    { key: '1m', label: '1M' },
    { key: '3m', label: '3M' },
    { key: '6m', label: '6M' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' }
]

export default function PortfolioChart() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedRange, setSelectedRange] = useState('1m')
    const [chartData, setChartData] = useState([])
    const [summary, setSummary] = useState(null)

    useEffect(() => {
        fetchHistory()
    }, [selectedRange])

    const fetchHistory = async () => {
        setLoading(true)
        setError(null)

        try {
            const res = await axios.get(`/api/portfolio/history?range=${selectedRange}`)
            setChartData(res.data.data || [])
            setSummary(res.data.summary || null)
        } catch (err) {
            console.error('Failed to fetch portfolio history', err)
            setError('Failed to load portfolio history')
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return 'R 0'
        return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return ''
        const date = new Date(dateStr)
        if (selectedRange === 'all' || selectedRange === '1y') {
            return date.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' })
        }
        if (selectedRange === '1d') {
            return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
        }
        if (selectedRange === '7d') {
            return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' })
        }
        return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
    }

    // Calculate dynamic y-axis domain based on total values (contributions + gain)
    const calculateYAxisDomain = () => {
        if (!chartData || chartData.length === 0) {
            // Fallback to default domain if no data
            return [0, 'auto']
        }

        // Calculate total values (contributions + gain) for each data point
        const totalValues = chartData.map(d => {
            const contributions = d.contributions || 0
            const gain = d.gain || 0
            return contributions + gain
        })

        const minValue = Math.min(...totalValues)
        const maxValue = Math.max(...totalValues)

        // Handle edge case: all values are the same
        if (minValue === maxValue) {
            // If all values are the same, add some padding around the single value
            const padding = Math.max(minValue * 0.1, 1000) // 10% or at least R1000
            return [Math.max(0, minValue - padding), maxValue + padding]
        }

        // Calculate padding (5% of the range)
        const range = maxValue - minValue
        const padding = range * 0.05

        // Calculate domain with padding
        const domainMin = Math.max(0, minValue - padding) // Don't go below zero
        const domainMax = maxValue + padding

        return [domainMin, domainMax]
    }

    const yAxisDomain = calculateYAxisDomain()

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || payload.length === 0) return null

        const contributions = payload.find(p => p.dataKey === 'contributions')?.value || 0
        const gain = payload.find(p => p.dataKey === 'gain')?.value || 0
        const total = contributions + gain

        return (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
                <p className="text-gray-400 text-xs mb-2">{formatDate(label)}</p>
                <div className="space-y-1">
                    <div className="flex justify-between items-center gap-4">
                        <span className="text-gray-300 text-sm">Total Value</span>
                        <span className="text-white font-semibold">{formatCurrency(total)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-gray-400 text-xs">Contributions</span>
                        </div>
                        <span className="text-blue-400 text-sm">{formatCurrency(contributions)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${gain >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                            <span className="text-gray-400 text-xs">{gain >= 0 ? 'Gain' : 'Loss'}</span>
                        </div>
                        <span className={`text-sm ${gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                        </span>
                    </div>
                </div>
            </div>
        )
    }

    // Handle negative gains by adjusting the data
    const processedData = chartData.map(d => ({
        ...d,
        // If gain is negative, show it as a negative area
        gain: d.gain,
        // Contributions stay positive
        contributions: d.contributions
    }))

    const hasNegativeGains = chartData.some(d => d.gain < 0)

    if (chartData.length === 0 && !loading) {
        return (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                        Portfolio Performance
                    </h2>
                </div>
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No historical data available yet.</p>
                    <p className="text-sm mt-1">Data will appear after the first hourly snapshot.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    Portfolio Performance
                </h2>

                <div className="flex items-center gap-3">
                    {/* Refresh button */}
                    <button
                        onClick={fetchHistory}
                        disabled={loading}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>

                    {/* Time range selector */}
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        {TIME_RANGES.map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setSelectedRange(key)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${selectedRange === key
                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Summary cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Period Start</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(summary.period_start_value)}
                        </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Period End</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(summary.period_end_value)}
                        </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Change</p>
                        <p className={`text-lg font-semibold flex items-center gap-1 ${summary.period_change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                            {summary.period_change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            {summary.period_change >= 0 ? '+' : ''}{formatCurrency(summary.period_change)}
                        </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Return</p>
                        <p className={`text-lg font-semibold ${summary.period_change_percent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                            {summary.period_change_percent >= 0 ? '+' : ''}{summary.period_change_percent.toFixed(2)}%
                        </p>
                    </div>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="text-center py-8 text-red-500">
                    <p>{error}</p>
                    <button
                        onClick={fetchHistory}
                        className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                    >
                        Try again
                    </button>
                </div>
            )}

            {/* Loading state */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
            )}

            {/* Chart */}
            {!loading && !error && chartData.length > 0 && (
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={processedData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorContributions" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id="colorGain" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.1} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={formatDate}
                                stroke="#9CA3AF"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                domain={yAxisDomain}
                                tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`}
                                stroke="#9CA3AF"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                width={60}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                wrapperStyle={{ paddingTop: '20px' }}
                                formatter={(value) => (
                                    <span className="text-gray-600 dark:text-gray-400 text-sm">
                                        {value === 'contributions' ? 'Contributions' : 'Unrealized Gain/Loss'}
                                    </span>
                                )}
                            />
                            <Area
                                type="monotone"
                                dataKey="contributions"
                                stackId="1"
                                stroke="#3B82F6"
                                fill="url(#colorContributions)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="gain"
                                stackId="1"
                                stroke={hasNegativeGains ? "#EF4444" : "#10B981"}
                                fill={hasNegativeGains ? "url(#colorLoss)" : "url(#colorGain)"}
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Legend explanation */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
                        <span>Money you deposited (contributions)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
                        <span>Investment growth (unrealized gains)</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

