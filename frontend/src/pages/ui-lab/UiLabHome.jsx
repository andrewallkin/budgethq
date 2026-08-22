import { Link } from 'react-router-dom'
import { ArrowUpRight, Landmark, LayoutDashboard, PieChart as PieChartIcon, Shield } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '../../utils/numberFormatting'
import { BUDGET_COLORS, OVERVIEW_COLORS, labHome } from './uiLabData'

const money = (value, currency = 'ZAR') =>
    formatCurrency(value, { currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TILE =
    'group relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm md:min-h-[260px]'

export default function UiLabHome() {
    const { budget, investments, emergency, accounts } = labHome
    const accountPeak = Math.max(...accounts.rows.map((row) => row.value))

    return (
        <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto">
            <div>
                <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">Home</p>
                <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
                    Financial Overview
                </h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <Link to="/ui-lab/budget" className={TILE}>
                    <div className="absolute inset-y-0 left-0 w-px bg-blue-600" />
                    <div className="flex items-start justify-between gap-4">
                        <div className="p-3 rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300">
                            <LayoutDashboard className="w-6 h-6" />
                        </div>
                        <ArrowUpRight className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                        <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Salary</p>
                        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">Gross </span>
                                <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(budget.grossSalary)}</span>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">Net </span>
                                <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(budget.netIncome)}</span>
                            </div>
                        </div>
                    </div>
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Budget</p>
                    <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
                        {money(budget.totalBudgeted)}
                    </p>
                    <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{budget.periodLabel}</p>
                    <div className="mt-1 flex justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Unallocated</span>
                        <span className="font-medium tabular-nums text-gray-900 dark:text-white">Left {money(budget.remaining)}</span>
                    </div>
                </Link>

                <Link to="/ui-lab/investments" className={TILE}>
                    <div className="absolute inset-y-0 left-0 w-px bg-emerald-600" />
                    <div className="flex items-start justify-between gap-4">
                        <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300">
                            <PieChartIcon className="w-6 h-6" />
                        </div>
                        <ArrowUpRight className="w-5 h-5 text-gray-400" />
                    </div>
                    <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Investments</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
                        {money(investments.totalValue)}
                    </p>
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{investments.portfolios.length} portfolios</p>
                </Link>

                <div className={TILE}>
                    <div className="absolute inset-y-0 left-0 w-px bg-amber-600" />
                    <div className="p-3 rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300 w-fit">
                        <Shield className="w-6 h-6" />
                    </div>
                    <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Emergency</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
                        {money(emergency.currentFund)}
                    </p>
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{emergency.progress}% funded</p>
                </div>

                <div className={TILE}>
                    <div className="absolute inset-y-0 left-0 w-px bg-teal-600" />
                    <div className="p-3 rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-900/25 dark:text-teal-300 w-fit">
                        <Landmark className="w-6 h-6" />
                    </div>
                    <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Accounts</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
                        {money(accounts.totalBalance)}
                    </p>
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{accounts.count} accounts</p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 sm:gap-6">
                <section className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-5">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Budget Split</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Needs, wants, savings</p>
                        </div>
                        <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(budget.netIncome)}</p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={budget.split} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>
                                        {budget.split.map((entry) => (
                                            <Cell key={entry.name} fill={BUDGET_COLORS[entry.name]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => money(value)} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {budget.split.map((item) => (
                                <div key={item.name} className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-4">
                                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BUDGET_COLORS[item.name] }} />
                                        {item.name}
                                    </div>
                                    <p className="mt-2 text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(item.value)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm">
                    <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Emergency Fund</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Current vs target</p>
                    <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-white">
                        {money(emergency.currentFund)}
                    </p>
                    <div className="mt-6 flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
                        <span>Progress</span>
                        <span>{emergency.progress}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${emergency.progress}%` }} />
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Target</p>
                            <p className="mt-2 text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(emergency.targetValue)}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Monthly</p>
                            <p className="mt-2 text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(emergency.monthlyDeposit)}</p>
                        </div>
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6">
                <section className="overflow-hidden bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Bank Accounts</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Synced {accounts.lastSyncedLabel}</p>
                            </div>
                            <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(accounts.totalBalance)}</p>
                        </div>
                    </div>
                    <div className="p-5 sm:p-6 space-y-4">
                        {accounts.rows.map((item) => (
                            <div key={item.name} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                                    <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(item.value)}</p>
                                </div>
                                <div className="mt-4 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-teal-600"
                                        style={{ width: `${(item.value / accountPeak) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-5">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">Portfolio Split</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Largest holdings</p>
                        </div>
                        <p className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(investments.totalValue)}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={investments.portfolios} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={3}>
                                        {investments.portfolios.map((entry, index) => (
                                            <Cell key={entry.name} fill={OVERVIEW_COLORS[index % OVERVIEW_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => money(value)} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="space-y-3">
                            {investments.portfolios.map((item, index) => (
                                <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 p-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: OVERVIEW_COLORS[index % OVERVIEW_COLORS.length] }} />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                                    </div>
                                    <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">{money(item.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
