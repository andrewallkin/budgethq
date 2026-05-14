import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { ArrowUpRight, Landmark, LayoutDashboard, PieChart as PieChartIcon, Shield, Wallet } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import BlurredValue from '../components/BlurredValue'
import { computeEffectiveEmergencyFund, getEmergencyFundAccount } from '../utils/emergencyFundSource'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'

const BUDGET_COLORS = {
    Needs: '#B91C1C',
    Wants: '#1D4ED8',
    Savings: '#15803D',
    Unallocated: '#B45309',
}

const OVERVIEW_COLORS = ['#0D9488', '#2563EB', '#16A34A', '#F59E0B', '#7C3AED']

const CARD_ACCENTS = {
    blue: {
        bar: 'from-blue-500 to-indigo-600',
        icon: 'bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300',
    },
    emerald: {
        bar: 'from-emerald-500 to-teal-600',
        icon: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300',
    },
    amber: {
        bar: 'from-amber-500 to-orange-600',
        icon: 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300',
    },
    teal: {
        bar: 'from-teal-500 to-cyan-600',
        icon: 'bg-teal-50 text-teal-700 dark:bg-teal-900/25 dark:text-teal-300',
    },
}

/** Matches dense budget tile height on md+ so all four overview tiles align to one size */
const OVERVIEW_TILE_LINK_CLASS =
    'group relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all md:min-h-[284px]'

const emptyOverview = {
    budget: {
        netIncome: 0,
        grossSalary: null,
        totalNeeds: 0,
        totalWants: 0,
        totalSavings: 0,
        remaining: 0,
        periodLabel: null,
    },
    investments: {
        totalValue: null,
        baseCurrency: 'ZAR',
        fx: null,
        portfolios: [],
    },
    emergency: {
        currentFund: 0,
        monthlyDeposit: 0,
        targetValue: null,
        progress: null,
    },
    accounts: {
        investecTotal: 0,
        manualTotal: 0,
        totalBalance: 0,
        count: 0,
        lastSynced: null,
    },
}

const sumAmounts = (items = []) => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

