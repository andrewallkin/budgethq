import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Plus, Trash2, RefreshCw, Calculator, TrendingUp, PiggyBank } from 'lucide-react'

export default function TFSAPortfolio() {
    const [loading, setLoading] = useState(true)
    const [etfs, setEtfs] = useState([])
    const [threshold, setThreshold] = useState(5.0)
    const [rebalanceData, setRebalanceData] = useState(null)

    const [isSaving, setIsSaving] = useState(false)
    const firstRender = useRef(true)

    // TFSA Contribution Limits
    const TFSA_ANNUAL_LIMIT = 36000
    const TFSA_LIFETIME_LIMIT = 500000

    // SA Financial Year runs March to February
    const getSAFinancialYear = () => {
        const now = new Date()
        const month = now.getMonth() // 0-indexed (0 = Jan, 2 = March)
        const year = now.getFullYear()
        // If we're in Jan or Feb, we're still in the previous year's financial year
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

    // What If Calculator - use empty string for better UX
    const [whatIfAmount, setWhatIfAmount] = useState('')

    // New ETF form state
    const [newEtf, setNewEtf] = useState({
        ETF: '',
        Region: '',
        Target_Percentage: 0,
        Current_Value: 0
    })

    useEffect(() => {
        fetchPortfolio()
        fetchContributions()
    }, [])

    useEffect(() => {
        if (etfs.length > 0) {
            calculateRebalance()
        }
    }, [etfs, threshold])

    // Auto-save ETFs
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false
            return
        }
        if (loading) return

        const timer = setTimeout(() => {
            savePortfolio()
        }, 1000)

        return () => clearTimeout(timer)
    }, [etfs, loading])

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

    const fetchPortfolio = async () => {
        try {
            const res = await axios.get('/api/portfolio')
            setEtfs(res.data || [])
        } catch (err) {
            console.error("Failed to fetch portfolio", err)
        } finally {
            setLoading(false)
        }
    }

    const fetchContributions = async () => {
        try {
            const res = await axios.get('/api/tfsa/contributions')
            if (res.data) {
                // Load historical contributions by financial year
                const loadedHistorical = (res.data.historical_contributions || []).map(h => ({
                    id: h.id,
                    financial_year: h.financial_year,
                    amount: h.amount
                }))
                setHistoricalContributions(loadedHistorical)

                // Convert deposits from API format to local format
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
        try {
            const res = await axios.post('/api/calculate/rebalance', {
                etfs,
                threshold
            })
            setRebalanceData(res.data)
        } catch (err) {
            console.error("Failed to calculate rebalance", err)
        }
    }

    const savePortfolio = async () => {
        setIsSaving(true)
        try {
            await axios.post('/api/portfolio', etfs)
        } catch (err) {
            console.error("Failed to save portfolio", err)
        } finally {
            setIsSaving(false)
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

    const addEtf = () => {
        if (!newEtf.ETF || !newEtf.Region) return
        setEtfs([...etfs, { ...newEtf }])
        setNewEtf({ ETF: '', Region: '', Target_Percentage: 0, Current_Value: 0 })
    }

    const removeEtf = (index) => {
        setEtfs(etfs.filter((_, i) => i !== index))
    }

    const updateEtf = (index, field, value) => {
        const newEtfs = [...etfs]
        newEtfs[index][field] = field === 'ETF' || field === 'Region' ? value : parseFloat(value) || 0
        setEtfs(newEtfs)
    }

    // Deposit management
    const addDeposit = () => {
        const amount = parseFloat(newDepositAmount)
        if (!amount || amount <= 0) return

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
        const financialYear = newHistoricalYear.trim()
        const amount = parseFloat(newHistoricalAmount)
        if (!financialYear || !amount || amount <= 0) return

        const newHistorical = {
            id: Date.now(),
            financial_year: financialYear,
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
    const totalValue = etfs.reduce((sum, etf) => sum + etf.Current_Value, 0)
    const totalTarget = etfs.reduce((sum, etf) => sum + etf.Target_Percentage, 0)

    // TFSA Contribution calculations - based on deposits for current year
    const annualContributions = deposits.reduce((sum, d) => sum + d.amount, 0)
    const contributionsRemaining = TFSA_ANNUAL_LIMIT - annualContributions
    const contributionPercentUsed = (annualContributions / TFSA_ANNUAL_LIMIT) * 100

    // Lifetime contribution calculations (historical + this year's deposits)
    const historicalTotal = historicalContributions.reduce((sum, h) => sum + h.amount, 0)
    const totalLifetimeContributions = historicalTotal + annualContributions
    const lifetimeRemaining = TFSA_LIFETIME_LIMIT - totalLifetimeContributions
    const lifetimePercentUsed = (totalLifetimeContributions / TFSA_LIFETIME_LIMIT) * 100

    // Charts Data
    const currentAllocationData = etfs.map(etf => ({
        name: etf.ETF,
        value: etf.Current_Value
    }))

    const targetAllocationData = etfs.map(etf => ({
        name: etf.ETF,
        value: (etf.Target_Percentage / 100) * totalValue
    }))

    // Target vs Actual Bar Chart Data
    const targetVsActualData = etfs.map(etf => {
        const currentPercent = totalValue > 0 ? (etf.Current_Value / totalValue) * 100 : 0
        const deviation = currentPercent - etf.Target_Percentage
        return {
            name: etf.ETF,
            target: etf.Target_Percentage,
            actual: parseFloat(currentPercent.toFixed(2)),
            deviation: parseFloat(deviation.toFixed(2))
        }
    })

    // What If Calculator - Simple split by target percentages
    const calculateWhatIfDistribution = () => {
        const amount = parseFloat(whatIfAmount) || 0
        if (amount <= 0 || totalTarget === 0) return []

        return etfs.map(etf => ({
            etf: etf.ETF,
            targetPercentage: etf.Target_Percentage,
            buyAmount: (etf.Target_Percentage / 100) * amount
        })).filter(item => item.buyAmount > 0)
            .sort((a, b) => b.buyAmount - a.buyAmount)
    }

    const whatIfDistribution = calculateWhatIfDistribution()

    const COLORS = [
        '#C62828', // Red
        '#2E7D32', // Green
        '#1565C0', // Blue
        '#F9A825', // Yellow/Gold
        '#6A1B9A', // Purple
        '#EF6C00', // Orange
        '#00838F', // Cyan
        '#AD1457', // Pink
        '#4E342E', // Brown
        '#455A64', // Blue Grey
        '#9E9D24', // Olive
        '#283593', // Indigo
        '#00695C'  // Teal
    ]

    if (loading) return <div>Loading...</div>

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">📈 TFSA Portfolio</h1>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    {isSaving ? 'Saving...' : 'All changes saved'}
                </div>
            </div>

            {/* Portfolio Total Value & Performance */}
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 rounded-xl shadow-lg">
                <div className="grid md:grid-cols-3 gap-6">
                    {/* Current Value */}
                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">Portfolio Value</h2>
                        <p className="mt-2 text-4xl font-bold text-white">
                            R {totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-emerald-100 mt-1">{etfs.length} ETF{etfs.length !== 1 ? 's' : ''} in portfolio</p>
                    </div>

                    {/* Total Invested */}
                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">Total Invested</h2>
                        <p className="mt-2 text-3xl font-bold text-white">
                            R {totalLifetimeContributions.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-emerald-100 mt-1">Lifetime contributions</p>
                    </div>

                    {/* Profit/Loss */}
                    <div>
                        <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">
                            {totalValue >= totalLifetimeContributions ? 'Profit' : 'Loss'}
                        </h2>
                        <p className={`mt-2 text-3xl font-bold ${totalValue >= totalLifetimeContributions
                            ? 'text-white'
                            : 'text-red-200'
                            }`}>
                            {totalValue >= totalLifetimeContributions ? '+' : ''}R {(totalValue - totalLifetimeContributions).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className={`text-sm mt-1 font-medium ${totalValue >= totalLifetimeContributions
                            ? 'text-emerald-100'
                            : 'text-red-200'
                            }`}>
                            {totalLifetimeContributions > 0
                                ? `${totalValue >= totalLifetimeContributions ? '+' : ''}${(((totalValue - totalLifetimeContributions) / totalLifetimeContributions) * 100).toFixed(2)}%`
                                : '—'
                            } return
                        </p>
                    </div>
                </div>
            </div>

            {/* TFSA Contribution Tracking */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <PiggyBank className="w-5 h-5 text-blue-500" />
                        TFSA Contributions (FY {financialYear.start}/{financialYear.end})
                    </h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        Mar {financialYear.start} – Feb {financialYear.end}
                    </span>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Annual Contributions */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Annual Limit
                            </h3>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                R {TFSA_ANNUAL_LIMIT.toLocaleString()}
                            </span>
                        </div>

                        {/* Add Deposit Form */}
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

                        {/* Deposits List */}
                        {deposits.length > 0 && (
                            <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                {deposits.map((deposit) => (
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

                        {/* Annual Progress */}
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-600 dark:text-gray-400">
                                    R {annualContributions.toLocaleString()}
                                </span>
                                <span className={`font-medium ${contributionsRemaining < 0
                                    ? 'text-red-500'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                    }`}>
                                    R {contributionsRemaining.toLocaleString()} left
                                </span>
                            </div>
                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${contributionPercentUsed >= 100
                                        ? 'bg-red-500'
                                        : contributionPercentUsed >= 80
                                            ? 'bg-yellow-500'
                                            : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                                        }`}
                                    style={{ width: `${Math.min(contributionPercentUsed, 100)}%` }}
                                />
                            </div>
                            <div className="text-center mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {contributionPercentUsed.toFixed(1)}% used
                            </div>
                        </div>

                        {contributionsRemaining < 0 && (
                            <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded text-xs">
                                ⚠️ Exceeded by R {Math.abs(contributionsRemaining).toLocaleString()}
                            </div>
                        )}
                    </div>

                    {/* Lifetime Contributions */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Lifetime Limit
                            </h3>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                R {TFSA_LIFETIME_LIMIT.toLocaleString()}
                            </span>
                        </div>

                        {/* Add Historical Contribution Form */}
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

                        {/* Historical Contributions List */}
                        {historicalContributions.length > 0 && (
                            <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                {historicalContributions.sort((a, b) => a.financial_year.localeCompare(b.financial_year)).map((hist) => (
                                    <div key={hist.id} className="flex items-center justify-between p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-purple-700 dark:text-purple-400">
                                                FY {hist.financial_year}
                                            </span>
                                            <span className="text-gray-500 dark:text-gray-400 text-xs">→</span>
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                R {hist.amount.toLocaleString()}
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

                        {/* Lifetime Summary */}
                        <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg">
                            <div className="text-center mb-3">
                                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                                    R {(historicalTotal + annualContributions).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    Total (R {historicalTotal.toLocaleString()} + R {annualContributions.toLocaleString()})
                                </p>
                            </div>

                            {/* Lifetime Progress */}
                            <div>
                                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${lifetimePercentUsed >= 100
                                            ? 'bg-red-500'
                                            : lifetimePercentUsed >= 80
                                                ? 'bg-yellow-500'
                                                : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                                            }`}
                                        style={{ width: `${Math.min(lifetimePercentUsed, 100)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-600 dark:text-gray-400">
                                        {lifetimePercentUsed.toFixed(1)}% used
                                    </span>
                                    <span className={`font-medium ${lifetimeRemaining < 0
                                        ? 'text-red-500'
                                        : 'text-purple-600 dark:text-purple-400'
                                        }`}>
                                        R {lifetimeRemaining.toLocaleString()} left
                                    </span>
                                </div>
                            </div>
                        </div>

                        {lifetimeRemaining < 0 && (
                            <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded text-xs">
                                ⚠️ Exceeded lifetime limit by R {Math.abs(lifetimeRemaining).toLocaleString()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Target vs Actual Bar Chart */}
            {etfs.length > 0 && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                    <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Target vs Actual Allocation</h2>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={targetVsActualData} layout="vertical" margin={{ left: 20, right: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis type="number" domain={[0, 'dataMax']} unit="%" tick={{ fill: '#9ca3af' }} />
                                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af' }} width={80} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                    formatter={(value, name) => [`${value}%`, name === 'target' ? 'Target' : 'Actual']}
                                />
                                <Legend wrapperStyle={{ color: '#9ca3af' }} />
                                <Bar dataKey="target" name="Target" fill="#6366f1" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Deviation Indicators */}
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
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <div className="flex items-center gap-2 mb-4">
                    <Calculator className="w-5 h-5 text-purple-500" />
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">"What If" Calculator</h2>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Split your investment according to your target allocation percentages
                </p>

                <div className="flex items-center gap-4 mb-6">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        If I invest:
                    </label>
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

            {/* Manage ETFs */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Manage ETFs</h2>

                {/* Add New */}
                <div className="grid grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg transition-colors">
                    <input
                        placeholder="ETF Name"
                        value={newEtf.ETF}
                        onChange={(e) => setNewEtf({ ...newEtf, ETF: e.target.value })}
                        className="col-span-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                    />
                    <input
                        placeholder="Region"
                        value={newEtf.Region}
                        onChange={(e) => setNewEtf({ ...newEtf, Region: e.target.value })}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                    />
                    <div className="flex items-center">
                        <input
                            type="number"
                            placeholder="Target %"
                            value={newEtf.Target_Percentage}
                            onChange={(e) => setNewEtf({ ...newEtf, Target_Percentage: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                        />
                        <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">%</span>
                    </div>
                    <div className="flex items-center">
                        <span className="mr-1 text-sm text-gray-500 dark:text-gray-400">R</span>
                        <input
                            type="number"
                            placeholder="Value"
                            value={newEtf.Current_Value}
                            onChange={(e) => setNewEtf({ ...newEtf, Current_Value: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                        />
                    </div>
                    <button
                        onClick={addEtf}
                        className="flex items-center justify-center px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add
                    </button>
                </div>

                {/* List */}
                <div className="space-y-2">
                    <div className="grid grid-cols-6 gap-4 text-sm font-medium text-gray-500 dark:text-gray-400 px-4">
                        <div className="col-span-2">ETF Name</div>
                        <div>Region</div>
                        <div>Target %</div>
                        <div>Current Value</div>
                        <div>Action</div>
                    </div>
                    {etfs.map((etf, index) => (
                        <div key={index} className="grid grid-cols-6 gap-4 items-center px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors">
                            <input
                                value={etf.ETF}
                                onChange={(e) => updateEtf(index, 'ETF', e.target.value)}
                                className="col-span-2 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-gray-900 dark:text-white"
                            />
                            <input
                                value={etf.Region}
                                onChange={(e) => updateEtf(index, 'Region', e.target.value)}
                                className="bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-gray-900 dark:text-white"
                            />
                            <div className="flex items-center">
                                <input
                                    type="number"
                                    value={etf.Target_Percentage}
                                    onChange={(e) => updateEtf(index, 'Target_Percentage', e.target.value)}
                                    className="w-20 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-right text-gray-900 dark:text-white"
                                />
                                <span className="ml-1 text-gray-500 dark:text-gray-400">%</span>
                            </div>
                            <div className="flex items-center">
                                <span className="mr-1 text-gray-500 dark:text-gray-400">R</span>
                                <input
                                    type="number"
                                    value={etf.Current_Value}
                                    onChange={(e) => updateEtf(index, 'Current_Value', e.target.value)}
                                    className="w-24 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-right text-gray-900 dark:text-white"
                                />
                            </div>
                            <button onClick={() => removeEtf(index)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 w-8 transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                {Math.abs(totalTarget - 100) > 0.1 && (
                    <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm transition-colors">
                        ⚠️ Target percentages sum to {totalTarget.toFixed(2)}% (should be 100%)
                    </div>
                )}
            </div>

            {/* Rebalancing */}
            {rebalanceData && (
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
        </div>
    )
}
