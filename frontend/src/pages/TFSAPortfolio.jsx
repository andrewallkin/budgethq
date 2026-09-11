import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import axios from 'axios'
import { Plus, Trash2, TrendingUp, Upload, Edit2, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Loader2, ChevronRight, PieChart } from 'lucide-react'
import {
    AllocationRow,
    PaperCard,
    PAPER_CHART,
    paperBtnGhost,
    paperBtnPrimary,
    paperDivider,
    paperEyebrow,
    paperField,
    paperIconBtn,
    paperIconBtnDanger,
    paperMoney,
    paperMoneyTone,
    paperSegment,
    paperTitle,
} from '../components/appUi'

const PAPER_CHART_COLORS = [PAPER_CHART.umber, PAPER_CHART.khaki, PAPER_CHART.olive]

function TargetActualRow({ name, target, actual, deviation, threshold }) {
    const scaleMax = Math.max(target, actual, 1)
    const withinThreshold = Math.abs(deviation) <= threshold

    return (
        <div className="py-3">
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-[var(--paper-ink)]">{name}</p>
                <span
                    className={`shrink-0 text-xs tabular-nums ${
                        withinThreshold ? 'text-[var(--paper-muted)]' : 'text-[var(--paper-brick)]'
                    }`}
                >
                    {deviation > 0 ? '+' : ''}
                    {deviation}%
                </span>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    <span className="w-11 shrink-0 text-[11px] text-[var(--paper-muted)]">Target</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-line)]">
                        <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                                width: `${(target / scaleMax) * 100}%`,
                                backgroundColor: PAPER_CHART.khaki,
                            }}
                        />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--paper-muted)]">
                        {target}%
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-11 shrink-0 text-[11px] text-[var(--paper-muted)]">Actual</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-line)]">
                        <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                                width: `${(actual / scaleMax) * 100}%`,
                                backgroundColor: PAPER_CHART.olive,
                            }}
                        />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--paper-ink)]">
                        {actual}%
                    </span>
                </div>
            </div>
        </div>
    )
}

// Import new components
import CSVUploadModal from '../components/CSVUploadModal'
import AddETFModal from '../components/AddETFModal'
import BuySellModal from '../components/BuySellModal'
import EditHoldingModal from '../components/EditHoldingModal'
import TransactionHistory from '../components/TransactionHistory'
import PriceRefreshIndicator from '../components/PriceRefreshIndicator'
import ConfirmModal from '../components/ConfirmModal'
import PortfolioChart from '../components/PortfolioChart'
import GainLossIndicator from '../components/GainLossIndicator'
import HoldingDetailsModal from '../components/HoldingDetailsModal'
import HubBackLink from '../components/HubBackLink'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatNumber, formatDateSafe } from '../utils/numberFormatting'
import BlurredValue from '../components/BlurredValue'


const HEADER_EDIT_CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP']

