import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Plus, Trash2, Calculator, TrendingUp, TrendingDown, PiggyBank, Upload, Edit2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

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
import HistoryDebugView from '../components/HistoryDebugView'

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
    const [selectedHolding, setSelectedHolding] = useState(null)
    const [holdingToDelete, setHoldingToDelete] = useState(null)

    // Sorting state
    const [sortColumn, setSortColumn] = useState(null)
    const [sortDirection, setSortDirection] = useState('asc') // 'asc' or 'desc'

    // TFSA Contribution Limits
    const TFSA_ANNUAL_LIMIT = 36000
    const TFSA_LIFETIME_LIMIT = 500000

    // SA Financial Year runs March to February
    const getSAFinancialYear = () => {
        const now = new Date()
        const month = now.getMonth()
        const year = now.getFullYear()
        if (month < 2) {
            return { start: year - 1, end: year }
        }
        return { start: year, end: year + 1 }
    }
    const financialYear = getSAFinancialYear()

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

    // Auto-save contributions
    const contributionFirstRender = useRef(true)
    useEffect(() => {
        if (contributionFirstRender.current) {
            contributionFirstRender.current = false
            return
        }
        if (loading) return

        const timer = setTimeout(() => {
            saveContributions()
        }, 1000)

        return () => clearTimeout(timer)
    }, [deposits, historicalContributions, loading])

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
            }
        } catch (err) {
            console.error("Failed to fetch contributions", err)
        }
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
                financial_year_start: financialYear.start
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
        if (!sortColumn) return holdings

        const sorted = [...holdings].sort((a, b) => {
            let aVal, bVal

            switch (sortColumn) {
                case 'name':
                    aVal = a.etf_name.toLowerCase()
                    bVal = b.etf_name.toLowerCase()
                    break
                case 'ticker':
                    aVal = a.jse_ticker ? a.jse_ticker.toLowerCase() : 'zzz' // Put bonds at end
                    bVal = b.jse_ticker ? b.jse_ticker.toLowerCase() : 'zzz'
                    break
                case 'region':
                    aVal = a.region.toLowerCase()
                    bVal = b.region.toLowerCase()
                    break
                case 'shares':
                    aVal = a.shares || 0
                    bVal = b.shares || 0
                    break
                case 'price':
                    aVal = a.current_price || 0
                    bVal = b.current_price || 0
                    break
                case 'value':
                    aVal = a.total_value || 0
                    bVal = b.total_value || 0
                    break
                case 'target':
                    aVal = a.target_percentage
                    bVal = b.target_percentage
                    break
                case 'actual':
                    aVal = totalValue > 0 ? ((a.total_value || 0) / totalValue) * 100 : 0
                    bVal = totalValue > 0 ? ((b.total_value || 0) / totalValue) * 100 : 0
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
        const amount = parseFloat(newDepositAmount)
        if (!amount || amount <= 0) return

        const newTotal = annualContributions + amount
        if (newTotal > TFSA_ANNUAL_LIMIT) {
            const exceed = newTotal - TFSA_ANNUAL_LIMIT
            if (!window.confirm(`This will exceed your annual limit by R${exceed.toLocaleString()}. Continue anyway?`)) {
                return
            }
        }

        const newDeposit = {
            id: Date.now(),
            amount: amount,
            date: newDepositDate
        }

        setDeposits([...deposits, newDeposit])
        setNewDepositAmount('')
        setNewDepositDate(new Date().toISOString().split('T')[0])
    }

    const removeDeposit = (id) => {
        setDeposits(deposits.filter(d => d.id !== id))
    }

    // Historical contribution management
    const addHistoricalContribution = () => {
        const fy = newHistoricalYear.trim()
        const amount = parseFloat(newHistoricalAmount)
        if (!fy || !amount || amount <= 0) return

        const existingForYear = historicalContributions
            .filter(h => h.financial_year === fy)
            .reduce((sum, h) => sum + h.amount, 0)
        const yearTotal = existingForYear + amount

        if (yearTotal > TFSA_ANNUAL_LIMIT) {
            const exceed = yearTotal - TFSA_ANNUAL_LIMIT
            if (!window.confirm(`FY ${fy} will exceed annual limit by R${exceed.toLocaleString()}. Continue anyway?`)) {
                return
            }
        }

        const newLifetimeTotal = historicalTotal + annualContributions + amount
        if (newLifetimeTotal > TFSA_LIFETIME_LIMIT) {
            const exceed = newLifetimeTotal - TFSA_LIFETIME_LIMIT
            if (!window.confirm(`This will exceed your lifetime limit by R${exceed.toLocaleString()}. Continue anyway?`)) {
                return
            }
        }

        const newHistorical = {
            id: Date.now(),
            financial_year: fy,
            amount: amount
        }

        setHistoricalContributions([...historicalContributions, newHistorical])
        setNewHistoricalYear('')
        setNewHistoricalAmount('')
    }

    const removeHistoricalContribution = (id) => {
        setHistoricalContributions(historicalContributions.filter(h => h.id !== id))
    }

    // Metrics
    const totalValue = holdings.reduce((sum, h) => sum + (h.total_value || 0), 0)
    const totalTarget = holdings.reduce((sum, h) => sum + h.target_percentage, 0)

    // TFSA Contribution calculations
    const annualContributions = deposits.reduce((sum, d) => sum + d.amount, 0)
    const contributionsRemaining = TFSA_ANNUAL_LIMIT - annualContributions
    const contributionPercentUsed = (annualContributions / TFSA_ANNUAL_LIMIT) * 100

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
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">📈 TFSA Portfolio</h1>
                <div className="flex flex-wrap items-center gap-3">
                    <PriceRefreshIndicator onRefresh={fetchHoldings} />
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowCSVModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Import CSV
                        </button>
                        <button
                            onClick={() => setShowAddETFModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add ETF
                        </button>
                        <button
                            onClick={() => setShowAddBondModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Bond
                        </button>
                    </div>
                </div>
            </div>

            {/* Portfolio Total Value & Performance */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 rounded-xl shadow-lg">
                <div className="grid md:grid-cols-3 gap-6">
                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">Portfolio Value</h2>
                        <p className="mt-2 text-4xl font-bold text-white">
                            R {totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-emerald-100 mt-1">{holdings.length} holding{holdings.length !== 1 ? 's' : ''} in portfolio</p>
                    </div>

                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">Total Invested</h2>
                        <p className="mt-2 text-3xl font-bold text-white">
                            R {totalLifetimeContributions.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-emerald-100 mt-1">Lifetime contributions</p>
                    </div>

                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">
                            {totalValue >= totalLifetimeContributions ? 'Profit' : 'Loss'}
                        </h2>
                        <p className={`mt-2 text-3xl font-bold ${totalValue >= totalLifetimeContributions ? 'text-white' : 'text-red-200'}`}>
                            {totalValue >= totalLifetimeContributions ? '+' : ''}R {(totalValue - totalLifetimeContributions).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <PiggyBank className="w-5 h-5 text-blue-500" />
                        TFSA Contributions (FY {financialYear.start}/{financialYear.end})
                    </h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {isSaving ? 'Saving...' : 'Auto-saved'}
                    </span>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Annual Contributions */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Annual Limit</h3>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">R {TFSA_ANNUAL_LIMIT.toLocaleString()}</span>
                        </div>

                        <div className="flex gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <div className="flex items-center flex-1">
                                <span className="mr-1 text-gray-500 dark:text-gray-400 text-sm">R</span>
                                <input
                                    type="number"
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
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-blue-700 dark:text-blue-400">
                                                R {deposit.amount.toLocaleString()}
                                            </span>
                                            <span className="text-gray-500 dark:text-gray-400 text-xs">
                                                {new Date(deposit.date).toLocaleDateString('en-ZA')}
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
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-600 dark:text-gray-400">R {annualContributions.toLocaleString()}</span>
                                <span className={`font-medium ${contributionsRemaining < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    R {contributionsRemaining.toLocaleString()} left
                                </span>
                            </div>
                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${contributionPercentUsed >= 100 ? 'bg-red-500' :
                                            contributionPercentUsed >= 80 ? 'bg-yellow-500' :
                                                'bg-gradient-to-r from-blue-500 to-cyan-500'
                                        }`}
                                    style={{ width: `${Math.min(contributionPercentUsed, 100)}%` }}
                                />
                            </div>
                            <div className="text-center mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {contributionPercentUsed.toFixed(1)}% used
                            </div>
                        </div>
                    </div>

                    {/* Lifetime Contributions */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lifetime Limit</h3>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">R {TFSA_LIFETIME_LIMIT.toLocaleString()}</span>
                        </div>

                        <div className="flex gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
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
                                            <span className="font-medium text-gray-900 dark:text-white">R {hist.amount.toLocaleString()}</span>
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
                                    R {totalLifetimeContributions.toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    Total (R {historicalTotal.toLocaleString()} + R {annualContributions.toLocaleString()})
                                </p>
                            </div>

                            <div>
                                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${lifetimePercentUsed >= 100 ? 'bg-red-500' :
                                                lifetimePercentUsed >= 80 ? 'bg-yellow-500' :
                                                    'bg-gradient-to-r from-purple-500 to-indigo-500'
                                            }`}
                                        style={{ width: `${Math.min(lifetimePercentUsed, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600 dark:text-gray-400">{lifetimePercentUsed.toFixed(1)}% used</span>
                                    <span className={`font-medium ${lifetimeRemaining < 0 ? 'text-red-500' : 'text-purple-600 dark:text-purple-400'}`}>
                                        R {lifetimeRemaining.toLocaleString()} left
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Holdings Table */}
            {holdings.length > 0 && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                    <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Holdings</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full">
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
                                        onClick={() => handleSort('ticker')}
                                        className="text-left py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-1">
                                            Ticker
                                            <SortIcon column="ticker" />
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort('region')}
                                        className="text-left py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-1">
                                            Region
                                            <SortIcon column="region" />
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort('shares')}
                                        className="text-right py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Shares
                                            <SortIcon column="shares" />
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort('price')}
                                        className="text-right py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Price
                                            <SortIcon column="price" />
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
                                        onClick={() => handleSort('target')}
                                        className="text-right py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Target %
                                            <SortIcon column="target" />
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort('actual')}
                                        className="text-right py-3 px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            Actual %
                                            <SortIcon column="actual" />
                                        </div>
                                    </th>
                                    <th className="text-center py-3 px-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {getSortedHoldings().map((h) => {
                                    const actualPct = totalValue > 0 ? ((h.total_value || 0) / totalValue) * 100 : 0
                                    const deviation = actualPct - h.target_percentage

                                    return (
                                        <tr key={`${h.type}-${h.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="py-3 px-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-medium text-gray-900 dark:text-white">{h.etf_name}</div>
                                                    {h.type === 'BOND' && (
                                                        <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                                                            BOND
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-2 font-mono text-sm text-gray-600 dark:text-gray-400">
                                                {h.jse_ticker || '—'}
                                            </td>
                                            <td className="py-3 px-2 text-sm text-gray-600 dark:text-gray-400">
                                                {h.region}
                                            </td>
                                            <td className="py-3 px-2 text-right font-medium text-gray-900 dark:text-white">
                                                {h.type === 'BOND' ? '—' : h.shares.toFixed(4)}
                                            </td>
                                            <td className="py-3 px-2 text-right text-gray-600 dark:text-gray-400">
                                                {h.type === 'BOND' ? '—' : (h.current_price ? `R ${h.current_price.toFixed(2)}` : '—')}
                                            </td>
                                            <td className="py-3 px-2 text-right font-semibold text-gray-900 dark:text-white">
                                                R {(h.total_value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td
                                                onClick={() => handleEdit(h)}
                                                className="py-3 px-2 text-right text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
                                                title="Click to edit target percentage"
                                            >
                                                <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400 font-medium">
                                                    {h.target_percentage.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="py-3 px-2 text-right">
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${Math.abs(deviation) <= threshold
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                        : deviation > 0
                                                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                    }`}>
                                                    {actualPct.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="py-3 px-2">
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
                <div className="bg-white dark:bg-gray-800 p-12 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <div className="text-6xl mb-4">📊</div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Holdings Yet</h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">
                        Get started by importing a CSV file, adding ETFs, or adding government bonds.
                    </p>
                    <div className="flex justify-center gap-3">
                        <button
                            onClick={() => setShowCSVModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Import CSV
                        </button>
                        <button
                            onClick={() => setShowAddETFModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add ETF
                        </button>
                        <button
                            onClick={() => setShowAddBondModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Bond
                        </button>
                    </div>
                </div>
            )}

            {/* Transaction History */}
            <TransactionHistory refreshTrigger={transactionRefresh} />

            {/* Target vs Actual Bar Chart */}
            {holdings.length > 0 && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                    <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Target vs Actual Allocation</h2>
                    <div style={{ height: Math.max(300, holdings.length * 80) }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={targetVsActualData} layout="vertical" margin={{ left: 20, right: 30, top: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis type="number" domain={[0, 'dataMax']} unit="%" tick={{ fill: '#9ca3af' }} />
                                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={120} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                    formatter={(value, name) => [`${value}%`, name === 'Target' ? 'Target' : 'Actual']}
                                />
                                <Legend wrapperStyle={{ color: '#9ca3af' }} />
                                <Bar dataKey="target" name="Target" fill="#6366f1" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[0, 4, 4, 0]} />
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
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
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
                                            R {item.buyAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {item.targetPercentage.toFixed(1)}% of total
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm text-gray-600 dark:text-gray-400">
                                💡 Total: R {whatIfDistribution.reduce((sum, item) => sum + item.buyAmount, 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Rebalancing Plan</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Threshold:</span>
                                <input
                                    type="number"
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
                                        <div className="flex justify-between items-center text-blue-800 dark:text-blue-200">
                                            <span>Sell <b>{action.sell_etf}</b></span>
                                            <span>→</span>
                                            <span>Buy <b>{action.buy_etf}</b></span>
                                        </div>
                                        <div className="mt-1 text-right font-semibold text-blue-700 dark:text-blue-400">
                                            R {action.amount.toFixed(2)}
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

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Allocation Overview</h2>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={currentAllocationData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {currentAllocationData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value) => `R ${value.toFixed(2)}`}
                                        contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                        itemStyle={{ color: '#f3f4f6' }}
                                    />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ paddingLeft: "20px", color: '#9ca3af' }} />
                                </PieChart>
                            </ResponsiveContainer>
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
                message={holdingToDelete ? `Are you sure you want to delete ${holdingToDelete.etf_name}?` : ''}
                details={
                    holdingToDelete?.type === 'BOND'
                        ? ['Delete all associated transactions']
                        : ['Delete all associated transactions', 'Remove the ETF from Google Sheets']
                }
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />

            {/* Debug & History View */}
            <HistoryDebugView />
        </div>
    )
}
