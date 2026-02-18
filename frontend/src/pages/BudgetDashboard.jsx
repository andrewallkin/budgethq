import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Plus, Trash2, TrendingUp, ChevronDown, ChevronRight, Folder, Calculator } from 'lucide-react'
import { Link } from 'react-router-dom'
import SavingsCalculator from '../components/SavingsCalculator'
import { formatCurrency, formatNumber } from '../utils/numberFormatting'

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
    const [needs, setNeeds] = useState([])
    const [wants, setWants] = useState([])
    const [savings, setSavings] = useState([])

    const [latestPayslip, setLatestPayslip] = useState(null)
    const [activeTab, setActiveTab] = useState('needs')

    const [isSaving, setIsSaving] = useState(false)
    const hasLoadedData = useRef(false)
    const [hasUserEdited, setHasUserEdited] = useState(false)

    // TFSA Portfolio data
    const [portfolioTotal, setPortfolioTotal] = useState(0)
    const [portfolioEtfCount, setPortfolioEtfCount] = useState(0)

    // Savings Calculator
    const [showSavingsCalculator, setShowSavingsCalculator] = useState(false)

    // Load data on mount
    useEffect(() => {
        fetchData()
    }, [])

    // Fetch latest payslip data
    useEffect(() => {
        const fetchPayslip = async () => {
            try {
                const response = await axios.get('/api/payslip/latest')
                setLatestPayslip(response.data)
            } catch (err) {
                // No payslip available
                console.log('No payslip data available')
            }
        }
        fetchPayslip()
    }, [])

    // Auto-save - only after user has explicitly edited data
    useEffect(() => {
        if (!hasLoadedData.current) return
        if (!hasUserEdited) return
        if (loading) return

        const timer = setTimeout(() => {
            saveData()
        }, 1000)

        return () => clearTimeout(timer)
    }, [needs, wants, savings, loading, hasUserEdited])

    const fetchData = async () => {
        try {
            const [budgetRes, portfolioRes] = await Promise.all([
                axios.get('/api/budget/default_user'),
                axios.get('/api/portfolio')
            ])

            if (budgetRes.data && Object.keys(budgetRes.data).length > 0) {
                // Only set salary if it exists and is not null
                setSalary(budgetRes.data.salary ?? 0)
                // Ensure all categories have group field (backward compatibility)
                setNeeds((budgetRes.data.needs || []).map(item => ({ ...item, group: item.group || null })))
                setWants((budgetRes.data.wants || []).map(item => ({ ...item, group: item.group || null })))
                setSavings((budgetRes.data.savings || []).map(item => ({ ...item, group: item.group || null })))

                hasLoadedData.current = true
            } else {
                // Even if no data, mark as loaded so saves can happen for new users
                hasLoadedData.current = true
            }

            if (portfolioRes.data && Array.isArray(portfolioRes.data)) {
                const total = portfolioRes.data.reduce((sum, etf) => sum + (etf.Current_Value || 0), 0)
                setPortfolioTotal(total)
                setPortfolioEtfCount(portfolioRes.data.length)
            }
        } catch (err) {
            console.error("Failed to fetch data", err)
            // Mark as loaded even on error to prevent infinite blocking
            hasLoadedData.current = true
        } finally {
            setLoading(false)
        }
    }


    const saveData = async () => {
        setIsSaving(true)
        try {
            // No need to inject emergency/RA fields anymore
            await axios.post('/api/budget/default_user', {
                salary,
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

    const addCategory = (type, name, amount = 0, group = null) => {
        setHasUserEdited(true)
        const newItem = { name, amount, group }
        if (type === 'needs') setNeeds([...needs, newItem])
        else if (type === 'wants') setWants([...wants, newItem])
        else setSavings([...savings, newItem])
    }

    const updateCategory = (type, index, field, value) => {
        setHasUserEdited(true)
        const list = type === 'needs' ? needs : type === 'wants' ? wants : savings
        const newList = [...list]
        newList[index][field] = field === 'amount' ? parseFloat(value) || 0 : value

        if (type === 'needs') setNeeds(newList)
        if (type === 'wants') setWants(newList)
        if (type === 'savings') setSavings(newList)
    }

    const removeCategory = (type, index) => {
        setHasUserEdited(true)
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

    const netIncome = salary // salary is now already the net income
    const totalSpent = totalNeeds + totalWants + totalSavings
    const remaining = netIncome - totalSpent

    // Percentage calculation helper
    const calculatePercentage = (amount, total = netIncome) => {
        if (total === 0) return 0
        return (amount / total) * 100
    }

    const chartData = [
        { name: 'Needs', value: totalNeeds, percentage: calculatePercentage(totalNeeds) },
        { name: 'Wants', value: totalWants, percentage: calculatePercentage(totalWants) },
        { name: 'Savings', value: totalSavings, percentage: calculatePercentage(totalSavings) },
        { name: 'Unallocated', value: Math.max(0, remaining), percentage: calculatePercentage(Math.max(0, remaining)) }
    ].filter(d => d.value > 0)


    if (loading) return <div>Loading...</div>

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">💰 Budget Dashboard</h1>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowSavingsCalculator(true)}
                        className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                        <Calculator className="w-4 h-4" />
                        Savings Calculator
                    </button>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {isSaving ? 'Saving...' : 'All changes saved'}
                    </div>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Column 1: Income, Summary, and Budget Breakdown */}
                <div className="md:col-span-1 space-y-6">
                    {/* Income Card */}
                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Income Details</h2>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Net Monthly Income (R)</label>
                                    <Link to="/salary" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                                        Edit Salary Details →
                                    </Link>
                                </div>
                                {salary > 0 ? (
                                    <input
                                        type="text"
                                        value={formatCurrency(salary, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white cursor-not-allowed"
                                    />
                                ) : (
                                    <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 italic">
                                        No income data available
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Payslip & Tax Info Card */}
                    {latestPayslip && (
                        <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 p-4 sm:p-6 rounded-xl shadow-sm border border-purple-200 dark:border-purple-800 transition-colors">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">💰 Payslip Info</h2>
                                <Link to="/salary" className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium">
                                    View Details →
                                </Link>
                            </div>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-300">Gross Salary</span>
                                    <span className="font-semibold text-green-600 dark:text-green-400">
                                        {formatCurrency(latestPayslip.gross_salary)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-300">PAYE (Tax)</span>
                                    <span className="font-semibold text-red-600 dark:text-red-400">
                                        - {formatCurrency(latestPayslip.paye)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-300">UIF</span>
                                    <span className="font-semibold text-red-600 dark:text-red-400">
                                        - {formatCurrency(latestPayslip.uif_employee_portion)}
                                    </span>
                                </div>
                                <div className="pt-2 border-t border-purple-200 dark:border-purple-700">
                                    <div className="flex justify-between">
                                        <span className="text-gray-700 dark:text-gray-200 font-medium">Net Pay</span>
                                        <span className="font-bold text-blue-600 dark:text-blue-400">
                                            {formatCurrency(latestPayslip.net_pay)}
                                        </span>
                                    </div>
                                </div>
                                {latestPayslip.company_name && (
                                    <div className="pt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                                        {latestPayslip.company_name}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Summary Stats Card */}
                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Summary</h2>
                        <div className="space-y-4">
                            <SummaryItem label="Total Needs" value={totalNeeds} color="text-red-600 dark:text-red-400" percentage={calculatePercentage(totalNeeds)} />
                            <SummaryItem label="Total Wants" value={totalWants} color="text-blue-600 dark:text-blue-400" percentage={calculatePercentage(totalWants)} />
                            <SummaryItem label="Total Savings" value={totalSavings} color="text-green-600 dark:text-green-400" percentage={calculatePercentage(totalSavings)} />
                            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                <SummaryItem
                                    label="Remaining"
                                    value={remaining}
                                    color={remaining >= 0 ? "text-gray-900 dark:text-white" : "text-red-600 dark:text-red-400"}
                                    percentage={calculatePercentage(Math.max(0, remaining))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Overall Budget Breakdown Chart */}
                    {salary > 0 && (
                        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Budget Breakdown</h2>
                            <div className="h-64 min-h-[200px]">
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
                                            formatter={(value, name, props) => {
                                                const percentage = props.payload.percentage || 0
                                                return [`R ${value.toFixed(2)} (${percentage.toFixed(1)}%)`, name]
                                            }}
                                            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                            itemStyle={{ color: '#f3f4f6' }}
                                        />
                                        <Legend
                                            layout="vertical"
                                            verticalAlign="bottom"
                                            height={80}
                                            wrapperStyle={{ color: '#9ca3af', overflow: 'hidden', maxWidth: '100%' }}
                                            formatter={(value, entry) => {
                                                const data = chartData.find(d => d.name === value)
                                                return data ? `${value} (${data.percentage.toFixed(1)}%)` : value
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>

                {/* Column 2 & 3: Categories and Insights */}
                <div className="md:col-span-2 space-y-6">
                    {/* Tabs & Category List */}
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

                        <div className="p-4 sm:p-6">
                            <CategoryList
                                type={activeTab}
                                items={activeTab === 'needs' ? needs : activeTab === 'wants' ? wants : savings}
                                netIncome={netIncome}
                                onAdd={(name, amount, group) => addCategory(activeTab, name, amount, group)}
                                onUpdate={(index, field, val) => updateCategory(activeTab, index, field, val)}
                                onRemove={(index) => removeCategory(activeTab, index)}
                            />
                        </div>
                    </div>

                    {/* Category Specific Chart */}
                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="text-lg font-semibold mb-4 capitalize text-gray-900 dark:text-white">{activeTab} Breakdown</h2>
                        <div className="h-64 sm:h-80 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={(() => {
                                            const categoryItems = activeTab === 'needs' ? needs : activeTab === 'wants' ? wants : savings
                                            const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0)
                                            return categoryItems
                                                .map(item => ({
                                                    name: item.name,
                                                    value: item.amount,
                                                    percentage: categoryTotal > 0 ? (item.amount / categoryTotal) * 100 : 0
                                                }))
                                                .filter(d => d.value > 0)
                                        })()}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {(() => {
                                            const categoryItems = activeTab === 'needs' ? needs : activeTab === 'wants' ? wants : savings
                                            return categoryItems
                                                .map(item => ({ name: item.name, value: item.amount }))
                                                .filter(d => d.value > 0)
                                                .map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} stroke="none" />
                                                ))
                                        })()}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value, name, props) => {
                                            const percentage = props.payload.percentage || 0
                                            return [`R ${value.toFixed(2)} (${percentage.toFixed(1)}%)`, name]
                                        }}
                                        contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                        itemStyle={{ color: '#f3f4f6' }}
                                    />
                                    <Legend
                                        layout="vertical"
                                        verticalAlign="bottom"
                                        height={80}
                                        wrapperStyle={{ color: '#9ca3af', overflow: 'hidden', maxWidth: '100%' }}
                                        formatter={(value, entry, index) => {
                                            const categoryItems = activeTab === 'needs' ? needs : activeTab === 'wants' ? wants : savings
                                            const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0)
                                            const item = categoryItems.find(i => i.name === value)
                                            if (item && categoryTotal > 0) {
                                                const percentage = (item.amount / categoryTotal) * 100
                                                return `${value} (${percentage.toFixed(1)}%)`
                                            }
                                            return value
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </div>
            </div>

            {/* Savings Calculator Modal */}
            <SavingsCalculator
                isOpen={showSavingsCalculator}
                onClose={() => setShowSavingsCalculator(false)}
            />
        </div>
    )
}

function SummaryItem({ label, value, color, percentage }) {
    return (
        <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
            <span className={`font-medium ${color}`}>
                {formatCurrency(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {percentage !== undefined && (
                    <span className="text-sm ml-2 text-gray-500 dark:text-gray-400">
                        ({formatNumber(percentage, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                    </span>
                )}
            </span>
        </div>
    )
}

const CategoryList = ({ type, items, netIncome, onAdd, onUpdate, onRemove }) => {
    const [newName, setNewName] = useState('')
    const [newAmount, setNewAmount] = useState('')
    const [newGroup, setNewGroup] = useState('')
    const [collapsedGroups, setCollapsedGroups] = useState(new Set())
    const [editingGroup, setEditingGroup] = useState({}) // Track local group values while editing

    // Get all unique groups from items
    const allGroups = Array.from(new Set(items.map(item => item.group).filter(Boolean)))

    // Group items by their group field
    const groupedItems = items.reduce((acc, item, index) => {
        const group = item.group || null
        if (!acc[group]) {
            acc[group] = []
        }
        acc[group].push({ ...item, originalIndex: index })
        return acc
    }, {})

    // Calculate percentage helper
    const calculatePercentage = (amount) => {
        if (netIncome === 0) return 0
        return (amount / netIncome) * 100
    }

    const handleAdd = () => {
        if (newName.trim()) {
            onAdd(newName.trim(), parseFloat(newAmount) || 0, newGroup.trim() || null)
            setNewName('')
            setNewAmount('')
            setNewGroup('')
        }
    }

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleAdd()
        }
    }

    const toggleGroup = (group) => {
        const newCollapsed = new Set(collapsedGroups)
        if (newCollapsed.has(group)) {
            newCollapsed.delete(group)
        } else {
            newCollapsed.add(group)
        }
        setCollapsedGroups(newCollapsed)
    }

    const getGroupTotal = (groupItems) => {
        return groupItems.reduce((sum, item) => sum + item.amount, 0)
    }

    // Render a group header
    const renderGroupHeader = (groupName, groupItems) => {
        const total = getGroupTotal(groupItems)
        const isCollapsed = collapsedGroups.has(groupName)
        const displayName = groupName === null ? 'Uncategorized' : groupName

        return (
            <div
                key={groupName}
                className="mt-4 first:mt-0"
            >
                <button
                    onClick={() => toggleGroup(groupName)}
                    className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left"
                >
                    <div className="flex items-center gap-2 flex-wrap">
                        {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        )}
                        <Folder className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <span className="font-semibold text-blue-900 dark:text-blue-100">{displayName}</span>
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                            ({groupItems.length} {groupItems.length === 1 ? 'item' : 'items'})
                        </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-semibold text-blue-900 dark:text-blue-100">
                            {formatCurrency(total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                            ({formatNumber(calculatePercentage(total), {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                            })}%)
                        </span>
                    </div>
                </button>
                {!isCollapsed && (
                    <div className="mt-2 space-y-2 ml-4">
                        {groupItems.map((item) => renderCategoryItem(item, item.originalIndex))}
                    </div>
                )}
            </div>
        )
    }

    // Render a single category item
    const renderCategoryItem = (item, index) => {
        const percentage = calculatePercentage(item.amount)
        // Use local editing state if available, otherwise use item.group
        const groupValue = editingGroup[index] !== undefined ? editingGroup[index] : (item.group || '')

        return (
            <div key={index} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors group">
                <input
                    type="text"
                    value={item.name}
                    onChange={(e) => onUpdate(index, 'name', e.target.value)}
                    className="flex-1 min-w-[120px] w-full sm:w-auto bg-transparent border-none focus:ring-0 p-0 font-medium text-gray-900 dark:text-white break-words"
                />
                <div className="relative flex-1 sm:flex-initial min-w-0">
                    <input
                        type="text"
                        list={`group-edit-list-${type}-${index}`}
                        placeholder="Group..."
                        value={groupValue}
                        onChange={(e) => {
                            setEditingGroup(prev => ({ ...prev, [index]: e.target.value }))
                        }}
                        onBlur={(e) => {
                            const finalValue = e.target.value.trim() || null
                            onUpdate(index, 'group', finalValue)
                            setEditingGroup(prev => {
                                const newState = { ...prev }
                                delete newState[index]
                                return newState
                            })
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.target.blur()
                            }
                        }}
                        className="w-full sm:w-32 px-2 py-1 text-xs bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded text-gray-900 dark:text-white"
                    />
                    <datalist id={`group-edit-list-${type}-${index}`}>
                        {allGroups.map(group => (
                            <option key={group} value={group} />
                        ))}
                    </datalist>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-gray-500 dark:text-gray-400 text-sm">R</span>
                    <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => onUpdate(index, 'amount', e.target.value.replace(/,/g, ''))}
                        onFocus={(e) => e.target.select()}
                        className="w-24 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded px-2 py-1 text-right text-gray-900 dark:text-white"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[50px] text-right">
                        (
                            {formatNumber(percentage, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            %
                        )
                    </span>
                </div>
                <button
                    onClick={() => onRemove(index)}
                    className="p-2 -m-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                <input
                    type="text"
                    placeholder="Category name..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="flex-1 min-w-0 w-full sm:min-w-[150px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                />
                <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 sm:w-auto w-full">
                    <span className="text-gray-500 dark:text-gray-400 text-sm">R</span>
                    <input
                        type="number"
                        placeholder="0"
                        value={newAmount}
                        onChange={(e) => setNewAmount(e.target.value.replace(/,/g, ''))}
                        onKeyPress={handleKeyPress}
                        onFocus={(e) => e.target.select()}
                        className="w-24 min-w-0 flex-1 sm:flex-initial bg-transparent border-none focus:ring-0 p-0 text-right text-gray-900 dark:text-white"
                    />
                </div>
                <div className="relative w-full sm:w-auto">
                    <input
                        type="text"
                        list={`group-list-${type}`}
                        placeholder="Group (optional)..."
                        value={newGroup}
                        onChange={(e) => setNewGroup(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="w-full sm:w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                    />
                    <datalist id={`group-list-${type}`}>
                        {allGroups.map(group => (
                            <option key={group} value={group} />
                        ))}
                    </datalist>
                </div>
                <button
                    onClick={handleAdd}
                    className="px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                >
                    <Plus className="w-4 h-4" />
                    Add
                </button>
            </div>

            <div className="space-y-2">
                {Object.entries(groupedItems)
                    .sort(([a], [b]) => {
                        // Sort: null (ungrouped) last, then alphabetically
                        if (a === null) return 1
                        if (b === null) return -1
                        return a.localeCompare(b)
                    })
                    .map(([groupName, groupItems]) => {
                        return renderGroupHeader(groupName, groupItems)
                    })}
                {items.length === 0 && (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">No categories yet</p>
                )}
            </div>
        </div>
    )
}