export default function TFSAPortfolio({
    portfolioId = null,
    portfolioName = 'TFSA Portfolio',
    isTfsa = true,
    showTargetAllocation = true,
    currencyCode = 'ZAR',
    onPortfolioMetaUpdated,
    onPortfolioDeleted,
    hubBackLink = null,
}) {
    const { blurSensitiveValues } = useAuth()
    const [loading, setLoading] = useState(true)
    const [holdings, setHoldings] = useState([])
    const [threshold, setThreshold] = useState(5.0)
    const [rebalanceData, setRebalanceData] = useState(null)
    const [isSaving, setIsSaving] = useState(false)
    const [allocToggleSaving, setAllocToggleSaving] = useState(false)
    const [transactionRefresh, setTransactionRefresh] = useState(0)

    // Modal states
    const [showCSVModal, setShowCSVModal] = useState(false)
    const [showAddETFModal, setShowAddETFModal] = useState(false)
    const [showBuySellModal, setShowBuySellModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showDeletePortfolioConfirm, setShowDeletePortfolioConfirm] = useState(false)
    const [deletingPortfolio, setDeletingPortfolio] = useState(false)
    const [deletePortfolioError, setDeletePortfolioError] = useState('')
    const [showDetailsModal, setShowDetailsModal] = useState(false)
    const [selectedHolding, setSelectedHolding] = useState(null)
    const [holdingToDelete, setHoldingToDelete] = useState(null)
    const [inlineError, setInlineError] = useState('')
    const [showLimitConfirm, setShowLimitConfirm] = useState(false)
    const [limitConfirmMessage, setLimitConfirmMessage] = useState('')
    const limitProceedRef = useRef(null)

    // Sorting state
    const [sortColumn, setSortColumn] = useState(null)
    const [sortDirection, setSortDirection] = useState('asc') // 'asc' or 'desc'

    // TFSA Contribution Limits (annual limit is FY-dependent, loaded from API)
    const [tfsaAnnualLimit, setTfsaAnnualLimit] = useState(36000)
    const TFSA_LIFETIME_LIMIT = 500000

    // Financial year metadata from backend (source of truth)
    const [financialYearStart, setFinancialYearStart] = useState(null)
    const [financialYearLabel, setFinancialYearLabel] = useState(null)

    // Deposits for current financial year
    const [deposits, setDeposits] = useState([])
    const [newDepositAmount, setNewDepositAmount] = useState('')
    const [newDepositDate, setNewDepositDate] = useState(new Date().toISOString().split('T')[0])

    // Historical contributions by year
    const [historicalContributions, setHistoricalContributions] = useState([])
    const [newHistoricalYear, setNewHistoricalYear] = useState('')
    const [newHistoricalAmount, setNewHistoricalAmount] = useState('')

    // What If Calculator
    const [whatIfAmount, setWhatIfAmount] = useState('')

    const portfolioCurrency = isTfsa ? 'ZAR' : (currencyCode || 'ZAR')
    const portfolioFmtBase = useMemo(
        () => ({
            currency: portfolioCurrency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }),
        [portfolioCurrency]
    )

    const fmtPortfolio = useCallback(
        (value, overrides = {}) => formatCurrency(value, { ...portfolioFmtBase, ...overrides }),
        [portfolioFmtBase]
    )

    const fmtZar = useCallback(
        (value, overrides = {}) =>
            formatCurrency(value, {
                currency: 'ZAR',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                ...overrides,
            }),
        []
    )

    const [editingPortfolioHeader, setEditingPortfolioHeader] = useState(false)
    const [draftPortfolioName, setDraftPortfolioName] = useState(portfolioName)
    const [draftPortfolioCurrency, setDraftPortfolioCurrency] = useState(portfolioCurrency)

    useEffect(() => {
        setDraftPortfolioName(portfolioName)
    }, [portfolioName])

    useEffect(() => {
        setDraftPortfolioCurrency(portfolioCurrency)
    }, [portfolioCurrency])

    useEffect(() => {
        fetchHoldings()
        if (isTfsa) {
            fetchContributions()
        } else {
            hasLoadedContributions.current = true
        }
    }, [portfolioId, isTfsa])

    useEffect(() => {
        if (!showTargetAllocation) {
            setRebalanceData(null)
            return
        }
        if (holdings.length > 0) {
            calculateRebalance()
        }
    }, [holdings, threshold, showTargetAllocation])

    // Track if contributions data has been loaded and if user has edited
    const hasLoadedContributions = useRef(false)
    const [hasUserEditedContributions, setHasUserEditedContributions] = useState(false)

    // Auto-save contributions - only after user has explicitly edited data
    useEffect(() => {
        // Don't save if we haven't loaded contributions yet
        if (!hasLoadedContributions.current) return
        // Don't save if user hasn't edited contributions yet
        if (!hasUserEditedContributions) return
        // Don't save while still loading
        if (loading) return

        const timer = setTimeout(() => {
            saveContributions()
        }, 1000)

        return () => clearTimeout(timer)
    }, [deposits, historicalContributions, loading, hasUserEditedContributions])

    const fetchHoldings = async () => {
        try {
            const requestConfig = portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            const etfRes = await axios.get('/api/etf/holdings', requestConfig)
            const etfs = (etfRes.data || []).map(etf => ({
                ...etf,
                type: isTfsa ? 'ETF' : 'Holding',
                total_value: etf.total_value || 0
            }))
            setHoldings(etfs)
        } catch (err) {
            console.error("Failed to fetch holdings", err)
        } finally {
            setLoading(false)
        }
    }

    const fetchContributions = async () => {
        if (!isTfsa) return
        try {
            const res = await axios.get('/api/tfsa/contributions')
            if (res.data) {
                const loadedHistorical = (res.data.historical_contributions || []).map(h => ({
                    id: h.id,
                    financial_year: h.financial_year,
                    amount: h.amount
                }))
                setHistoricalContributions(loadedHistorical)

                const loadedDeposits = (res.data.deposits || []).map(d => ({
                    id: d.id,
                    amount: d.amount,
                    date: d.date
                }))
                setDeposits(loadedDeposits)

                if (res.data.financial_year_start) {
                    setFinancialYearStart(res.data.financial_year_start)
                }
                if (res.data.current_financial_year_label) {
                    setFinancialYearLabel(res.data.current_financial_year_label)
                }
                if (res.data.annual_limit) {
                    setTfsaAnnualLimit(res.data.annual_limit)
                }

                // Mark that we've successfully loaded contributions
                hasLoadedContributions.current = true
            } else {
                // Even if no data, mark as loaded so saves can happen for new users
                hasLoadedContributions.current = true
            }
        } catch (err) {
            console.error("Failed to fetch contributions", err)
            // Mark as loaded even on error to prevent infinite blocking
            hasLoadedContributions.current = true
        }
        // No timer needed - hasUserEditedContributions controls when saves are allowed
    }

    const calculateRebalance = async () => {
        // Convert holdings to the format expected by the rebalance endpoint
        const etfsForRebalance = holdings.map(h => ({
            ETF: h.etf_name,
            Region: h.region,
            Target_Percentage: h.target_percentage,
            Current_Value: h.total_value || 0
        }))

        try {
            const res = await axios.post('/api/calculate/rebalance', {
                etfs: etfsForRebalance,
                threshold
            })
            setRebalanceData(res.data)
        } catch (err) {
            console.error("Failed to calculate rebalance", err)
        }
    }

    const saveContributions = async () => {
        if (!isTfsa) return
        setIsSaving(true)
        try {
            await axios.post('/api/tfsa/contributions', {
                historical_contributions: historicalContributions.map(h => ({
                    id: h.id,
                    financial_year: h.financial_year,
                    amount: h.amount
                })),
                deposits: deposits.map(d => ({
                    id: d.id,
                    amount: d.amount,
                    date: d.date
                })),
                // financial_year_start is now derived server-side; we still send it for
                // backward compatibility if available, but backend does not rely on it.
                financial_year_start: financialYearStart,
                current_financial_year_start: financialYearStart
            })
        } catch (err) {
            console.error("Failed to save contributions", err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteClick = (holding) => {
        setInlineError('')
        setHoldingToDelete(holding)
        setShowDeleteConfirm(true)
    }

    const handleDeleteConfirm = async () => {
        if (!holdingToDelete) return

        try {
            await axios.delete(
                `/api/etf/holdings/${holdingToDelete.id}?delete_from_sheet=true`,
                portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            )
            setHoldings(holdings.filter(h => h.id !== holdingToDelete.id))
            setTransactionRefresh(prev => prev + 1)
            setInlineError('')
        } catch (err) {
            console.error("Failed to delete holding", err)
            setInlineError(err.response?.data?.detail || 'Failed to delete holding')
        } finally {
            setHoldingToDelete(null)
        }
    }

    const handleBuySell = (holding) => {
        setSelectedHolding(holding)
        setShowBuySellModal(true)
    }

    const handleEdit = (holding) => {
        setSelectedHolding(holding)
        setShowEditModal(true)
    }

    const handleTransactionSuccess = () => {
        fetchHoldings()
        setTransactionRefresh(prev => prev + 1)
    }

    const handleHoldingUpdate = (holdingId, updates) => {
        setHoldings(prevHoldings =>
            prevHoldings.map(holding =>
                holding.id === holdingId
                    ? { ...holding, ...updates }
                    : holding
            )
        )
    }

    const handleSort = (column) => {
        if (sortColumn === column) {
            // Toggle direction if clicking the same column
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            // New column, default to ascending
            setSortColumn(column)
            setSortDirection('asc')
        }
    }

    const getSortedHoldings = () => {
        const activeHoldings = holdings.filter((h) =>
            showTargetAllocation
                ? (h.shares || 0) > 0 || (h.target_percentage || 0) > 0
                : (h.shares || 0) > 0
        )

        if (!sortColumn) return activeHoldings

        const sorted = [...activeHoldings].sort((a, b) => {
            let aVal, bVal

            switch (sortColumn) {
                case 'name':
                    aVal = a.etf_name.toLowerCase()
                    bVal = b.etf_name.toLowerCase()
                    break
                case 'value':
                    aVal = a.total_value || 0
                    bVal = b.total_value || 0
                    break
                case 'gain_loss':
                    // Sort by percentage first, then by amount
                    aVal = a.gain_loss_percentage !== null ? a.gain_loss_percentage : -999
                    bVal = b.gain_loss_percentage !== null ? b.gain_loss_percentage : -999
                    if (aVal === bVal) {
                        aVal = a.gain_loss_amount !== null ? a.gain_loss_amount : -999
                        bVal = b.gain_loss_amount !== null ? b.gain_loss_amount : -999
                    }
                    break
                default:
                    return 0
            }

            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
            return 0
        })

        return sorted
    }

    const SortIcon = ({ column }) => {
        if (sortColumn !== column) {
            return <ArrowUpDown className="w-3 h-3 opacity-40" />
        }
        return sortDirection === 'asc'
            ? <ArrowUp className="w-3 h-3" />
            : <ArrowDown className="w-3 h-3" />
    }

    const openLimitConfirm = (message, proceed) => {
        setLimitConfirmMessage(message)
        limitProceedRef.current = proceed
        setShowLimitConfirm(true)
    }

    const closeLimitConfirm = () => {
        setShowLimitConfirm(false)
        limitProceedRef.current = null
    }

    const handleLimitConfirmClick = () => {
        const fn = limitProceedRef.current
        limitProceedRef.current = null
        fn?.()
        if (!limitProceedRef.current) {
            setShowLimitConfirm(false)
        }
    }

    const handleDeletePortfolio = async () => {
        if (!portfolioId || isTfsa || deletingPortfolio) return
        setDeletePortfolioError('')
        setDeletingPortfolio(true)
        try {
            await axios.delete(`/api/investments/${portfolioId}`, { params: { confirm: true } })
            setShowDeletePortfolioConfirm(false)
            await onPortfolioDeleted?.()
        } catch (err) {
            setDeletePortfolioError(
                err.response?.data?.detail || 'Failed to delete account',
            )
        } finally {
            setDeletingPortfolio(false)
        }
    }

    const persistTargetAllocationToggle = async (enabled) => {
        if (!portfolioId || isTfsa) return
        setInlineError('')
        setAllocToggleSaving(true)
        try {
            const { data } = await axios.patch(`/api/investments/${portfolioId}`, {
                target_allocation_enabled: enabled,
            })
            onPortfolioMetaUpdated?.(data)
        } catch (err) {
            setInlineError(err.response?.data?.detail || 'Could not update target allocation setting')
        } finally {
            setAllocToggleSaving(false)
        }
    }

    const savePortfolioHeader = async () => {
        if (!portfolioId) return
        const body = {}
        const trimmed = draftPortfolioName.trim()
        if (trimmed && trimmed !== portfolioName) {
            body.name = trimmed
        }
        if (!isTfsa && draftPortfolioCurrency !== portfolioCurrency) {
            body.currency_code = draftPortfolioCurrency
        }
        if (Object.keys(body).length === 0) {
            setEditingPortfolioHeader(false)
            return
        }
        setInlineError('')
        try {
            const { data } = await axios.patch(`/api/investments/${portfolioId}`, body)
            onPortfolioMetaUpdated?.(data)
            setEditingPortfolioHeader(false)
        } catch (err) {
            setInlineError(err.response?.data?.detail || 'Could not update portfolio')
        }
    }

    // Deposit management
    const applyDeposit = (amount, dateStr) => {
        const newDeposit = {
            id: Date.now(),
            amount: amount,
            date: dateStr
        }
        setHasUserEditedContributions(true)
        setDeposits(prev => [...prev, newDeposit])
        setNewDepositAmount('')
        setNewDepositDate(new Date().toISOString().split('T')[0])
    }

    const addDeposit = () => {
        const amount = parseFloat(String(newDepositAmount).replace(/,/g, ''))
        if (!amount || amount <= 0) return
        const dateStr = newDepositDate

        const newTotal = annualContributions + amount
        if (newTotal > tfsaAnnualLimit) {
            const exceed = newTotal - tfsaAnnualLimit
            openLimitConfirm(
                `This will exceed your annual limit by ${fmtZar(exceed)}. Continue anyway?`,
                () => applyDeposit(amount, dateStr)
            )
            return
        }

        applyDeposit(amount, dateStr)
    }

    const removeDeposit = (id) => {
        setHasUserEditedContributions(true)
        setDeposits(deposits.filter(d => d.id !== id))
    }

    // Historical contribution management
    const commitHistoricalContribution = (fy, amount) => {
        const newHistorical = {
            id: Date.now(),
            financial_year: fy,
            amount: amount
        }
        setHasUserEditedContributions(true)
        setHistoricalContributions(prev => [...prev, newHistorical])
        setNewHistoricalYear('')
        setNewHistoricalAmount('')
    }

    const addHistoricalContribution = () => {
        const fy = newHistoricalYear.trim()
        const amount = parseFloat(String(newHistoricalAmount).replace(/,/g, ''))
        if (!fy || !amount || amount <= 0) return

        const existingForYear = historicalContributions
            .filter(h => h.financial_year === fy)
            .reduce((sum, h) => sum + h.amount, 0)
        const yearTotal = existingForYear + amount

        const tryLifetimeCheck = () => {
            const histTotal = historicalContributions.reduce((sum, h) => sum + h.amount, 0)
            const annual = deposits.reduce((sum, d) => sum + d.amount, 0)
            const newLifetimeTotal = histTotal + annual + amount
            if (newLifetimeTotal > TFSA_LIFETIME_LIMIT) {
                const exceed = newLifetimeTotal - TFSA_LIFETIME_LIMIT
                openLimitConfirm(
                    `This will exceed your lifetime limit by ${fmtZar(exceed)}. Continue anyway?`,
                    () => commitHistoricalContribution(fy, amount)
                )
                return
            }
            commitHistoricalContribution(fy, amount)
        }

        if (yearTotal > tfsaAnnualLimit) {
            const exceed = yearTotal - tfsaAnnualLimit
            openLimitConfirm(
                `FY ${fy} will exceed annual limit by ${fmtZar(exceed)}. Continue anyway?`,
                tryLifetimeCheck
            )
            return
        }
        tryLifetimeCheck()
    }

    const removeHistoricalContribution = (id) => {
        setHasUserEditedContributions(true)
        setHistoricalContributions(historicalContributions.filter(h => h.id !== id))
    }

    // Metrics
    const totalValue = holdings.reduce((sum, h) => sum + (h.total_value || 0), 0)
    const totalTarget = holdings.reduce((sum, h) => sum + h.target_percentage, 0)

    // TFSA Contribution calculations
    const annualContributions = deposits.reduce((sum, d) => sum + d.amount, 0)
    const contributionsRemaining = tfsaAnnualLimit - annualContributions
    const contributionPercentUsed = (annualContributions / tfsaAnnualLimit) * 100

    // Lifetime contribution calculations
    const historicalTotal = historicalContributions.reduce((sum, h) => sum + h.amount, 0)
    const totalLifetimeContributions = historicalTotal + annualContributions
    const totalInvested = isTfsa
        ? totalLifetimeContributions
        : holdings.reduce((sum, h) => sum + (h.cost_basis || 0), 0)

    const lifetimeRemaining = TFSA_LIFETIME_LIMIT - totalLifetimeContributions
    const lifetimePercentUsed = (totalLifetimeContributions / TFSA_LIFETIME_LIMIT) * 100

    // Charts Data
    const currentAllocationData = holdings.map(h => ({
        name: h.etf_name,
        value: h.total_value || 0
    }))

    // Target vs Actual Bar Chart Data
    const targetVsActualData = holdings.map(h => {
        const currentPercent = totalValue > 0 ? ((h.total_value || 0) / totalValue) * 100 : 0
        const deviation = currentPercent - h.target_percentage
        return {
            name: h.etf_name,
            target: h.target_percentage,
            actual: parseFloat(currentPercent.toFixed(2)),
            deviation: parseFloat(deviation.toFixed(2))
        }
    })

    // What If Calculator
    const calculateWhatIfDistribution = () => {
        const amount = parseFloat(whatIfAmount) || 0
        if (amount <= 0 || totalTarget === 0) return []

        return holdings.map(h => ({
            etf: h.etf_name,
            targetPercentage: h.target_percentage,
            buyAmount: (h.target_percentage / 100) * amount
        })).filter(item => item.buyAmount > 0)
            .sort((a, b) => b.buyAmount - a.buyAmount)
    }

    const whatIfDistribution = calculateWhatIfDistribution()

    const isEmpty = holdings.length === 0
    const profitDelta = totalValue - totalInvested
    const hasMeaningfulProfit = profitDelta !== 0 || totalValue > 0
    const showSummary = !isEmpty || totalInvested > 0
    const profitPct =
        totalInvested > 0 ? (((totalValue - totalInvested) / totalInvested) * 100).toFixed(2) : null

    if (loading) {
        return (
            <div className="mx-auto flex max-w-[1080px] items-center justify-center py-12 text-[var(--paper-muted)]">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                Loading…
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-[1080px] space-y-8">
            {portfolioId != null && hubBackLink?.to && hubBackLink?.label && (
                <HubBackLink to={hubBackLink.to} label={hubBackLink.label} className="mb-1" />
            )}

            {inlineError && (
                <PaperCard role="alert" className="flex items-center gap-2 px-5 py-4 text-sm text-[var(--paper-brick)]">
                    <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                    <span>{inlineError}</span>
                </PaperCard>
            )}

            {/* Header */}
            <header>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        {editingPortfolioHeader && portfolioId ? (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-end gap-2">
                                    <input
                                        type="text"
                                        value={draftPortfolioName}
                                        onChange={(e) => setDraftPortfolioName(e.target.value)}
                                        className={`${paperField} min-w-0 flex-1 max-w-md text-xl font-semibold sm:text-2xl`}
                                    />
                                    {!isTfsa && (
                                        <select
                                            value={draftPortfolioCurrency}
                                            onChange={(e) => setDraftPortfolioCurrency(e.target.value)}
                                            className={`${paperField} w-24 max-w-24 shrink-0`}
                                            aria-label="Portfolio currency"
                                        >
                                            {HEADER_EDIT_CURRENCIES.map((c) => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                {!isTfsa && (
                                    <label
                                        htmlFor="track-target-allocation"
                                        className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)]/50 px-3 py-2 text-sm text-[var(--paper-muted)] transition-colors duration-200 hover:bg-[var(--paper-canvas)]"
                                    >
                                        <input
                                            id="track-target-allocation"
                                            type="checkbox"
                                            className="cursor-pointer rounded border-[var(--paper-line)] text-[var(--paper-ink)] focus:ring-[var(--paper-accent)]/20"
                                            checked={showTargetAllocation}
                                            disabled={allocToggleSaving}
                                            onChange={(e) => persistTargetAllocationToggle(e.target.checked)}
                                        />
                                        <span>Track target allocation</span>
                                    </label>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={savePortfolioHeader} className={paperBtnPrimary}>
                                        Save
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftPortfolioName(portfolioName)
                                            setDraftPortfolioCurrency(portfolioCurrency)
                                            setEditingPortfolioHeader(false)
                                            setInlineError('')
                                        }}
                                        className={paperBtnGhost}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <p className={paperEyebrow}>{isTfsa ? 'TFSA' : 'Google Sheets'}</p>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                                    <h1 className={`${paperTitle} truncate`}>{portfolioName}</h1>
                                    <span className="shrink-0 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--paper-muted)]">
                                        {portfolioCurrency}
                                    </span>
                                    {portfolioId && (
                                        <button
                                            type="button"
                                            onClick={() => setEditingPortfolioHeader(true)}
                                            className={paperIconBtn}
                                            aria-label={isTfsa ? 'Edit portfolio name' : 'Edit portfolio name, currency, and allocation tracking'}
                                            title={isTfsa ? 'Edit portfolio name' : 'Edit portfolio name, currency, and allocation tracking'}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                        <PriceRefreshIndicator onRefresh={fetchHoldings} portfolioId={portfolioId} />
                        <button type="button" onClick={() => setShowCSVModal(true)} className={paperBtnGhost}>
                            <Upload className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="whitespace-nowrap">Import</span>
                        </button>
                        <button type="button" onClick={() => setShowAddETFModal(true)} className={paperBtnPrimary}>
                            <Plus className="h-4 w-4 shrink-0" aria-hidden />
                            <span className="whitespace-nowrap">Add</span>
                        </button>
                    </div>
                </div>
            </header>

            {isEmpty && (
                <PaperCard className="px-6 py-10 text-center sm:py-12">
                    <div className="mx-auto max-w-md">
                        <PieChart className="mx-auto h-10 w-10 text-[var(--paper-muted)]" aria-hidden />
                        <h2 className="mt-4 text-xl font-semibold text-[var(--paper-ink)]">No holdings yet</h2>
                        <p className="mt-2 text-sm text-[var(--paper-muted)]">
                            {isTfsa
                                ? 'Import a CSV from EasyEquities or add ETFs manually to start tracking this portfolio.'
                                : 'Import a CSV or add stocks and ETFs to connect this Google Sheets account.'}
                        </p>
                        <div className="mt-6 flex flex-row flex-wrap justify-center gap-2">
                            <button type="button" onClick={() => setShowCSVModal(true)} className={paperBtnGhost}>
                                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                                Import CSV
                            </button>
                            <button type="button" onClick={() => setShowAddETFModal(true)} className={paperBtnPrimary}>
                                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                Add holding
                            </button>
                        </div>
                    </div>
                </PaperCard>
            )}

            {/* Portfolio summary KPIs */}
            {showSummary && (
                <PaperCard className="p-5 sm:p-6">
                    <p className={paperEyebrow}>Portfolio summary</p>
                    <div className="mt-4 grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--paper-line)]">
                        <div className="sm:px-5 sm:first:pl-0">
                            <p className="text-xs text-[var(--paper-muted)]">Portfolio value</p>
                            <p className={`mt-1 text-2xl sm:text-[1.75rem] ${paperMoney} text-[var(--paper-ink)]`}>
                                <BlurredValue>{fmtPortfolio(totalValue)}</BlurredValue>
                            </p>
                            <p className="mt-1 text-xs text-[var(--paper-muted)]">
                                {holdings.length} holding{holdings.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="sm:px-5">
                            <p className="text-xs text-[var(--paper-muted)]">Total invested</p>
                            <p className={`mt-1 text-xl ${paperMoney} text-[var(--paper-ink)]`}>
                                <BlurredValue>{fmtPortfolio(totalInvested)}</BlurredValue>
                            </p>
                            <p className="mt-1 text-xs text-[var(--paper-muted)]">
                                {isTfsa ? 'Lifetime contributions' : 'Cost basis'}
                            </p>
                        </div>
                        <div className="sm:px-5 sm:last:pr-0">
                            <p className="text-xs text-[var(--paper-muted)]">
                                {profitDelta >= 0 ? 'Profit' : 'Loss'}
                            </p>
                            {hasMeaningfulProfit ? (
                                <>
                                    <p
                                        className={`mt-1 text-xl ${paperMoney} ${paperMoneyTone(profitDelta)}`}
                                    >
                                        <BlurredValue>
                                            {fmtPortfolio(profitDelta, {
                                                signDisplay: profitDelta === 0 ? 'auto' : 'always',
                                            })}
                                        </BlurredValue>
                                    </p>
                                    {profitPct != null && (
                                        <p className={`mt-1 text-xs ${paperMoneyTone(profitDelta)}`}>
                                            {profitDelta >= 0 ? '+' : ''}
                                            {profitPct}% return
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className={`mt-1 text-xl ${paperMoney} text-[var(--paper-muted)]`}>—</p>
                            )}
                        </div>
                    </div>
                </PaperCard>
            )}

            {/* Portfolio Performance Chart (scoped to this portfolio) */}
            {portfolioId != null && !isEmpty && (
                <div className={blurSensitiveValues ? 'blur-[5px] select-none' : ''}>
                    <PortfolioChart
                        portfolioId={portfolioId}
                        currencyCode={portfolioCurrency}
                        isTfsa={isTfsa}
                    />
                </div>
            )}

            {/* TFSA Contribution Tracking */}
            {isTfsa && (
                <PaperCard className="p-5 sm:p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <p className={paperEyebrow}>
                                TFSA contributions{financialYearLabel ? ` · FY ${financialYearLabel}` : ''}
                            </p>
                        </div>
                        <span className="text-xs text-[var(--paper-muted)]">
                            {isSaving ? 'Saving…' : 'Auto-saved'}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-6 md:divide-x md:divide-[var(--paper-line)]">
                        {/* Annual Contributions */}
                        <div className="md:pr-6">
                            <div className="mb-3 flex items-baseline justify-between gap-2">
                                <h3 className="text-sm font-medium text-[var(--paper-ink)]">This financial year</h3>
                                <BlurredValue>
                                    <span className={`text-xs ${paperMoney} text-[var(--paper-muted)]`}>
                                        Limit {fmtZar(tfsaAnnualLimit, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                </BlurredValue>
                            </div>

                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                <BlurredValue as="div" className="flex flex-1 items-center gap-1">
                                    <span className="text-sm text-[var(--paper-muted)]">R</span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={newDepositAmount}
                                        onChange={(e) => setNewDepositAmount(e.target.value)}
                                        placeholder="Amount"
                                        className={paperField}
                                    />
                                </BlurredValue>
                                <input
                                    type="date"
                                    value={newDepositDate}
                                    onChange={(e) => setNewDepositDate(e.target.value)}
                                    className={`${paperField} sm:w-36`}
                                />
                                <button type="button" onClick={addDeposit} className={`${paperBtnPrimary} shrink-0`}>
                                    <Plus className="h-4 w-4" aria-hidden /> Add
                                </button>
                            </div>

                            {deposits.length > 0 && (
                                <div className={`mb-4 ${paperDivider}`}>
                                    {deposits.sort((a, b) => new Date(a.date) - new Date(b.date)).map((deposit) => (
                                        <div key={deposit.id} className="flex items-center justify-between py-2 text-sm">
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <BlurredValue>
                                                    <span className={`shrink-0 ${paperMoney} text-[var(--paper-ink)]`}>
                                                        {fmtZar(deposit.amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                    </span>
                                                </BlurredValue>
                                                <span className="truncate text-xs text-[var(--paper-muted)]">
                                                    {formatDateSafe(deposit.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeDeposit(deposit.id)}
                                                className={paperIconBtnDanger}
                                                aria-label="Remove deposit"
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-line)]">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                        width: `${Math.min(contributionPercentUsed, 100)}%`,
                                        background:
                                            contributionPercentUsed >= 100
                                                ? 'var(--paper-brick)'
                                                : contributionPercentUsed >= 80
                                                  ? PAPER_CHART.khaki
                                                  : PAPER_CHART.olive,
                                    }}
                                />
                            </div>
                            <div className="mt-2 flex justify-between text-xs">
                                <BlurredValue>
                                    <span className="text-[var(--paper-muted)]">
                                        {fmtZar(annualContributions, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} used
                                        {' · '}
                                        {formatNumber(contributionPercentUsed, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                    </span>
                                </BlurredValue>
                                <BlurredValue>
                                    <span className={`${paperMoney} ${paperMoneyTone(contributionsRemaining)}`}>
                                        {fmtZar(contributionsRemaining, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} left
                                    </span>
                                </BlurredValue>
                            </div>
                        </div>

                        {/* Lifetime Contributions */}
                        <div className="md:pl-6">
                            <div className="mb-3 flex items-baseline justify-between gap-2">
                                <h3 className="text-sm font-medium text-[var(--paper-ink)]">Lifetime</h3>
                                <BlurredValue>
                                    <span className={`text-xs ${paperMoney} text-[var(--paper-muted)]`}>
                                        Limit {fmtZar(TFSA_LIFETIME_LIMIT, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    </span>
                                </BlurredValue>
                            </div>

                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                <input
                                    type="text"
                                    value={newHistoricalYear}
                                    onChange={(e) => setNewHistoricalYear(e.target.value)}
                                    placeholder="2018/19"
                                    className={`${paperField} sm:w-24`}
                                />
                                <BlurredValue as="div" className="flex flex-1 items-center gap-1">
                                    <span className="text-sm text-[var(--paper-muted)]">R</span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={newHistoricalAmount}
                                        onChange={(e) => setNewHistoricalAmount(e.target.value)}
                                        placeholder="Amount"
                                        className={paperField}
                                    />
                                </BlurredValue>
                                <button type="button" onClick={addHistoricalContribution} className={`${paperBtnPrimary} shrink-0`}>
                                    <Plus className="h-4 w-4" aria-hidden /> Add
                                </button>
                            </div>

                            {historicalContributions.length > 0 && (
                                <div className={`mb-4 max-h-32 overflow-y-auto ${paperDivider}`}>
                                    {historicalContributions
                                        .sort((a, b) => a.financial_year.localeCompare(b.financial_year))
                                        .map((hist) => (
                                            <div key={hist.id} className="flex items-center justify-between py-2 text-sm">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="shrink-0 text-[var(--paper-ink)]">FY {hist.financial_year}</span>
                                                    <BlurredValue>
                                                        <span className={`${paperMoney} text-[var(--paper-ink)]`}>
                                                            {fmtZar(hist.amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                        </span>
                                                    </BlurredValue>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeHistoricalContribution(hist.id)}
                                                    className={paperIconBtnDanger}
                                                    aria-label={`Remove FY ${hist.financial_year} contribution`}
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden />
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            )}

                            <BlurredValue>
                                <p className={`mb-3 text-xl ${paperMoney} text-[var(--paper-ink)]`}>
                                    {fmtZar(totalLifetimeContributions, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                    <span className="ml-2 text-xs font-normal text-[var(--paper-muted)]">total contributed</span>
                                </p>
                            </BlurredValue>

                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-line)]">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                        width: `${Math.min(lifetimePercentUsed, 100)}%`,
                                        background:
                                            lifetimePercentUsed >= 100
                                                ? 'var(--paper-brick)'
                                                : lifetimePercentUsed >= 80
                                                  ? PAPER_CHART.khaki
                                                  : PAPER_CHART.umber,
                                    }}
                                />
                            </div>
                            <div className="mt-2 flex justify-between text-xs">
                                <BlurredValue>
                                    <span className="text-[var(--paper-muted)]">
                                        {formatNumber(lifetimePercentUsed, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% used
                                    </span>
                                </BlurredValue>
                                <BlurredValue>
                                    <span className={`${paperMoney} ${paperMoneyTone(lifetimeRemaining)}`}>
                                        {fmtZar(lifetimeRemaining, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} left
                                    </span>
                                </BlurredValue>
                            </div>
                        </div>
                    </div>
                </PaperCard>
            )}

            {/* Holdings */}
            {holdings.length > 0 && (
                <PaperCard className="p-5 sm:p-6">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className={paperEyebrow}>Holdings</p>
                        <div className={`${paperSegment} self-start`} role="group" aria-label="Sort holdings">
                            <span className="hidden px-2 py-1.5 text-xs text-[var(--paper-muted)] sm:inline">Sort</span>
                            {[
                                { key: 'name', label: 'Name' },
                                { key: 'value', label: 'Value' },
                                { key: 'gain_loss', label: 'Gain/Loss' },
                            ].map(({ key, label }) => {
                                const active = sortColumn === key
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => handleSort(key)}
                                        aria-pressed={active}
                                        className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-200 ${
                                            active
                                                ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                                : 'text-[var(--paper-muted)] hover:bg-[var(--paper-card)] hover:text-[var(--paper-ink)]'
                                        }`}
                                    >
                                        {label} <SortIcon column={key} />
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    <div className={paperDivider}>
                        {getSortedHoldings().map((h) => {
                            const typeLabel = !isTfsa
                                ? `${(h.instrument_type || 'etf') === 'stock' ? 'Stock' : 'ETF'}`
                                : null
                            const holdingHint = [h.jse_ticker, typeLabel].filter(Boolean).join(' · ')
                            return (
                                <div
                                    key={h.id}
                                    className="group/holding relative -mx-2 rounded-md transition-colors duration-200 hover:bg-[var(--paper-canvas)]"
                                >
                                    <div className="flex items-center gap-0">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedHolding(h)
                                                setShowDetailsModal(true)
                                            }}
                                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--paper-accent)]/30"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-[var(--paper-ink)]">
                                                    {h.etf_name}
                                                </p>
                                                {holdingHint ? (
                                                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--paper-muted)]">
                                                        {holdingHint}
                                                    </p>
                                                ) : null}
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-0.5">
                                                <BlurredValue>
                                                    <span className={`text-base sm:text-lg ${paperMoney} text-[var(--paper-ink)]`}>
                                                        {fmtPortfolio(h.total_value || 0)}
                                                    </span>
                                                </BlurredValue>
                                                <GainLossIndicator
                                                    percentage={h.gain_loss_percentage}
                                                    amount={h.gain_loss_amount}
                                                    formatCurrencyOpts={portfolioFmtBase}
                                                />
                                            </div>
                                            <ChevronRight
                                                className="h-4 w-4 shrink-0 text-[var(--paper-line)] transition-colors duration-200 group-hover/holding:text-[var(--paper-muted)]"
                                                aria-hidden
                                            />
                                        </button>
                                        <div className="flex shrink-0 items-center pr-1">
                                            {showTargetAllocation && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(h)}
                                                    className={paperIconBtn}
                                                    aria-label={`Edit target for ${h.etf_name}`}
                                                    title="Edit Target %"
                                                >
                                                    <Edit2 className="h-4 w-4" aria-hidden />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleBuySell(h)}
                                                className={paperIconBtn}
                                                aria-label={`Buy or sell ${h.etf_name}`}
                                                title="Buy/Sell"
                                            >
                                                <TrendingUp className="h-4 w-4" aria-hidden />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteClick(h)}
                                                className={paperIconBtnDanger}
                                                aria-label={`Delete ${h.etf_name}`}
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {showTargetAllocation && Math.abs(totalTarget - 100) > 0.1 && (
                        <div
                            role="alert"
                            className="mt-4 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)]/50 px-3 py-3 text-sm text-[var(--paper-brick)]"
                        >
                            Target percentages sum to {totalTarget.toFixed(2)}% (should be 100%)
                        </div>
                    )}
                </PaperCard>
            )}

            {/* Transaction History */}
            <TransactionHistory
                refreshTrigger={transactionRefresh}
                portfolioId={portfolioId}
                currencyFormatOpts={portfolioFmtBase}
                transactionDeleteModalTitle={isTfsa ? 'Delete ETF Transaction' : 'Delete transaction'}
                onTransactionDeleted={() => {
                    fetchHoldings()
                    setTransactionRefresh(prev => prev + 1)
                }}
            />

            {/* Target vs actual allocation */}
            {showTargetAllocation && holdings.length > 0 && (
                <PaperCard className={`p-5 sm:p-6 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                    <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className={paperEyebrow}>Target vs actual</p>
                        <div className="flex items-center gap-4 text-xs text-[var(--paper-muted)]">
                            <span className="flex items-center gap-1.5">
                                <span className="h-2 w-4 shrink-0 rounded-full" style={{ backgroundColor: PAPER_CHART.khaki }} />
                                Target
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2 w-4 shrink-0 rounded-full" style={{ backgroundColor: PAPER_CHART.olive }} />
                                Actual
                            </span>
                        </div>
                    </div>
                    <div className={`mt-2 ${paperDivider}`}>
                        {targetVsActualData.map((etf) => (
                            <TargetActualRow
                                key={etf.name}
                                name={etf.name}
                                target={etf.target}
                                actual={etf.actual}
                                deviation={etf.deviation}
                                threshold={threshold}
                            />
                        ))}
                    </div>
                </PaperCard>
            )}

            {/* What If Calculator */}
            {showTargetAllocation && holdings.length > 0 && (
                <PaperCard className="p-5 sm:p-6">
                    <p className={paperEyebrow}>&ldquo;What if&rdquo; calculator</p>
                    <p className="mb-4 mt-2 text-sm text-[var(--paper-muted)]">
                        Split your investment according to your target allocation percentages
                    </p>

                    <div className="mb-6 flex items-center gap-4">
                        <label htmlFor="what-if-amount" className="text-sm font-medium text-[var(--paper-ink)]">If I invest:</label>
                        <BlurredValue as="div" className="flex items-center">
                            <span className="mr-1 font-mono text-sm text-[var(--paper-muted)]">
                                {portfolioCurrency === 'ZAR' ? 'R' : portfolioCurrency}
                            </span>
                            <input
                                id="what-if-amount"
                                type="number"
                                inputMode="decimal"
                                value={whatIfAmount}
                                onChange={(e) => setWhatIfAmount(e.target.value)}
                                placeholder="Enter amount"
                                className={`${paperField} w-40`}
                            />
                        </BlurredValue>
                    </div>

                    {(parseFloat(whatIfAmount) || 0) > 0 && whatIfDistribution.length > 0 ? (
                        <div className={paperDivider}>
                            {whatIfDistribution.map((item, i) => (
                                <AllocationRow
                                    key={i}
                                    label={item.etf}
                                    hint={`${item.targetPercentage.toFixed(1)}% of total`}
                                    amount={item.buyAmount}
                                    total={parseFloat(whatIfAmount) || 0}
                                    display={<BlurredValue>{fmtPortfolio(item.buyAmount)}</BlurredValue>}
                                    color={PAPER_CHART_COLORS[i % PAPER_CHART_COLORS.length]}
                                />
                            ))}
                            <div className="py-3 text-right text-sm text-[var(--paper-muted)]">
                                Total:{' '}
                                <BlurredValue>
                                    {fmtPortfolio(whatIfDistribution.reduce((sum, item) => sum + item.buyAmount, 0))}
                                </BlurredValue>
                            </div>
                        </div>
                    ) : (
                        <div className="py-6 text-center text-[var(--paper-muted)]">
                            <p>Enter an amount above to see how it should be split.</p>
                        </div>
                    )}
                </PaperCard>
            )}

            {/* Rebalancing & target mix */}
            {showTargetAllocation && rebalanceData && holdings.length > 0 && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <PaperCard className="p-5 sm:p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <p className={paperEyebrow}>Rebalancing plan</p>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--paper-muted)]">Threshold:</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={threshold}
                                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                    className={`${paperField} w-16 px-2 py-1`}
                                />
                                <span className="text-xs text-[var(--paper-muted)]">%</span>
                            </div>
                        </div>

                        {rebalanceData.actions && rebalanceData.actions.length > 0 ? (
                            <div className={paperDivider}>
                                {rebalanceData.actions.map((action, i) => (
                                    <div key={i} className="py-3 text-sm">
                                        <div className="mb-1 font-medium text-[var(--paper-ink)]">Step {action.action_num}</div>
                                        <div className="flex flex-col gap-1 text-[var(--paper-muted)] sm:hidden">
                                            <div>
                                                <span className="text-[var(--paper-muted)]">Sell:</span>{' '}
                                                <b className="text-[var(--paper-ink)]">{action.sell_etf}</b>
                                            </div>
                                            <div>
                                                <span className="text-[var(--paper-muted)]">Buy:</span>{' '}
                                                <b className="text-[var(--paper-ink)]">{action.buy_etf}</b>
                                            </div>
                                        </div>
                                        <div className="hidden items-center justify-between text-[var(--paper-muted)] sm:flex">
                                            <span>
                                                Sell <b className="text-[var(--paper-ink)]">{action.sell_etf}</b>
                                            </span>
                                            <span>→</span>
                                            <span>
                                                Buy <b className="text-[var(--paper-ink)]">{action.buy_etf}</b>
                                            </span>
                                        </div>
                                        <div className={`mt-1 text-right ${paperMoney} text-[var(--paper-ink)]`}>
                                            <BlurredValue>{fmtPortfolio(action.amount)}</BlurredValue>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-[var(--paper-muted)]">
                                Portfolio is balanced within {threshold}% threshold
                            </div>
                        )}
                    </PaperCard>

                    <PaperCard className="p-5 sm:p-6">
                        <p className={paperEyebrow}>Allocation overview</p>
                        <div className={`mt-4 ${paperDivider}`}>
                            {currentAllocationData.map((entry, index) => (
                                <AllocationRow
                                    key={index}
                                    label={entry.name}
                                    amount={entry.value}
                                    total={totalValue}
                                    display={<BlurredValue>{fmtPortfolio(entry.value)}</BlurredValue>}
                                    color={PAPER_CHART_COLORS[index % PAPER_CHART_COLORS.length]}
                                />
                            ))}
                        </div>
                    </PaperCard>
                </div>
            )}

            {!showTargetAllocation && holdings.length > 0 && (
                <PaperCard className={`p-5 sm:p-6 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                    <p className={paperEyebrow}>Holdings mix</p>
                    <div className={`mt-4 ${paperDivider}`}>
                        {currentAllocationData.map((entry, index) => (
                            <AllocationRow
                                key={index}
                                label={entry.name}
                                amount={entry.value}
                                total={totalValue}
                                display={<BlurredValue>{fmtPortfolio(entry.value)}</BlurredValue>}
                                color={PAPER_CHART_COLORS[index % PAPER_CHART_COLORS.length]}
                            />
                        ))}
                    </div>
                </PaperCard>
            )}

            {/* Modals */}
            <CSVUploadModal
                isOpen={showCSVModal}
                portfolioId={portfolioId}
                requireJsePrefix={isTfsa}
                etfOnlyMode={isTfsa}
                allocationOptional={!showTargetAllocation}
                onClose={() => setShowCSVModal(false)}
                onSuccess={() => {
                    fetchHoldings()
                    setShowCSVModal(false)
                }}
            />

            <AddETFModal
                isOpen={showAddETFModal}
                portfolioId={portfolioId}
                requireJsePrefix={isTfsa}
                etfOnlyMode={isTfsa}
                portfolioCurrencyCode={portfolioCurrency}
                allocationOptional={!showTargetAllocation}
                onClose={() => setShowAddETFModal(false)}
                onSuccess={() => {
                    fetchHoldings()
                }}
            />

            <BuySellModal
                isOpen={showBuySellModal}
                portfolioId={portfolioId}
                etfOnlyMode={isTfsa}
                portfolioCurrencyCode={portfolioCurrency}
                onClose={() => {
                    setShowBuySellModal(false)
                    setSelectedHolding(null)
                }}
                holding={selectedHolding}
                onSuccess={handleTransactionSuccess}
            />

            <EditHoldingModal
                isOpen={showEditModal}
                portfolioId={portfolioId}
                onClose={() => {
                    setShowEditModal(false)
                    setSelectedHolding(null)
                }}
                holding={selectedHolding}
                onSuccess={fetchHoldings}
            />

            {!isTfsa && portfolioId && (
                <section className="border-t border-[var(--paper-line)] pt-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <h2 className="text-sm font-medium text-[var(--paper-muted)]">
                                Remove from BudgetHQ
                            </h2>
                            <p className="mt-0.5 max-w-lg text-xs text-[var(--paper-muted)]">
                                Delete is only allowed when this Google Sheets account has no holdings.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setDeletePortfolioError('')
                                setShowDeletePortfolioConfirm(true)
                            }}
                            className="inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--paper-muted)] transition-colors duration-200 hover:bg-[var(--paper-brick)]/10 hover:text-[var(--paper-brick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20"
                        >
                            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                            Delete account
                        </button>
                    </div>
                </section>
            )}

            <ConfirmModal
                isOpen={showDeletePortfolioConfirm}
                onClose={() => {
                    if (deletingPortfolio) return
                    setShowDeletePortfolioConfirm(false)
                    setDeletePortfolioError('')
                }}
                onConfirm={handleDeletePortfolio}
                closeOnConfirm={false}
                title="Delete account"
                message={
                    <>
                        Delete &ldquo;{portfolioName}&rdquo;? This cannot be undone.
                        {deletePortfolioError && (
                            <span className="mt-3 block text-sm text-[var(--paper-brick)]">
                                {deletePortfolioError}
                            </span>
                        )}
                    </>
                }
                details={[
                    'This action cannot be undone.',
                    'Delete is only allowed when the account has no holdings.',
                ]}
                confirmText={deletingPortfolio ? 'Deleting…' : 'Delete'}
                cancelText="Cancel"
                variant="danger"
            />

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => {
                    setShowDeleteConfirm(false)
                    setHoldingToDelete(null)
                }}
                onConfirm={handleDeleteConfirm}
                title={isTfsa ? 'Delete ETF holding' : 'Delete holding'}
                message={holdingToDelete ? `Are you sure you want to delete ${holdingToDelete.etf_name}?` : ''}
                details={
                    isTfsa
                        ? ['Delete all associated transactions', 'Remove the ETF from Google Sheets']
                        : ['Delete all associated transactions', 'Remove the ticker from Google Sheets']
                }
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />

            <ConfirmModal
                isOpen={showLimitConfirm}
                onClose={closeLimitConfirm}
                onConfirm={handleLimitConfirmClick}
                closeOnConfirm={false}
                title="Contribution limit"
                message={limitConfirmMessage}
                confirmText="Continue"
                cancelText="Cancel"
                variant="warning"
            />

            <HoldingDetailsModal
                isOpen={showDetailsModal}
                portfolioId={portfolioId}
                currencyCode={portfolioCurrency}
                showTargetAllocation={showTargetAllocation}
                onClose={() => {
                    setShowDetailsModal(false)
                    setSelectedHolding(null)
                }}
                holding={selectedHolding}
                onHoldingUpdate={handleHoldingUpdate}
                totalPortfolioValue={totalValue}
                onEdit={showTargetAllocation ? handleEdit : undefined}
                onBuySell={handleBuySell}
                onDelete={handleDeleteClick}
            />

        </div>
    )
}
