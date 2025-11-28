import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Plus, Trash2, RefreshCw } from 'lucide-react'

export default function TFSAPortfolio() {
    const [loading, setLoading] = useState(true)
    const [etfs, setEtfs] = useState([])
    const [threshold, setThreshold] = useState(5.0)
    const [rebalanceData, setRebalanceData] = useState(null)

    const [isSaving, setIsSaving] = useState(false)
    const firstRender = useRef(true)

    // New ETF form state
    const [newEtf, setNewEtf] = useState({
        ETF: '',
        Region: '',
        Target_Percentage: 0,
        Current_Value: 0
    })

    useEffect(() => {
        fetchPortfolio()
    }, [])

    useEffect(() => {
        if (etfs.length > 0) {
            calculateRebalance()
        }
    }, [etfs, threshold])

    // Auto-save
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

    // Metrics
    const totalValue = etfs.reduce((sum, etf) => sum + etf.Current_Value, 0)
    const totalTarget = etfs.reduce((sum, etf) => sum + etf.Target_Percentage, 0)

    // Charts Data
    const currentAllocationData = etfs.map(etf => ({
        name: etf.ETF,
        value: etf.Current_Value
    }))

    const targetAllocationData = etfs.map(etf => ({
        name: etf.ETF,
        value: (etf.Target_Percentage / 100) * totalValue
    }))

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