const formatCompactCurrency = (value, currency = 'ZAR') =>
    formatCurrency(value, {
        currency,
        notation: Math.abs(Number(value) || 0) >= 1000000 ? 'compact' : 'standard',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

const getEmergencyProgressColor = (progress) => {
    if (progress >= 100) return 'bg-green-600'
    if (progress >= 75) return 'bg-yellow-500'
    return 'bg-blue-600'
}

export default function HomeOverview() {
    const [loading, setLoading] = useState(true)
    const [overview, setOverview] = useState(emptyOverview)
    const [error, setError] = useState('')

    useEffect(() => {
        const fetchOverview = async () => {
            setLoading(true)
            setError('')

            const safeGet = async (url) => {
                try {
                    const response = await axios.get(url)
                    return response.data
                } catch {
                    return null
                }
            }

            const [
                budgetData,
                periodData,
                payslipData,
                investmentsData,
                emergencyData,
                credentialsData,
                investecAccountsData,
                manualAccountsData,
            ] = await Promise.all([
                safeGet('/api/budget/default_user'),
                safeGet('/api/budget/period/current'),
                safeGet('/api/payslip/latest'),
                safeGet('/api/investments'),
                safeGet('/api/emergency-savings/default_user'),
                safeGet('/api/investec/credentials/status'),
                safeGet('/api/investec/accounts'),
                safeGet('/api/manual-accounts'),
            ])

            const needs = budgetData?.needs || []
            const wants = budgetData?.wants || []
            const savings = budgetData?.savings || []
            const netIncome = Number(budgetData?.salary) || 0
            const totalNeeds = sumAmounts(needs)
            const totalWants = sumAmounts(wants)
            const totalSavings = sumAmounts(savings)
            const remaining = netIncome - totalNeeds - totalWants - totalSavings

            const grossSalary =
                payslipData?.gross_salary != null && payslipData.gross_salary !== ''
                    ? Number(payslipData.gross_salary)
                    : null

            const startDay = budgetData?.budget_period_start_day ?? 1
            const periodLabel =
                startDay !== 1 && periodData?.from_date && periodData?.to_date
                    ? `${formatDateSafe(periodData.from_date, { day: 'numeric', month: 'short' })} - ${formatDateSafe(periodData.to_date, { day: 'numeric', month: 'short' })}`
                    : null

            const investecAccounts = Array.isArray(investecAccountsData) ? investecAccountsData : []
            const manualAccounts = Array.isArray(manualAccountsData) ? manualAccountsData : []
            const hasInvestecCredentials = Boolean(credentialsData?.is_connected)
            const emergencyAccount = hasInvestecCredentials ? getEmergencyFundAccount(investecAccounts) : null
            const currentFund = computeEffectiveEmergencyFund({
                fundSource: emergencyData?.fund_source || 'manual',
                fundSourceManualValue: emergencyData?.current_fund ?? 0,
                bankSyncBalance: emergencyAccount?.available_balance,
                manualAccounts,
            })
            const targetValue =
                emergencyData?.target_type === 'custom'
                    ? emergencyData?.target_value ?? null
                    : emergencyData?.target_months
                        ? totalNeeds * emergencyData.target_months
                        : emergencyData?.target_value ?? null
            const progress = targetValue > 0 ? (currentFund / targetValue) * 100 : null

            const activeInvestecAccounts = investecAccounts.filter((account) => account.is_active !== false)
            const investecTotal = activeInvestecAccounts.reduce((sum, account) => sum + (Number(account.current_balance) || 0), 0)
            const manualTotal = manualAccounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0)
            const lastSynced = activeInvestecAccounts.reduce((latest, account) => {
                if (!account.last_synced) return latest
                const accountDate = new Date(account.last_synced)
                return !latest || accountDate > latest ? accountDate : latest
            }, null)

            setOverview({
                budget: {
                    netIncome,
                    grossSalary: Number.isFinite(grossSalary) ? grossSalary : null,
                    totalNeeds,
                    totalWants,
                    totalSavings,
                    remaining,
                    periodLabel,
                },
                investments: {
                    totalValue:
                        typeof investmentsData?.total_value_base_currency === 'number'
                            ? investmentsData.total_value_base_currency
                            : null,
                    baseCurrency: investmentsData?.base_currency || 'ZAR',
                    fx: investmentsData?.fx || null,
                    portfolios: investmentsData?.portfolios || [],
                },
                emergency: {
                    currentFund,
                    monthlyDeposit: Number(emergencyData?.monthly_deposit) || 0,
                    targetValue,
                    progress,
                },
                accounts: {
                    investecTotal,
                    manualTotal,
                    totalBalance: investecTotal + manualTotal,
                    count: activeInvestecAccounts.length + manualAccounts.length,
                    lastSynced,
                },
            })

            if (!budgetData && !investmentsData && !emergencyData && !manualAccountsData && !investecAccountsData) {
                setError('Some overview data could not be loaded.')
            }
            setLoading(false)
        }

        fetchOverview()
    }, [])

    const budgetChartData = [
        { name: 'Needs', value: overview.budget.totalNeeds },
        { name: 'Wants', value: overview.budget.totalWants },
        { name: 'Savings', value: overview.budget.totalSavings },
        { name: 'Unallocated', value: Math.max(0, overview.budget.remaining) },
    ].filter((item) => item.value > 0)

    const accountChartData = [
        {
            name: 'Investec',
            value: overview.accounts.investecTotal,
            barClass: 'bg-gradient-to-r from-teal-500 to-cyan-500',
            tileClass: 'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800/60',
            dotClass: 'bg-teal-500',
        },
        {
            name: 'Manual',
            value: overview.accounts.manualTotal,
            barClass: 'bg-gradient-to-r from-blue-500 to-indigo-500',
            tileClass: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/60',
            dotClass: 'bg-blue-500',
        },
    ].filter((item) => item.value > 0)
    const accountPeakValue = Math.max(...accountChartData.map((item) => item.value), 0)

    const portfolioBaseValue = (portfolio) => {
        const value = Number(portfolio.total_value) || 0
        const currency = portfolio.currency_code || 'ZAR'
        if (currency === overview.investments.baseCurrency) return value

        const rate = overview.investments.fx?.rates?.[currency]
        return typeof rate === 'number' ? value * rate : value
    }

    const sortedPortfolios = [...overview.investments.portfolios]
        .filter((portfolio) => portfolioBaseValue(portfolio) > 0)
        .sort((a, b) => portfolioBaseValue(b) - portfolioBaseValue(a))
    const topPortfolios = sortedPortfolios.slice(0, 4).map((portfolio) => ({
        name: portfolio.name,
        value: portfolioBaseValue(portfolio),
    }))
    const otherPortfolioValue = sortedPortfolios
        .slice(4)
        .reduce((sum, portfolio) => sum + portfolioBaseValue(portfolio), 0)
    const portfolioChartData = otherPortfolioValue > 0
        ? [...topPortfolios, { name: 'Other', value: otherPortfolioValue }]
        : topPortfolios

    const metricCards = [
        {
            title: 'Investments',
            value: overview.investments.totalValue,
            currency: overview.investments.baseCurrency,
            meta: `${overview.investments.portfolios.length} portfolios`,
            to: '/investments',
            icon: PieChartIcon,
            accent: 'emerald',
        },
        {
            title: 'Emergency',
            value: overview.emergency.currentFund,
            meta: overview.emergency.progress == null ? 'No target set' : `${Math.round(overview.emergency.progress)}% funded`,
            to: '/emergency-savings',
            icon: Shield,
            accent: 'amber',
        },
        {
            title: 'Accounts',
            value: overview.accounts.totalBalance,
            meta: `${overview.accounts.count} accounts`,
            to: '/investec/accounts',
            icon: Landmark,
            accent: 'teal',
        },
    ]

    const zarCurrencyTooltip = (value) =>
        formatCurrency(value, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    const baseCurrencyTooltip = (value) =>
        formatCurrency(value, {
            currency: overview.investments.baseCurrency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })

    const totalBudgeted =
        overview.budget.totalNeeds + overview.budget.totalWants + overview.budget.totalSavings

    return (
        <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto">
            <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Home</p>
                <h1 className="mt-1 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Financial Overview</h1>
                {loading && (
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Updating overview...</p>
                )}
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                    {error}
                </div>
            )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <Link to="/budget" className={OVERVIEW_TILE_LINK_CLASS}>
                    <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${CARD_ACCENTS.blue.bar}`} />
                    <div className="flex items-start justify-between gap-4">
                        <div className={`p-3 rounded-xl ${CARD_ACCENTS.blue.icon}`}>
                            <LayoutDashboard className="w-6 h-6" />
                        </div>
                        <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors shrink-0" />
                    </div>
                    <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Salary</p>
                        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            <div className="min-w-0">
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">Gross (payslip) </span>
                                <BlurredValue>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                                        {overview.budget.grossSalary != null
                                            ? formatCompactCurrency(overview.budget.grossSalary)
                                            : '—'}
                                    </span>
                                </BlurredValue>
                                {overview.budget.grossSalary == null && (
                                    <span className="text-[10px] text-gray-500 dark:text-gray-400"> · Payslip & Tax</span>
                                )}
                            </div>
                            <div className="min-w-0 sm:border-l border-gray-200/80 dark:border-gray-600 sm:pl-4">
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">Net (budget) </span>
                                <BlurredValue>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                                        {formatCompactCurrency(overview.budget.netIncome)}
                                    </span>
                                </BlurredValue>
                            </div>
                        </div>
                    </div>
                    <div className="mt-3 flex min-h-0 flex-1 flex-col">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Budget</p>
                        <BlurredValue>
                            <p className="mt-1.5 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                                {formatCompactCurrency(totalBudgeted)}
                            </p>
                        </BlurredValue>
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                            {loading ? '…' : overview.budget.periodLabel || 'Current snapshot'}
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Unallocated</span>
                            <BlurredValue>
                                <span
                                    className={`text-xs font-semibold tabular-nums ${overview.budget.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}
                                >
                                    {overview.budget.remaining >= 0 ? 'Left ' : 'Over '}
                                    {formatCompactCurrency(Math.abs(overview.budget.remaining))}
                                </span>
                            </BlurredValue>
                        </div>
                    </div>
                </Link>
                {metricCards.map((card) => {
                    const Icon = card.icon
                    const displayValue = card.value == null
                        ? 'Not set'
                        : formatCompactCurrency(Math.abs(card.value), card.currency || 'ZAR')

                    return (
                        <Link key={card.title} to={card.to} className={OVERVIEW_TILE_LINK_CLASS}>
                            <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${CARD_ACCENTS[card.accent].bar}`} />
                            <div className="flex items-start justify-between gap-4">
                                <div className={`p-3 rounded-xl ${CARD_ACCENTS[card.accent].icon}`}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors" />
                            </div>
                            <div className="mt-6 flex min-h-0 flex-1 flex-col">
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.title}</p>
                                <BlurredValue>
                                    <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                                        {displayValue}
                                    </p>
                                </BlurredValue>
                                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{card.meta}</p>
                            </div>
                        </Link>
                    )
                })}
                </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 sm:gap-6">
                <section className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-5">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Budget Split</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Needs, wants, savings</p>
                        </div>
                        <BlurredValue>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">
                                {formatCompactCurrency(overview.budget.netIncome)}
                            </p>
                        </BlurredValue>
                    </div>
                    {budgetChartData.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={budgetChartData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>
                                            {budgetChartData.map((entry) => (
                                                <Cell key={entry.name} fill={BUDGET_COLORS[entry.name]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={zarCurrencyTooltip} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {budgetChartData.map((item) => (
                                    <div key={item.name} className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-4">
                                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BUDGET_COLORS[item.name] }} />
                                            {item.name}
                                        </div>
                                        <BlurredValue>
                                            <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                                                {formatCompactCurrency(item.value)}
                                            </p>
                                        </BlurredValue>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="h-72 flex items-center justify-center text-gray-500 dark:text-gray-400">Add budget data to see your split.</div>
                    )}
                </section>

                <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Emergency Fund</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Current vs target</p>
                        </div>
                        <Wallet className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <BlurredValue>
                        <p className="text-4xl font-bold text-gray-900 dark:text-white">
                            {formatCompactCurrency(overview.emergency.currentFund)}
                        </p>
                    </BlurredValue>
                    <div className="mt-6">
                        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
                            <span>Progress</span>
                            <span>{overview.emergency.progress == null ? 'No target' : `${Math.round(overview.emergency.progress)}%`}</span>
                        </div>
                        <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${getEmergencyProgressColor(overview.emergency.progress)}`}
                                style={{ width: `${Math.min(100, overview.emergency.progress ?? 0)}%` }}
                            />
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Target</p>
                            <BlurredValue>
                                <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                                    {overview.emergency.targetValue ? formatCompactCurrency(overview.emergency.targetValue) : 'Not set'}
                                </p>
                            </BlurredValue>
                        </div>
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/50 p-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Monthly</p>
                            <BlurredValue>
                                <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">
                                    {formatCompactCurrency(overview.emergency.monthlyDeposit)}
                                </p>
                            </BlurredValue>
                        </div>
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6">
                <section className="overflow-hidden bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-br from-slate-50 to-teal-50 dark:from-gray-800 dark:to-teal-950/30">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Bank Accounts</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {overview.accounts.lastSynced ? `Synced ${formatDateSafe(overview.accounts.lastSynced.toISOString(), { day: 'numeric', month: 'short' })}` : 'Investec and manual'}
                                </p>
                            </div>
                            <BlurredValue>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {formatCompactCurrency(overview.accounts.totalBalance)}
                                </p>
                            </BlurredValue>
                        </div>
                    </div>

                    <div className="p-5 sm:p-6">
                        {accountChartData.length > 0 ? (
                            <div className="space-y-4">
                                {accountChartData.map((item) => {
                                    const percentOfTotal = overview.accounts.totalBalance > 0
                                        ? (item.value / overview.accounts.totalBalance) * 100
                                        : 0
                                    const relativeWidth = accountPeakValue > 0
                                        ? Math.max(12, (item.value / accountPeakValue) * 100)
                                        : 0

                                    return (
                                        <div key={item.name} className={`rounded-2xl border p-4 ${item.tileClass}`}>
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <span className={`h-3 w-3 rounded-full ${item.dotClass}`} />
                                                    <div>
                                                        <p className="font-semibold text-gray-900 dark:text-white">{item.name}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">{Math.round(percentOfTotal)}% of total</p>
                                                    </div>
                                                </div>
                                                <BlurredValue>
                                                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                                                        {formatCompactCurrency(item.value)}
                                                    </p>
                                                </BlurredValue>
                                            </div>
                                            <div className="mt-4 h-3 rounded-full bg-white/80 dark:bg-gray-950/50 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${item.barClass}`}
                                                    style={{ width: `${relativeWidth}%` }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="h-56 flex items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                                No accounts loaded yet.
                            </div>
                        )}
                    </div>
                </section>

                <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-5">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Portfolio Split</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Largest holdings</p>
                        </div>
                        <BlurredValue>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">
                                {overview.investments.totalValue == null
                                    ? 'Not set'
                                    : formatCompactCurrency(overview.investments.totalValue, overview.investments.baseCurrency)}
                            </p>
                        </BlurredValue>
                    </div>
                    {portfolioChartData.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={portfolioChartData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={3}>
                                            {portfolioChartData.map((entry, index) => (
                                                <Cell key={entry.name} fill={OVERVIEW_COLORS[index % OVERVIEW_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={baseCurrencyTooltip} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-3">
                                {portfolioChartData.map((item, index) => (
                                    <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 p-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: OVERVIEW_COLORS[index % OVERVIEW_COLORS.length] }} />
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                                        </div>
                                        <BlurredValue>
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                                {formatCompactCurrency(item.value, overview.investments.baseCurrency)}
                                            </span>
                                        </BlurredValue>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="h-72 flex items-center justify-center text-gray-500 dark:text-gray-400">No portfolio values yet.</div>
                    )}
                </section>
            </div>
        </div>
    )
}
