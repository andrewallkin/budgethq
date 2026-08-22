import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '../../utils/numberFormatting'
import { BUDGET_COLORS, budgetSplit, labBudget, monthlyTotal } from './uiLabData'

const CATEGORY_COLORS = ['#C62828', '#2E7D32', '#1565C0', '#F9A825', '#6A1B9A', '#EF6C00']

const money = (value) =>
    formatCurrency(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function UiLabBudget() {
    const [activeTab, setActiveTab] = useState('needs')
    const itemsByTab = {
        needs: labBudget.needs,
        wants: labBudget.wants,
        savings: labBudget.savings,
    }
    const tabItems = itemsByTab[activeTab]
    const totalNeeds = monthlyTotal(labBudget.needs)
    const totalWants = monthlyTotal(labBudget.wants)
    const totalSavings = monthlyTotal(labBudget.savings)
    const remaining = labBudget.netIncome - totalNeeds - totalWants - totalSavings
    const split = budgetSplit(labBudget)
    const monthlyItems = tabItems.filter((item) => item.cadence === 'monthly')
    const categoryTotal = monthlyItems.reduce((sum, item) => sum + item.amount, 0)
    const categoryChart = monthlyItems.map((item) => ({
        name: item.name,
        value: item.amount,
        percentage: categoryTotal === 0 ? 0 : (item.amount / categoryTotal) * 100,
    }))
    const pct = (value) => (labBudget.netIncome === 0 ? 0 : (value / labBudget.netIncome) * 100)

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">Budget</p>
                    <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                        Budget Dashboard
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Current period: {labBudget.periodLabel}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                    <button
                        type="button"
                        disabled
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white opacity-60 cursor-not-allowed"
                    >
                        <Calculator className="w-4 h-4" />
                        Savings Calculator
                    </button>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Mockup — not saved</p>
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold tracking-tight mb-4 text-gray-900 dark:text-white">Income Details</h2>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Net Monthly Income (R)
                        </label>
                        <p className="w-full px-3 py-3 text-sm font-medium tabular-nums rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white">
                            {money(labBudget.netIncome)}
                        </p>
                        <p className="mt-2 text-xs text-gray-400">Salary edit is disabled in the lab</p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold tracking-tight mb-4 text-gray-900 dark:text-white">Payslip Info</h2>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">Gross Salary</span>
                                <span className="font-medium tabular-nums text-gray-900 dark:text-white">{money(labBudget.payslip.grossSalary)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">PAYE (Tax)</span>
                                <span className="font-medium tabular-nums text-gray-900 dark:text-white">{money(labBudget.payslip.paye)}</span>
                            </div>
                            <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 pt-2">
                                <span className="font-medium text-gray-700 dark:text-gray-200">Net Pay</span>
                                <span className="font-medium tabular-nums text-blue-600 dark:text-blue-400">{money(labBudget.payslip.netPay)}</span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{labBudget.payslip.companyName}</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold tracking-tight mb-4 text-gray-900 dark:text-white">Summary</h2>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">Total Needs</span>
                                <span className="font-medium tabular-nums text-red-600 dark:text-red-400">{money(totalNeeds)} ({pct(totalNeeds).toFixed(1)}%)</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">Total Wants</span>
                                <span className="font-medium tabular-nums text-blue-600 dark:text-blue-400">{money(totalWants)} ({pct(totalWants).toFixed(1)}%)</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">Total Savings</span>
                                <span className="font-medium tabular-nums text-green-600 dark:text-green-400">{money(totalSavings)} ({pct(totalSavings).toFixed(1)}%)</span>
                            </div>
                            <div className="flex justify-between border-t border-gray-100 dark:border-gray-700 pt-3">
                                <span className="text-gray-500 dark:text-gray-400">Remaining</span>
                                <span className="font-medium tabular-nums text-gray-900 dark:text-white">{money(remaining)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold tracking-tight mb-4 text-gray-900 dark:text-white">Budget Breakdown</h2>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={split} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={5}>
                                        {split.map((entry) => (
                                            <Cell key={entry.name} fill={BUDGET_COLORS[entry.name]} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value, name, props) => [`${money(value)} (${props.payload.percentage.toFixed(1)}%)`, name]} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="flex border-b border-gray-100 dark:border-gray-700">
                            {['needs', 'wants', 'savings'].map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex-1 py-4 text-sm font-medium capitalize ${activeTab === tab
                                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/60'}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-700">
                            {tabItems.map((item) => (
                                <div key={`${activeTab}-${item.name}`} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 sm:px-6 py-3 items-center">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{item.category}</p>
                                    </div>
                                    <span className="text-xs uppercase tracking-wider text-gray-400">{item.cadence}</span>
                                    <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white text-right">
                                        {item.cadence === 'annual' ? `${money(item.amount)}/yr` : money(item.amount)}
                                    </span>
                                </div>
                            ))}
                            <div className="px-4 sm:px-6 py-3">
                                <button
                                    type="button"
                                    disabled
                                    className="text-sm font-medium rounded-lg px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-400 cursor-not-allowed"
                                >
                                    Add category
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold tracking-tight mb-4 capitalize text-gray-900 dark:text-white">
                            {activeTab} Breakdown
                        </h2>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={categoryChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={5}>
                                        {categoryChart.map((entry, index) => (
                                            <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value, name, props) => [`${money(value)} (${props.payload.percentage.toFixed(1)}%)`, name]} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
