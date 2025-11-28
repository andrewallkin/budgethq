import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Plus, Trash2 } from 'lucide-react'

const COLORS = {
    Needs: '#B91C1C', // red-700
    Wants: '#1D4ED8', // blue-700
    Savings: '#15803D', // green-700
    Unallocated: '#B45309' // amber-700
}

const CATEGORY_COLORS = [
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

export default function BudgetDashboard() {
    const [loading, setLoading] = useState(true)
    const [salary, setSalary] = useState(0)
    const [age, setAge] = useState(30)
    const [needs, setNeeds] = useState([])
    const [wants, setWants] = useState([])
    const [savings, setSavings] = useState([])

    const [taxInfo, setTaxInfo] = useState({ monthly_tax: 0, monthly_uif: 0 })
    const [activeTab, setActiveTab] = useState('needs')

    const [isSaving, setIsSaving] = useState(false)
    const firstRender = useRef(true)

    // Load data on mount
    useEffect(() => {
        fetchData()
    }, [])

    // Recalculate tax when salary or age changes
    useEffect(() => {
        if (salary > 0) {
            calculateTax()
        } else {
            setTaxInfo({ monthly_tax: 0, monthly_uif: 0 })
        }
    }, [salary, age])

    // Auto-save
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false
            return
        }
        if (loading) return

        const timer = setTimeout(() => {
            saveData()
        }, 1000)

        return () => clearTimeout(timer)
    }, [salary, age, needs, wants, savings, loading])

    const fetchData = async () => {
        try {
            const res = await axios.get('/api/budget/default_user')
            if (res.data && Object.keys(res.data).length > 0) {
                setSalary(res.data.salary || 0)
                setAge(res.data.age || 30)
                setNeeds(res.data.needs || [])
                setWants(res.data.wants || [])
                setSavings(res.data.savings || [])
            }
        } catch (err) {
            console.error("Failed to fetch budget data", err)
        } finally {
            setLoading(false)
        }
    }

    const calculateTax = async () => {
        try {
            const res = await axios.post('/api/calculate/tax', { salary, age })
            setTaxInfo(res.data)
        } catch (err) {
            console.error("Failed to calculate tax", err)
        }
    }

    const saveData = async () => {
        setIsSaving(true)
        try {
            await axios.post('/api/budget/default_user', {
                salary,
                age,
                needs,
                wants,
                savings
            })
        } catch (err) {
            console.error("Failed to save data", err)
        } finally {
            setIsSaving(false)
        }
    }

    const addCategory = (type, name) => {
        if (!name) return
        const newItem = { name, amount: 0 }
        if (type === 'needs') setNeeds([...needs, newItem])
        if (type === 'wants') setWants([...wants, newItem])
        if (type === 'savings') setSavings([...savings, newItem])
    }

    const updateCategory = (type, index, field, value) => {
        const list = type === 'needs' ? needs : type === 'wants' ? wants : savings
        const newList = [...list]
        newList[index][field] = field === 'amount' ? parseFloat(value) || 0 : value

        if (type === 'needs') setNeeds(newList)
        if (type === 'wants') setWants(newList)
        if (type === 'savings') setSavings(newList)
    }

    const removeCategory = (type, index) => {
        const list = type === 'needs' ? needs : type === 'wants' ? wants : savings
        const newList = list.filter((_, i) => i !== index)

        if (type === 'needs') setNeeds(newList)
        if (type === 'wants') setWants(newList)
        if (type === 'savings') setSavings(newList)
    }

    // Calculations
    const totalNeeds = needs.reduce((sum, item) => sum + item.amount, 0)
    const totalWants = wants.reduce((sum, item) => sum + item.amount, 0)
    const totalSavings = savings.reduce((sum, item) => sum + item.amount, 0)

    const netIncome = salary - taxInfo.monthly_tax - taxInfo.monthly_uif
    const totalSpent = totalNeeds + totalWants + totalSavings
    const remaining = netIncome - totalSpent

    const chartData = [
        { name: 'Needs', value: totalNeeds },
        { name: 'Wants', value: totalWants },
        { name: 'Savings', value: totalSavings },
        { name: 'Unallocated', value: Math.max(0, remaining) }
    ].filter(d => d.value > 0)

    if (loading) return <div>Loading...</div>

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">💰 Budget Dashboard</h1>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    {isSaving ? 'Saving...' : 'All changes saved'}
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Income Settings */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Income Details</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Gross Salary (R)</label>
                                <input
                                    type="number"
                                    value={salary}
                                    onChange={(e) => setSalary(parseFloat(e.target.value) || 0)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age</label>
                                <input
                                    type="number"
                                    value={age}
                                    onChange={(e) => setAge(parseInt(e.target.value) || 30)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                                />
                            </div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Calculated Deductions</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">Tax (PAYE)</span>
                                    <span className="font-medium text-gray-900 dark:text-white">R {taxInfo.monthly_tax.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">UIF</span>
                                    <span className="font-medium text-gray-900 dark:text-white">R {taxInfo.monthly_uif.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm pt-2 border-t border-gray-100 dark:border-gray-700 font-semibold text-blue-600 dark:text-blue-400">
                                    <span>Net Income</span>
                                    <span>R {netIncome.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Summary</h2>
                        <div className="space-y-4">
                            <SummaryItem label="Total Needs" value={totalNeeds} color="text-red-600 dark:text-red-400" />
                            <SummaryItem label="Total Wants" value={totalWants} color="text-blue-600 dark:text-blue-400" />
                            <SummaryItem label="Total Savings" value={totalSavings} color="text-green-600 dark:text-green-400" />
                            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                <SummaryItem
                                    label="Remaining"
                                    value={remaining}
                                    color={remaining >= 0 ? "text-gray-900 dark:text-white" : "text-red-600 dark:text-red-400"}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Overall Budget Breakdown Chart (Moved here) */}
                    {salary > 0 && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Budget Breakdown</h2>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[entry.name]} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value) => `R ${value.toFixed(2)}`}
                                            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                            itemStyle={{ color: '#f3f4f6' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: '#9ca3af' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>

                {/* Categories & Chart */}
                <div className="md:col-span-2 space-y-6">
                    {/* Tabs */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
                        <div className="flex border-b border-gray-100 dark:border-gray-700">
                            {['needs', 'wants', 'savings'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex-1 py-4 text-sm font-medium capitalize transition-colors ${activeTab === tab
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="p-6">
                            <CategoryList
                                type={activeTab}
                                items={activeTab === 'needs' ? needs : activeTab === 'wants' ? wants : savings}
                                onAdd={(name) => addCategory(activeTab, name)}
                                onUpdate={(index, field, val) => updateCategory(activeTab, index, field, val)}
                                onRemove={(index) => removeCategory(activeTab, index)}
                            />
                        </div>
                    </div>

                    {/* Category Specific Chart (New) */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="text-lg font-semibold mb-4 capitalize text-gray-900 dark:text-white">{activeTab} Breakdown</h2>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={(activeTab === 'needs' ? needs : activeTab === 'wants' ? wants : savings).map(item => ({ name: item.name, value: item.amount })).filter(d => d.value > 0)}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {(activeTab === 'needs' ? needs : activeTab === 'wants' ? wants : savings)
                                            .map(item => ({ name: item.name, value: item.amount }))
                                            .filter(d => d.value > 0)
                                            .map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} stroke="none" />
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
            </div>
        </div >
    )
}

function SummaryItem({ label, value, color }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
            <span className={`font-medium ${color}`}>R {value.toFixed(2)}</span>
        </div>
    )
}

function CategoryList({ type, items, onAdd, onUpdate, onRemove }) {
    const [newName, setNewName] = useState('')

    const handleAdd = () => {
        if (newName.trim()) {
            onAdd(newName)
            setNewName('')
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`Add new ${type} category...`}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                <button
                    onClick={handleAdd}
                    className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-2">
                {items.map((item, index) => (
                    <div key={index} className="flex gap-4 items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group transition-colors">
                        <input
                            type="text"
                            value={item.name}
                            onChange={(e) => onUpdate(index, 'name', e.target.value)}
                            className="flex-1 bg-transparent border-none focus:ring-0 p-0 font-medium text-gray-900 dark:text-white"
                        />
                        <div className="flex items-center gap-2">
                            <span className="text-gray-500 dark:text-gray-400 text-sm">R</span>
                            <input
                                type="number"
                                value={item.amount}
                                onChange={(e) => onUpdate(index, 'amount', e.target.value)}
                                className="w-24 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded px-2 py-1 text-right text-gray-900 dark:text-white"
                            />
                        </div>
                        <button
                            onClick={() => onRemove(index)}
                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                {items.length === 0 && (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">No categories yet</p>
                )}
            </div>
        </div>
    )
}
