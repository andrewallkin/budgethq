import { useState, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, RefreshCw, Layers } from 'lucide-react'
import BlurredValue from './BlurredValue'
import { useAuth } from '../context/AuthContext'
import { formatCurrency as formatCurrencyUtil, formatDateSafe } from '../utils/numberFormatting'
import {
    PAPER_CHART,
    PaperCard,
    paperEyebrow,
    paperMoney,
    paperMoneyTone,
    paperSegment,
    paperIconBtn,
} from './appUi'

const TIME_RANGES = [
    { key: '1m', label: '1M' },
    { key: '3m', label: '3M' },
    { key: '6m', label: '6M' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' },
]

const btnBase =
    'inline-flex min-h-[36px] cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} text-[var(--paper-muted)] hover:bg-[var(--paper-card)] hover:text-[var(--paper-ink)]`

export default function PortfolioChart({
    portfolioId = null,
    currencyCode = 'ZAR',
    isTfsa = true,
}) {
    const { blurSensitiveValues } = useAuth()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedRange, setSelectedRange] = useState('1m')
    const [chartData, setChartData] = useState([])
    const [summary, setSummary] = useState(null)
    const [showContributions, setShowContributions] = useState(false)

    const chartFmtOpts = useMemo(
        () => ({
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }),
        [currencyCode]
    )

    useEffect(() => {
        if (!isTfsa) setShowContributions(false)
    }, [isTfsa])

    const fetchHistory = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const params = { range: selectedRange }
            if (portfolioId != null) params.portfolio_id = portfolioId
            const res = await axios.get('/api/portfolio/history', { params })
            setChartData(res.data.data || [])
            setSummary(res.data.summary || null)
        } catch (err) {
            console.error('Failed to fetch portfolio history', err)
            setError('Failed to load portfolio history')
        } finally {
            setLoading(false)
        }
    }, [selectedRange, portfolioId])

    useEffect(() => {
        fetchHistory()
    }, [fetchHistory])

    const formatCurrency = (value) => {
        if (value === null || value === undefined) {
            return formatCurrencyUtil(0, chartFmtOpts)
        }
        return formatCurrencyUtil(value, chartFmtOpts)
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return ''
        if (selectedRange === 'all' || selectedRange === '1y') {
            return formatDateSafe(dateStr, { month: 'short', year: '2-digit' })
        }
        return formatDateSafe(dateStr, { day: 'numeric', month: 'short' })
    }

    const processedData = chartData.map((d) => ({
        ...d,
        gain: d.gain,
        contributions: d.contributions,
        total: (d.contributions || 0) + (d.gain || 0),
    }))

    const calculateYAxisDomain = (data, showContributionsMode) => {
        if (!data || data.length === 0) {
            return { domain: [0, 'auto'], ticks: null }
        }

        let values
        if (showContributionsMode) {
            values = [...data.map((d) => d.contributions || 0), ...data.map((d) => d.total || 0)]
        } else {
            values = data.map((d) => d.total || 0)
        }

        const minValue = Math.min(...values)
        const maxValue = Math.max(...values)
        const range = maxValue - minValue

        if (minValue === maxValue) {
            const padding = Math.max(Math.abs(minValue) * 0.1, 1)
            const domainMin = minValue - padding
            const domainMax = maxValue + padding
            const increment = Math.max(padding / 2, Math.max(Math.abs(minValue) * 0.05, 0.01))
            const ticks = []
            for (let tick = domainMin; tick <= domainMax; tick += increment) {
                ticks.push(tick)
            }
            return { domain: [domainMin, domainMax], ticks }
        }

        const padding = range * 0.1
        const paddedMin = minValue - padding
        const paddedMax = maxValue + padding
        const targetTicks = 6
        const rawInterval = range / targetTicks
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

        const domainMin = Math.floor(paddedMin / increment) * increment
        const domainMax = Math.ceil(paddedMax / increment) * increment
        const ticks = []
        for (let tick = domainMin; tick <= domainMax; tick += increment) {
            ticks.push(tick)
        }

        return { domain: [domainMin, domainMax], ticks, increment }
    }

    const computeXTicks = (data, rangeKey) => {
        if (!data || data.length === 0) return []

        const totalPoints = data.length
        const rangeTickTargets = {
            '1m': 6,
            '3m': 8,
            '6m': 6,
            '1y': 6,
            all: 10,
        }

        let targetTickCount = rangeTickTargets[rangeKey] || 6
        targetTickCount = Math.min(targetTickCount, totalPoints)

        if (targetTickCount <= 1) {
            const firstDate = data[0]?.date
            return firstDate ? [firstDate] : []
        }

        const step = Math.max(1, Math.floor((totalPoints - 1) / (targetTickCount - 1)))
        const ticks = []

        for (let i = 0; i < totalPoints; i += step) {
            const date = data[i]?.date
            if (date && ticks[ticks.length - 1] !== date) {
                ticks.push(date)
            }
        }

        const lastDate = data[totalPoints - 1]?.date
        if (lastDate && ticks[ticks.length - 1] !== lastDate) {
            ticks.push(lastDate)
        }

        return ticks
    }

    const yAxisConfig = useMemo(() => {
        return calculateYAxisDomain(processedData, showContributions)
    }, [processedData, showContributions])

    const formatAxisMoney = useMemo(() => {
        const ticks = yAxisConfig.ticks
        let step = null
        if (Array.isArray(ticks) && ticks.length >= 2) {
            step = Math.abs(ticks[1] - ticks[0])
        }
        return (value) => {
            const useCompact = step != null && step >= 5000
            if (!useCompact) {
                let frac = 0
                if (step != null && step > 0) {
                    if (step < 1) frac = 2
                    else if (step < 100) frac = 2
                    else frac = 0
                } else {
                    frac = 2
                }
                return formatCurrencyUtil(value, {
                    currency: currencyCode,
                    minimumFractionDigits: 0,
                    maximumFractionDigits: frac,
                })
            }
            return formatCurrencyUtil(value, {
                currency: currencyCode,
                notation: 'compact',
                maximumFractionDigits: 1,
                minimumFractionDigits: 0,
            })
        }
    }, [yAxisConfig.ticks, currencyCode])

    const xTicks = useMemo(() => {
        return computeXTicks(processedData, selectedRange)
    }, [processedData, selectedRange])

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || payload.length === 0) return null

        if (showContributions) {
            const contributions = payload.find((p) => p.dataKey === 'contributions')?.value || 0
            const total = payload.find((p) => p.dataKey === 'total')?.value || 0

            return (
                <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] p-3 shadow-sm">
                    <p className="mb-2 text-xs text-[var(--paper-muted)]">{formatDate(label)}</p>
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-[var(--paper-muted)]">Portfolio value</span>
                            <BlurredValue>
                                <span className={`${paperMoney} text-[var(--paper-ink)]`}>
                                    {formatCurrency(total)}
                                </span>
                            </BlurredValue>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                                <div
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: PAPER_CHART.umber }}
                                />
                                <span className="text-xs text-[var(--paper-muted)]">Contributions</span>
                            </div>
                            <BlurredValue>
                                <span className="text-sm text-[var(--paper-ink)]">
                                    {formatCurrency(contributions)}
                                </span>
                            </BlurredValue>
                        </div>
                    </div>
                </div>
            )
        }

        const total = payload.find((p) => p.dataKey === 'total')?.value || 0

        return (
            <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] p-3 shadow-sm">
                <p className="mb-2 text-xs text-[var(--paper-muted)]">{formatDate(label)}</p>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[var(--paper-muted)]">Portfolio value</span>
                    <BlurredValue>
                        <span className={`${paperMoney} text-[var(--paper-ink)]`}>{formatCurrency(total)}</span>
                    </BlurredValue>
                </div>
            </div>
        )
    }

    if (chartData.length === 0 && !loading) {
        return null
    }

    return (
        <PaperCard className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className={paperEyebrow}>Performance</p>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={fetchHistory}
                        disabled={loading}
                        className={paperIconBtn}
                        title="Refresh chart"
                        aria-label="Refresh chart"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </button>

                    {isTfsa && (
                        <button
                            type="button"
                            onClick={() => setShowContributions(!showContributions)}
                            className={showContributions ? btnPrimary : btnGhost}
                            title={
                                showContributions
                                    ? 'Show portfolio value only'
                                    : 'Show contributions and portfolio value'
                            }
                        >
                            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{showContributions ? 'Both' : 'Value'}</span>
                        </button>
                    )}

                    <div className={paperSegment} role="group" aria-label="Time range">
                        {TIME_RANGES.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSelectedRange(key)}
                                className={`min-h-[32px] cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20 ${
                                    selectedRange === key
                                        ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                        : 'text-[var(--paper-muted)] hover:bg-[var(--paper-card)] hover:text-[var(--paper-ink)]'
                                }`}
                                aria-pressed={selectedRange === key}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {summary && !loading && (
                <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-[var(--paper-line)] pb-4 text-sm">
                    <div>
                        <span className="text-xs text-[var(--paper-muted)]">Start </span>
                        <BlurredValue>
                            <span className={`${paperMoney} text-[var(--paper-ink)]`}>
                                {formatCurrency(summary.period_start_value)}
                            </span>
                        </BlurredValue>
                    </div>
                    <div>
                        <span className="text-xs text-[var(--paper-muted)]">End </span>
                        <BlurredValue>
                            <span className={`${paperMoney} text-[var(--paper-ink)]`}>
                                {formatCurrency(summary.period_end_value)}
                            </span>
                        </BlurredValue>
                    </div>
                    <div className={`flex items-center gap-1 ${paperMoneyTone(summary.period_change)}`}>
                        {summary.period_change >= 0 ? (
                            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                            <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <BlurredValue>
                            <span className={paperMoney}>
                                {summary.period_change >= 0 ? '+' : ''}
                                {formatCurrency(summary.period_change)}
                            </span>
                        </BlurredValue>
                    </div>
                    <div className={paperMoneyTone(summary.period_change_percent)}>
                        <span className="text-xs text-[var(--paper-muted)]">Return </span>
                        <BlurredValue>
                            <span className={paperMoney}>
                                {summary.period_change_percent >= 0 ? '+' : ''}
                                {summary.period_change_percent.toFixed(2)}%
                            </span>
                        </BlurredValue>
                    </div>
                </div>
            )}

            {error && (
                <div className="py-6 text-center text-sm text-[var(--paper-brick)]">
                    <p>{error}</p>
                    <button
                        type="button"
                        onClick={fetchHistory}
                        className="mt-2 cursor-pointer text-sm text-[var(--paper-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20"
                    >
                        Try again
                    </button>
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-[var(--paper-muted)]" aria-hidden="true" />
                </div>
            )}

            {!loading && !error && chartData.length > 0 && (
                <div
                    className={`mt-4 h-56 min-h-[180px] sm:h-72 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={processedData}
                            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorContributions" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={PAPER_CHART.umber} stopOpacity={0.7} />
                                    <stop offset="95%" stopColor={PAPER_CHART.umber} stopOpacity={0.05} />
                                </linearGradient>
                                <linearGradient id="colorGain" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={PAPER_CHART.olive} stopOpacity={0.7} />
                                    <stop offset="95%" stopColor={PAPER_CHART.olive} stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--paper-line)" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={formatDate}
                                ticks={xTicks}
                                stroke="var(--paper-muted)"
                                tick={{ fill: 'var(--paper-muted)', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                dy={8}
                            />
                            <YAxis
                                domain={yAxisConfig.domain}
                                ticks={yAxisConfig.ticks}
                                tickFormatter={formatAxisMoney}
                                stroke="var(--paper-muted)"
                                tick={{ fill: 'var(--paper-muted)', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                width={72}
                                tickMargin={4}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {showContributions ? (
                                <>
                                    <Area
                                        type="monotone"
                                        dataKey="contributions"
                                        stroke={PAPER_CHART.umber}
                                        fill="url(#colorContributions)"
                                        strokeWidth={1.5}
                                        fillOpacity={1}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="total"
                                        stroke={PAPER_CHART.olive}
                                        fill="url(#colorGain)"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                    />
                                </>
                            ) : (
                                <Area
                                    type="monotone"
                                    dataKey="total"
                                    stroke={PAPER_CHART.olive}
                                    fill="url(#colorGain)"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                />
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {showContributions && isTfsa && !loading && chartData.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--paper-muted)]">
                    <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: PAPER_CHART.umber }} />
                        <span>Contributions</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: PAPER_CHART.olive }} />
                        <span>Portfolio value</span>
                    </div>
                </div>
            )}
        </PaperCard>
    )
}
