import { useState, useEffect, useMemo } from 'react'
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
import { TrendingUp, TrendingDown, Calendar, RefreshCw, Layers } from 'lucide-react'

const TIME_RANGES = [
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
    const [showContributions, setShowContributions] = useState(false)

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
        return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
    }

    // Handle negative gains by adjusting the data
    const processedData = chartData.map(d => ({
        ...d,
        // If gain is negative, show it as a negative area
        gain: d.gain,
        // Contributions stay positive
        contributions: d.contributions,
        // Total portfolio value
        total: (d.contributions || 0) + (d.gain || 0)
    }))

    // Calculate dynamic y-axis domain with smart increments
    const calculateYAxisDomain = (data, showContributions) => {
        if (!data || data.length === 0) {
            return { domain: [0, 'auto'], ticks: null }
        }

        // Extract values based on view mode
        let values
        if (showContributions) {
            // When showing both, consider both contributions and total
            values = [
                ...data.map(d => d.contributions || 0),
                ...data.map(d => d.total || 0)
            ]
        } else {
            // When showing only portfolio value
            values = data.map(d => d.total || 0)
        }

        const minValue = Math.min(...values)
        const maxValue = Math.max(...values)
        const range = maxValue - minValue

        // Handle edge case: all values are the same
        if (minValue === maxValue) {
            const padding = Math.max(minValue * 0.1, 1000)
            const domainMin = minValue - padding
            const domainMax = maxValue + padding
            // Generate a few ticks around the single value
            const increment = Math.max(padding / 2, 1000)
            const ticks = []
            for (let tick = domainMin; tick <= domainMax; tick += increment) {
                ticks.push(tick)
            }
            return {
                domain: [domainMin, domainMax],
                ticks: ticks
            }
        }

        // Calculate padding (10% of the range)
        const padding = range * 0.1
        const paddedMin = minValue - padding
        const paddedMax = maxValue + padding

        // Calculate appropriate increment based on range
        // Target: 4-8 ticks on the y-axis
        const targetTicks = 6
        const rawInterval = range / targetTicks

        // Round to nice increments: 1k, 2k, 5k, 10k, 20k, 50k, 100k, etc.
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
        const normalized = rawInterval / magnitude

        let increment
        if (normalized <= 1.5) {
            increment = magnitude
        } else if (normalized <= 3) {
            increment = 2 * magnitude
        } else if (normalized <= 7) {
            increment = 5 * magnitude
        } else {
            increment = 10 * magnitude
        }

        // Round min down and max up to nice numbers based on increment
        const domainMin = Math.floor(paddedMin / increment) * increment
        const domainMax = Math.ceil(paddedMax / increment) * increment

        // Generate tick values
        const ticks = []
        for (let tick = domainMin; tick <= domainMax; tick += increment) {
            ticks.push(tick)
        }

        return {
            domain: [domainMin, domainMax],
            ticks: ticks,
            increment: increment
        }
    }

    // Calculate evenly spaced x-axis ticks based on selected range
    const computeXTicks = (data, rangeKey) => {
        if (!data || data.length === 0) return []

        const totalPoints = data.length

        // Target number of ticks per range (including start and end)
        const rangeTickTargets = {
            '1m': 6,
            '3m': 8,
            '6m': 6,
            '1y': 6,
            'all': 10
        }

        let targetTickCount = rangeTickTargets[rangeKey] || 6
        // Don't ask for more ticks than we have points
        targetTickCount = Math.min(targetTickCount, totalPoints)

        if (targetTickCount <= 1) {
            const firstDate = data[0]?.date
            return firstDate ? [firstDate] : []
        }

        // Spread ticks roughly evenly across the data indices
        const step = Math.max(1, Math.floor((totalPoints - 1) / (targetTickCount - 1)))
        const ticks = []

        for (let i = 0; i < totalPoints; i += step) {
            const date = data[i]?.date
            if (date && ticks[ticks.length - 1] !== date) {
                ticks.push(date)
            }
        }

        // Ensure the last data point is always included
        const lastDate = data[totalPoints - 1]?.date
        if (lastDate && ticks[ticks.length - 1] !== lastDate) {
            ticks.push(lastDate)
        }

        return ticks
    }

    const yAxisConfig = useMemo(() => {
        return calculateYAxisDomain(processedData, showContributions)
    }, [processedData, showContributions])

    const xTicks = useMemo(() => {
        return computeXTicks(processedData, selectedRange)
    }, [processedData, selectedRange])

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || payload.length === 0) return null

        if (showContributions) {
            // Show both contributions and total
            const contributions = payload.find(p => p.dataKey === 'contributions')?.value || 0
            const total = payload.find(p => p.dataKey === 'total')?.value || 0

            return (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
                    <p className="text-gray-400 text-xs mb-2">{formatDate(label)}</p>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-gray-300 text-sm">Portfolio Value</span>
                            <span className="text-white font-semibold">{formatCurrency(total)}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                <span className="text-gray-400 text-xs">Contributions</span>
                            </div>
                            <span className="text-blue-400 text-sm">{formatCurrency(contributions)}</span>
                        </div>
                    </div>
                </div>
            )
        } else {
            // Show only portfolio value
            const total = payload.find(p => p.dataKey === 'total')?.value || 0

            return (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
                    <p className="text-gray-400 text-xs mb-2">{formatDate(label)}</p>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-gray-300 text-sm">Portfolio Value</span>
                            <span className="text-white font-semibold">{formatCurrency(total)}</span>
                        </div>
                    </div>
                </div>
            )
        }
    }

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

                    {/* View toggle */}
                    <button
                        onClick={() => setShowContributions(!showContributions)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${showContributions
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        title={showContributions ? 'Show portfolio value only' : 'Show contributions and portfolio value'}
                    >
                        <Layers className="w-4 h-4" />
                        <span>{showContributions ? 'Both' : 'Value Only'}</span>
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
                                ticks={xTicks}
                                stroke="#9CA3AF"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                domain={yAxisConfig.domain}
                                ticks={yAxisConfig.ticks}
                                tickFormatter={(value) => {
                                    if (value >= 1000000) {
                                        return `R${(value / 1000000).toFixed(1)}M`
                                    } else if (value >= 1000) {
                                        return `R${(value / 1000).toFixed(0)}k`
                                    } else {
                                        return `R${value.toFixed(0)}`
                                    }
                                }}
                                stroke="#9CA3AF"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                width={60}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {showContributions ? (
                                <>
                                    <Legend
                                        wrapperStyle={{ paddingTop: '20px' }}
                                        formatter={(value) => (
                                            <span className="text-gray-600 dark:text-gray-400 text-sm">
                                                {value === 'contributions' ? 'Contributions' : 'Portfolio Value'}
                                            </span>
                                        )}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="contributions"
                                        stroke="#3B82F6"
                                        fill="url(#colorContributions)"
                                        strokeWidth={2}
                                        fillOpacity={0.3}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="total"
                                        stroke="#10B981"
                                        fill="url(#colorGain)"
                                        strokeWidth={2}
                                        fillOpacity={0.3}
                                    />
                                </>
                            ) : (
                                <>
                                    <Legend
                                        wrapperStyle={{ paddingTop: '20px' }}
                                        formatter={() => (
                                            <span className="text-gray-600 dark:text-gray-400 text-sm">
                                                Portfolio Value
                                            </span>
                                        )}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="total"
                                        stroke="#10B981"
                                        fill="url(#colorGain)"
                                        strokeWidth={2}
                                        fillOpacity={0.3}
                                    />
                                </>
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Legend explanation */}
            {showContributions && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
                            <span>Money you deposited (contributions)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm bg-emerald-500"></div>
                            <span>Total portfolio value</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

