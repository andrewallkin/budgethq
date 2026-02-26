import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Plus, Trash2, Calculator, TrendingUp, TrendingDown, PiggyBank, Upload, Edit2, ArrowUpDown, ArrowUp, ArrowDown, Layers } from 'lucide-react'

// Import new components
import CSVUploadModal from '../components/CSVUploadModal'
import AddETFModal from '../components/AddETFModal'
import AddBondModal from '../components/AddBondModal'
import BuySellModal from '../components/BuySellModal'
import EditHoldingModal from '../components/EditHoldingModal'
import TransactionHistory from '../components/TransactionHistory'
import PriceRefreshIndicator from '../components/PriceRefreshIndicator'
import ConfirmModal from '../components/ConfirmModal'
import PortfolioChart from '../components/PortfolioChart'
import GainLossIndicator from '../components/GainLossIndicator'
import HoldingDetailsModal from '../components/HoldingDetailsModal'
import { formatCurrency, formatNumber, formatDateSafe } from '../utils/numberFormatting'


export default function TFSAPortfolio() {
    const [loading, setLoading] = useState(true)
    const [holdings, setHoldings] = useState([])
    const [threshold, setThreshold] = useState(5.0)
    const [rebalanceData, setRebalanceData] = useState(null)
    const [isSaving, setIsSaving] = useState(false)
    const [transactionRefresh, setTransactionRefresh] = useState(0)

    // Modal states
    const [showCSVModal, setShowCSVModal] = useState(false)
    const [showAddETFModal, setShowAddETFModal] = useState(false)
    const [showAddBondModal, setShowAddBondModal] = useState(false)
    const [showBuySellModal, setShowBuySellModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showDetailsModal, setShowDetailsModal] = useState(false)
    const [selectedHolding, setSelectedHolding] = useState(null)
    const [holdingToDelete, setHoldingToDelete] = useState(null)

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

    useEffect(() => {
        fetchHoldings()
        fetchContributions()
    }, [])

    useEffect(() => {
        if (holdings.length > 0) {
            calculateRebalance()
        }
    }, [holdings, threshold])

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
            // Fetch both ETFs and Bonds in parallel
            const [etfRes, bondRes] = await Promise.all([
                axios.get('/api/etf/holdings'),
                axios.get('/api/bond/holdings')
            ])

            // Combine ETFs and Bonds with type indicator
            const etfs = (etfRes.data || []).map(etf => ({
                ...etf,
                type: 'ETF',
                total_value: etf.total_value || 0
            }))

            const bonds = (bondRes.data || []).map(bond => ({
                ...bond,
                type: 'BOND',
                // For bonds, use current_value as total_value for consistency
                total_value: bond.current_value || 0,
                // Add placeholder fields for compatibility
                jse_ticker: null,
                etf_name: bond.bond_name,
                shares: null,
                current_price: null
            }))

            setHoldings([...etfs, ...bonds])
        } catch (err) {
            console.error("Failed to fetch holdings", err)
        } finally {
            setLoading(false)
        }
    }

    const fetchContributions = async () => {
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
        setHoldingToDelete(holding)
        setShowDeleteConfirm(true)
    }

    const handleDeleteConfirm = async () => {
        if (!holdingToDelete) return

        try {
            if (holdingToDelete.type === 'BOND') {
                await axios.delete(`/api/bond/holdings/${holdingToDelete.id}`)
            } else {
                await axios.delete(`/api/etf/holdings/${holdingToDelete.id}?delete_from_sheet=true`)
            }
            setHoldings(holdings.filter(h => h.id !== holdingToDelete.id))
            setTransactionRefresh(prev => prev + 1)
        } catch (err) {
            console.error("Failed to delete holding", err)
            alert(err.response?.data?.detail || 'Failed to delete holding')
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
        // Filter out zero holdings for table display, but include ETFs with non-zero target percentage
        const activeHoldings = holdings.filter(h => {
            if (h.type === 'BOND') {
                return (h.current_value || 0) > 0
            } else {
                // Show ETFs if they have shares > 0 OR have a target percentage > 0
                return (h.shares || 0) > 0 || (h.target_percentage || 0) > 0
            }
        })

        if (!sortColumn) return activeHoldings

        const sorted = [...activeHoldings].sort((a, b) => {
            let aVal, bVal

            switch (sortColumn) {
                case 'name':
                    aVal = (a.type === 'ETF' ? a.etf_name : a.bond_name).toLowerCase()
                    bVal = (b.type === 'ETF' ? b.etf_name : b.bond_name).toLowerCase()
                    break
                case 'value':
                    aVal = a.type === 'ETF' ? (a.total_value || 0) : (a.current_value || 0)
                    bVal = b.type === 'ETF' ? (b.total_value || 0) : (b.current_value || 0)
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

    // Deposit management
    const addDeposit = () => {
        const amount = parseFloat(String(newDepositAmount).replace(/,/g, ''))
        if (!amount || amount <= 0) return

        const newTotal = annualContributions + amount
        if (newTotal > tfsaAnnualLimit) {
            const exceed = newTotal - tfsaAnnualLimit
            if (
                !window.confirm(
                    `This will exceed your annual limit by ${formatCurrency(exceed, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}. Continue anyway?`
                )
            ) {
                return
            }
        }

        const newDeposit = {
            id: Date.now(),
            amount: amount,
            date: newDepositDate
        }

        setHasUserEditedContributions(true)
        setDeposits([...deposits, newDeposit])
        setNewDepositAmount('')
        setNewDepositDate(new Date().toISOString().split('T')[0])
    }

    const removeDeposit = (id) => {
        setHasUserEditedContributions(true)
        setDeposits(deposits.filter(d => d.id !== id))
    }

    // Historical contribution management
    const addHistoricalContribution = () => {
        const fy = newHistoricalYear.trim()
        const amount = parseFloat(String(newHistoricalAmount).replace(/,/g, ''))
        if (!fy || !amount || amount <= 0) return

        const existingForYear = historicalContributions
            .filter(h => h.financial_year === fy)
            .reduce((sum, h) => sum + h.amount, 0)
        const yearTotal = existingForYear + amount

        if (yearTotal > tfsaAnnualLimit) {
            const exceed = yearTotal - tfsaAnnualLimit
            if (
                !window.confirm(
                    `FY ${fy} will exceed annual limit by ${formatCurrency(exceed, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}. Continue anyway?`
                )
            ) {
                return
            }
        }

        const newLifetimeTotal = historicalTotal + annualContributions + amount
        if (newLifetimeTotal > TFSA_LIFETIME_LIMIT) {
            const exceed = newLifetimeTotal - TFSA_LIFETIME_LIMIT
            if (
                !window.confirm(
                    `This will exceed your lifetime limit by ${formatCurrency(exceed, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}. Continue anyway?`
                )
            ) {
                return
            }
        }

        const newHistorical = {
            id: Date.now(),
            financial_year: fy,
            amount: amount
        }

        setHasUserEditedContributions(true)
        setHistoricalContributions([...historicalContributions, newHistorical])
        setNewHistoricalYear('')
        setNewHistoricalAmount('')
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

    const COLORS = [
        '#C62828', '#2E7D32', '#1565C0', '#F9A825', '#6A1B9A',
        '#EF6C00', '#00838F', '#AD1457', '#4E342E', '#455A64',
        '#9E9D24', '#283593', '#00695C'
    ]

    if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>

    return (
        <div className="space-y-6 sm:space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">📈 TFSA Portfolio</h1>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <PriceRefreshIndicator onRefresh={fetchHoldings} />
                    <div className="flex flex-row gap-2 sm:gap-3 flex-1 sm:flex-initial">
                        <button
                            onClick={() => setShowCSVModal(true)}
                            className="flex-1 min-w-0 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <Upload className="w-4 h-4 shrink-0" />
                            <span className="truncate">Import CSV</span>
                        </button>
                        <button
                            onClick={() => setShowAddETFModal(true)}
                            className="flex-1 min-w-0 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-4 h-4 shrink-0" />
                            <span className="truncate">Add ETF</span>
                        </button>
                        <button
                            onClick={() => setShowAddBondModal(true)}
                            className="flex-1 min-w-0 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <Plus className="w-4 h-4 shrink-0" />
                            <span className="truncate">Add Bond</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Portfolio Total Value & Performance */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 sm:p-6 rounded-xl shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">Portfolio Value</h2>
                        <p className="mt-2 text-4xl font-bold text-white">
                            {formatCurrency(totalValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-emerald-100 mt-1">{holdings.length} holding{holdings.length !== 1 ? 's' : ''} in portfolio</p>
                    </div>

                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">Total Invested</h2>
                        <p className="mt-2 text-3xl font-bold text-white">
                            {formatCurrency(totalLifetimeContributions, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-emerald-100 mt-1">Lifetime contributions</p>
                    </div>

                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">
                            {totalValue >= totalLifetimeContributions ? 'Profit' : 'Loss'}
                        </h2>
                        <p className={`mt-2 text-3xl font-bold ${totalValue >= totalLifetimeContributions ? 'text-white' : 'text-red-200'}`}>
                            {formatCurrency(totalValue - totalLifetimeContributions, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' })}
                        </p>
                        <p className={`text-sm mt-1 font-medium ${totalValue >= totalLifetimeContributions ? 'text-emerald-100' : 'text-red-200'}`}>
                            {totalLifetimeContributions > 0
                                ? `${totalValue >= totalLifetimeContributions ? '+' : ''}${(((totalValue - totalLifetimeContributions) / totalLifetimeContributions) * 100).toFixed(2)}%`
                                : '—'
                            } return
                        </p>
                    </div>
                </div>
            </div>

            {/* Portfolio Performance Chart */}
            <PortfolioChart />

            {/* TFSA Contribution Tracking */}
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <PiggyBank className="w-5 h-5 text-blue-500" />
                        TFSA Contributions{financialYearLabel ? ` (FY ${financialYearLabel})` : ''}
                    </h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {isSaving ? 'Saving...' : 'Auto-saved'}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Annual Contributions */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Annual Limit</h3>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                {formatCurrency(tfsaAnnualLimit, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <div className="flex items-center flex-1">
                                <span className="mr-1 text-gray-500 dark:text-gray-400 text-sm">R</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={newDepositAmount}
                                    onChange={(e) => setNewDepositAmount(e.target.value)}
                                    placeholder="Amount"
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <input
                                type="date"
                                value={newDepositDate}
                                onChange={(e) => setNewDepositDate(e.target.value)}
                                className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <button
                                onClick={addDeposit}
                                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Add
                            </button>
                        </div>

                        {deposits.length > 0 && (
                            <div className="space-y-1.5">
                                {deposits.sort((a, b) => new Date(a.date) - new Date(b.date)).map((deposit) => (
                                    <div key={deposit.id} className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <span className="font-medium text-blue-700 dark:text-blue-400 shrink-0">
                                                {formatCurrency(deposit.amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </span>
                                            <span className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap shrink-0">
                                                {formatDateSafe(deposit.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => removeDeposit(deposit.id)}
                                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600 dark:text-gray-400">
                                    {formatCurrency(annualContributions, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                                <span className={`font-bold ${contributionsRemaining < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {formatCurrency(contributionsRemaining, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} left
                                </span>
                            </div>
                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${contributionPercentUsed >= 100 ? 'bg-red-500' :
                                        contributionPercentUsed >= 80 ? 'bg-yellow-500' :
                                            'bg-gradient-to-r from-blue-500 to-cyan-500'
                                        }`}
                                    style={{ width: `${Math.min(contributionPercentUsed, 100)}%` }}
                                />
                            </div>
                            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                                {formatNumber(contributionPercentUsed, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% used
                            </div>
                        </div>
                    </div>

                    {/* Lifetime Contributions */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lifetime Limit</h3>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                {formatCurrency(TFSA_LIFETIME_LIMIT, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <input
                                type="text"
                                value={newHistoricalYear}
                                onChange={(e) => setNewHistoricalYear(e.target.value)}
                                placeholder="2018/19"
                                className="w-24 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <div className="flex items-center flex-1">
                                <span className="mr-1 text-gray-500 dark:text-gray-400 text-sm">R</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={newHistoricalAmount}
                                    onChange={(e) => setNewHistoricalAmount(e.target.value)}
                                    placeholder="Amount"
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <button
                                onClick={addHistoricalContribution}
                                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" /> Add
                            </button>
                        </div>

                        {historicalContributions.length > 0 && (
                            <div className="space-y-1.5">
                                {historicalContributions.sort((a, b) => a.financial_year.localeCompare(b.financial_year)).map((hist) => (
                                    <div key={hist.id} className="flex items-center justify-between p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-purple-700 dark:text-purple-400">FY {hist.financial_year}</span>
                                            <span className="text-gray-500 dark:text-gray-400 text-xs">→</span>
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                {formatCurrency(hist.amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => removeHistoricalContribution(hist.id)}
                                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg">
                            <div className="text-center mb-3">
                                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                                    {formatCurrency(totalLifetimeContributions, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    Total ({formatCurrency(historicalTotal, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} + {formatCurrency(annualContributions, { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                                </p>
                            </div>

                            <div>
                                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${lifetimePercentUsed >= 100 ? 'bg-red-500' :
                                            lifetimePercentUsed >= 80 ? 'bg-yellow-500' :
                                                'bg-gradient-to-r from-purple-500 to-indigo-500'
                                            }`}
                                        style={{ width: `${Math.min(lifetimePercentUsed, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-baseline gap-2 text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">
                                        {formatNumber(lifetimePercentUsed, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% used
                                    </span>
                                    <span className={`font-bold ${lifetimeRemaining < 0 ? 'text-red-500' : 'text-purple-600 dark:text-purple-400'}`}>
                                        {formatCurrency(lifetimeRemaining, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} left
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Holdings Table */}
            {holdings.length > 0 && (
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 transition-colors">
                    <h2 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white flex items-center gap-2">
                        <Layers className="w-5 h-5 text-blue-500" />
                        Holdings
                    </h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 sm:hidden">Swipe horizontally to see all columns</p>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-max">
                            <thead>
                                <tr className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                                    <th
                                        onClick={() => handleSort('name')}
                                        className="text-left py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-1">
                                            Name
                                            <SortIcon column="name" />
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort('value')}
                                        className="text-right py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Value
                                            <SortIcon column="value" />
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort('gain_loss')}
                                        className="text-center py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-center gap-1">
                                            Gain/Loss
                                            <SortIcon column="gain_loss" />
                                        </div>
                                    </th>
                                    <th className="text-center py-3 px-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {getSortedHoldings().map((h) => {
                                    return (
                                        <tr
                                            key={`${h.type}-${h.id}`}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                            onClick={(e) => {
                                                if (e.target.closest('button')) return
                                                setSelectedHolding(h)
                                                setShowDetailsModal(true)
                                            }}
                                        >
                                            <td className="py-3 px-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-medium text-gray-900 dark:text-white truncate">
                                                        {h.type === 'ETF' ? h.etf_name : h.bond_name}
                                                    </div>
                                                    {h.type === 'BOND' && (
                                                        <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded shrink-0">
                                                            BOND
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 text-right font-semibold text-gray-900 dark:text-white">
                                                {formatCurrency(h.type === 'ETF' ? h.total_value : h.current_value || 0, {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </td>
                                            <td className="py-3 px-2 text-center">
                                                <GainLossIndicator
                                                    percentage={h.gain_loss_percentage}
                                                    amount={h.gain_loss_amount}
                                                />
                                            </td>
                                            <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => handleEdit(h)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                                        title="Edit Target %"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleBuySell(h)}
                                                        className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
                                                        title="Buy/Sell"
                                                    >
                                                        <TrendingUp className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClick(h)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {Math.abs(totalTarget - 100) > 0.1 && (
                        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm">
                            ⚠️ Target percentages sum to {totalTarget.toFixed(2)}% (should be 100%)
                        </div>
                    )}
                </div>
            )}

            {holdings.length === 0 && (
                <div className="bg-white dark:bg-gray-800 p-12 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 text-center">
                    <div className="text-6xl mb-4">📊</div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Holdings Yet</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">
                        Get started by importing a CSV file, adding ETFs, or adding government bonds.
                    </p>
                    <div className="flex flex-row gap-2 sm:gap-3 flex-wrap justify-center">
                        <button
                            onClick={() => setShowCSVModal(true)}
                            className="flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <Upload className="w-4 h-4 shrink-0" />
                            Import CSV
                        </button>
                        <button
                            onClick={() => setShowAddETFModal(true)}
                            className="flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-4 h-4 shrink-0" />
                            Add ETF
                        </button>
                        <button
                            onClick={() => setShowAddBondModal(true)}
                            className="flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <Plus className="w-4 h-4 shrink-0" />
                            Add Bond
                        </button>
                    </div>
                </div>
            )}

            {/* Transaction History */}
            <TransactionHistory
                refreshTrigger={transactionRefresh}
                onTransactionDeleted={() => {
                    fetchHoldings()
                    setTransactionRefresh(prev => prev + 1)
                }}
            />

            {/* Target vs Actual Bar Chart */}
            {holdings.length > 0 && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 transition-colors">
                    <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Target vs Actual Allocation</h2>
                    <div className="flex justify-center gap-6 mb-3 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: '#6366f1' }} />
                            Target
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: '#10b981' }} />
                            Actual
                        </span>
                    </div>
                    <div style={{ height: Math.max(300, holdings.length * 60) }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={targetVsActualData} layout="horizontal" margin={{ left: 10, right: 20, top: 30, bottom: 80 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-45} textAnchor="end" height={60} interval={0} />
                                <YAxis type="number" domain={[0, 'dataMax']} unit="%" tick={{ fill: '#9ca3af', fontSize: 12 }} width={40} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                    formatter={(value, name) => [`${value}%`, name === 'Target' ? 'Target' : 'Actual']}
                                />
                                <Bar dataKey="target" name="Target" fill="#6366f1" radius={[0, 0, 4, 4]} />
                                <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[0, 0, 4, 4]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {targetVsActualData.map((etf, i) => (
                            <div
                                key={i}
                                className={`px-3 py-1 rounded-full text-xs font-medium ${Math.abs(etf.deviation) <= threshold
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : etf.deviation > 0
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    }`}
                            >
                                {etf.name}: {etf.deviation > 0 ? '+' : ''}{etf.deviation}%
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* What If Calculator */}
            {holdings.length > 0 && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 transition-colors">
                    <div className="flex items-center gap-2 mb-4">
                        <Calculator className="w-5 h-5 text-purple-500" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">"What If" Calculator</h2>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Split your investment according to your target allocation percentages
                    </p>

                    <div className="flex items-center gap-4 mb-6">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">If I invest:</label>
                        <div className="flex items-center">
                            <span className="mr-1 text-gray-500 dark:text-gray-400">R</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={whatIfAmount}
                                onChange={(e) => setWhatIfAmount(e.target.value)}
                                placeholder="Enter amount"
                                className="w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    {(parseFloat(whatIfAmount) || 0) > 0 && whatIfDistribution.length > 0 ? (
                        <div className="space-y-3">
                            {whatIfDistribution.map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold">
                                            {i + 1}
                                        </div>
                                        <span className="font-medium text-gray-900 dark:text-white">{item.etf}</span>
                                    </div>
                                    <div className="text-right">
                                <div className="font-semibold text-purple-700 dark:text-purple-400">
                                    {formatCurrency(item.buyAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {item.targetPercentage.toFixed(1)}% of total
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                                💡 Total: {formatCurrency(whatIfDistribution.reduce((sum, item) => sum + item.buyAmount, 0), {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                            <p>Enter an amount above to see how it should be split.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Rebalancing */}
            {rebalanceData && holdings.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 transition-colors">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Rebalancing Plan</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Threshold:</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={threshold}
                                    onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                    className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
                            </div>
                        </div>

                        {rebalanceData.actions && rebalanceData.actions.length > 0 ? (
                            <div className="space-y-3">
                                {rebalanceData.actions.map((action, i) => (
                                    <div key={i} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm transition-colors">
                                        <div className="font-medium text-blue-900 dark:text-blue-300 mb-1">Step {action.action_num}</div>
                                        <div className="sm:hidden flex flex-col gap-1 text-blue-800 dark:text-blue-200">
                                            <div><span className="text-blue-600 dark:text-blue-400">Sell:</span> <b>{action.sell_etf}</b></div>
                                            <div><span className="text-blue-600 dark:text-blue-400">Buy:</span> <b>{action.buy_etf}</b></div>
                                        </div>
                                        <div className="hidden sm:flex justify-between items-center text-blue-800 dark:text-blue-200">
                                            <span>Sell <b>{action.sell_etf}</b></span>
                                            <span>→</span>
                                            <span>Buy <b>{action.buy_etf}</b></span>
                                        </div>
                                        <div className="mt-1 text-right font-semibold text-blue-700 dark:text-blue-400">
                                            {formatCurrency(action.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <div className="mb-2">✅</div>
                                Portfolio is balanced within {threshold}% threshold
                            </div>
                        )}
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600 transition-colors">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Allocation Overview</h2>
                        <div className="min-h-[280px] sm:h-64">
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={currentAllocationData}
                                        cx="50%"
                                        cy="40%"
                                        innerRadius={50}
                                        outerRadius={70}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {currentAllocationData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value) =>
                                            formatCurrency(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        }
                                        contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                        itemStyle={{ color: '#f3f4f6' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 flex-wrap">
                            {currentAllocationData.map((entry, index) => (
                                <div key={index} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <div
                                        className="w-3 h-3 rounded-full shrink-0"
                                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                    />
                                    <span className="truncate" title={entry.name}>{entry.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <CSVUploadModal
                isOpen={showCSVModal}
                onClose={() => setShowCSVModal(false)}
                onSuccess={() => {
                    fetchHoldings()
                    setShowCSVModal(false)
                }}
            />

            <AddETFModal
                isOpen={showAddETFModal}
                onClose={() => setShowAddETFModal(false)}
                onSuccess={() => {
                    fetchHoldings()
                }}
            />

            <AddBondModal
                isOpen={showAddBondModal}
                onClose={() => setShowAddBondModal(false)}
                onSuccess={() => {
                    fetchHoldings()
                }}
            />

            <BuySellModal
                isOpen={showBuySellModal}
                onClose={() => {
                    setShowBuySellModal(false)
                    setSelectedHolding(null)
                }}
                holding={selectedHolding}
                onSuccess={handleTransactionSuccess}
            />

            <EditHoldingModal
                isOpen={showEditModal}
                onClose={() => {
                    setShowEditModal(false)
                    setSelectedHolding(null)
                }}
                holding={selectedHolding}
                onSuccess={fetchHoldings}
            />

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => {
                    setShowDeleteConfirm(false)
                    setHoldingToDelete(null)
                }}
                onConfirm={handleDeleteConfirm}
                title={`Delete ${holdingToDelete?.type === 'BOND' ? 'Bond' : 'ETF'} Holding`}
                message={holdingToDelete ? `Are you sure you want to delete ${holdingToDelete.type === 'ETF' ? holdingToDelete.etf_name : holdingToDelete.bond_name}?` : ''}
                details={
                    holdingToDelete?.type === 'BOND'
                        ? ['Delete all associated transactions']
                        : ['Delete all associated transactions', 'Remove the ETF from Google Sheets']
                }
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />

            <HoldingDetailsModal
                isOpen={showDetailsModal}
                onClose={() => {
                    setShowDetailsModal(false)
                    setSelectedHolding(null)
                }}
                holding={selectedHolding}
                onHoldingUpdate={handleHoldingUpdate}
                totalPortfolioValue={totalValue}
                onEdit={handleEdit}
                onBuySell={handleBuySell}
                onDelete={handleDeleteClick}
            />

        </div>
    )
}
