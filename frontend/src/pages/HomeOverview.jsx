import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import BlurredValue from '../components/BlurredValue'
import { computeEffectiveEmergencyFund, getEmergencyFundAccount } from '../utils/emergencyFundSource'
import { SHOW_EMERGENCY_SAVINGS_UI } from '../config/featureFlags'
import { formatCurrency, formatDateSafe, formatPercent } from '../utils/numberFormatting'
import { CATEGORY_LABELS } from '../utils/transactionCategories'
import { summarizeAccountBalances } from '../utils/accountBalances'
import { additionalIncomeTotal, hasAdditionalIncome, payslipMonthLabel } from '../utils/payslipBudget'
import {
    AllocationRow,
    PAPER_BUDGET_COLORS,
    PaperCard,
    paperDivider,
    paperEyebrow,
    paperMoney,
    paperMoneyTone,
    paperTitle,
} from '../components/appUi'

const emptyOverview = {
    budget: {
        netIncome: 0,
        grossSalary: null,
        totalNeeds: 0,
        totalWants: 0,
        totalSavings: 0,
        remaining: 0,
        periodLabel: null,
        payslipNet: null,
        paye: null,
        payslipLabel: null,
        additionalIncome: 0,
        hasAdditional: false,
        salarySkippedAdditional: false,
        salaryPayslipLabel: null,
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
        cashTotal: 0,
        liabilityTotal: 0,
        count: 0,
        loanCount: 0,
        lastSynced: null,
        items: [],
        loanItems: [],
    },
    recentTransactions: [],
}

const sumAmounts = (items = []) =>
    items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

const formatCompactCurrency = (value, currency = 'ZAR') =>
    formatCurrency(value, {
        currency,
        notation: Math.abs(Number(value) || 0) >= 1000000 ? 'compact' : 'standard',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

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
                transactionsData,
            ] = await Promise.all([
                safeGet('/api/budget/default_user'),
                safeGet('/api/budget/period/current'),
                safeGet('/api/payslip/latest'),
                safeGet('/api/investments'),
                safeGet('/api/emergency-savings/default_user'),
                safeGet('/api/investec/credentials/status'),
                safeGet('/api/investec/accounts'),
                safeGet('/api/manual-accounts'),
                safeGet('/api/investec/transactions?limit=8'),
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

            const payslipNet =
                payslipData?.net_pay != null && payslipData.net_pay !== ''
                    ? Number(payslipData.net_pay)
                    : null
            const paye =
                payslipData?.paye != null && payslipData.paye !== ''
                    ? Number(payslipData.paye)
                    : null
            const additionalIncome = additionalIncomeTotal(payslipData)
            const hasAdditional = hasAdditionalIncome(payslipData)
            const salarySkippedAdditional = Boolean(budgetData?.salary_skipped_additional)
            const salaryPayslipLabel = payslipMonthLabel(
                budgetData?.salary_payslip_year,
                budgetData?.salary_payslip_month,
                formatDateSafe,
            )
            const payslipLabel = payslipData?.year && payslipData?.month
                ? formatDateSafe(`${payslipData.year}-${String(payslipData.month).padStart(2, '0')}-01`, { month: 'short', year: 'numeric' })
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
            const balances = summarizeAccountBalances(investecAccounts, manualAccounts)
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
                    payslipNet: Number.isFinite(payslipNet) ? payslipNet : null,
                    paye: Number.isFinite(paye) ? paye : null,
                    payslipLabel,
                    additionalIncome,
                    hasAdditional,
                    salarySkippedAdditional,
                    salaryPayslipLabel,
                },
                investments: {
                    totalValue:
                        typeof investmentsData?.total_value_base_currency === 'number'
                            ? investmentsData.total_value_base_currency
                            : null,
                    baseCurrency: investmentsData?.base_currency || 'ZAR',
                    fx: investmentsData?.fx || null,
                    portfolios: Array.isArray(investmentsData?.portfolios) ? investmentsData.portfolios : [],
                },
                emergency: {
                    currentFund,
                    monthlyDeposit: Number(emergencyData?.monthly_deposit) || 0,
                    targetValue,
                    progress,
                },
                accounts: {
                    cashTotal: balances.cashTotal,
                    liabilityTotal: balances.liabilityTotal,
                    count: balances.cashAccounts.length,
                    loanCount: balances.loanCount,
                    lastSynced: lastSynced && !Number.isNaN(lastSynced.getTime())
                        ? lastSynced.toISOString()
                        : null,
                    items: balances.cashAccounts,
                    loanItems: balances.loanAccounts,
                },
                recentTransactions: Array.isArray(transactionsData) ? transactionsData.slice(0, 8) : [],
            })

            if (!budgetData && !investmentsData && !emergencyData && !manualAccountsData && !investecAccountsData) {
                setError('Some overview data could not be loaded.')
            }
            setLoading(false)
        }

        fetchOverview()
    }, [])

    const portfolioBaseValue = (portfolio) => {
        const value = Number(portfolio.total_value) || 0
        const currency = portfolio.currency_code || 'ZAR'
        if (currency === overview.investments.baseCurrency) return value

        const rate = overview.investments.fx?.rates?.[currency]
        return typeof rate === 'number' ? value * rate : value
    }

    const sortedPortfolios = [...overview.investments.portfolios]
        .sort((a, b) => portfolioBaseValue(b) - portfolioBaseValue(a))

    const totalBudgeted =
        overview.budget.totalNeeds + overview.budget.totalWants + overview.budget.totalSavings
    const netPay = overview.budget.netIncome
    const isOverBudget = overview.budget.remaining < 0
    const takeHomeShare = overview.budget.hasAdditional
        ? null
        : overview.budget.grossSalary > 0
            ? ((overview.budget.payslipNet ?? netPay) / overview.budget.grossSalary) * 100
            : null
    const invested = overview.investments.totalValue
    const cash = overview.accounts.cashTotal
    const investedForSum = typeof invested === 'number' ? invested : 0
    const netWorth = (Number(cash) || 0) + investedForSum - (Number(overview.accounts.liabilityTotal) || 0)
    const position = (Number(cash) || 0) + investedForSum
    const emergencyPct = overview.emergency.progress == null
        ? null
        : Math.min(100, Math.max(0, overview.emergency.progress))

    const allocation = [
        { name: 'Needs', amount: overview.budget.totalNeeds, color: PAPER_BUDGET_COLORS.Needs },
        { name: 'Wants', amount: overview.budget.totalWants, color: PAPER_BUDGET_COLORS.Wants },
        { name: 'Savings', amount: overview.budget.totalSavings, color: PAPER_BUDGET_COLORS.Savings },
        {
            name: isOverBudget ? 'Over budget' : 'Unallocated',
            amount: Math.abs(overview.budget.remaining),
            color: isOverBudget ? 'var(--paper-brick)' : PAPER_BUDGET_COLORS.Unallocated,
        },
    ]

    const periodText = overview.budget.periodLabel || overview.budget.payslipLabel || 'This period'

    return (
        <div className="mx-auto max-w-[1080px] space-y-8">
            <header className="flex items-end justify-between gap-4">
                <div>
                    <h1 className={paperTitle}>Home</h1>
                    <p className={`mt-1 ${paperEyebrow}`}>{loading ? 'Updating…' : periodText}</p>
                </div>
            </header>

            {error ? (
                <PaperCard className="px-5 py-4 text-sm text-[var(--paper-brick)]">
                    {error}
                </PaperCard>
            ) : null}

            <PaperCard className="overflow-hidden">
                <div className="grid grid-cols-1 divide-y divide-[var(--paper-line)] md:grid-cols-3 md:divide-x md:divide-y-0">
                    <Link to="/salary" className="block cursor-pointer p-5 transition-colors hover:bg-[var(--paper-canvas)]/50 sm:p-6">
                        <p className={paperEyebrow}>Take-home</p>
                        <BlurredValue>
                            <p className={`mt-3 text-3xl text-[var(--paper-ink)] ${paperMoney}`}>
                                {formatCompactCurrency(netPay)}
                            </p>
                        </BlurredValue>
                        <p className="mt-2 text-sm text-[var(--paper-muted)]">
                            {overview.budget.salarySkippedAdditional
                                ? `${overview.budget.salaryPayslipLabel || 'Last normal payslip'} · bonus excluded`
                                : takeHomeShare != null
                                    ? `${formatPercent(takeHomeShare, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} of gross`
                                    : (overview.budget.payslipLabel || 'Latest payslip')}
                        </p>
                    </Link>
                    <Link to="/budget" className="block cursor-pointer p-5 transition-colors hover:bg-[var(--paper-canvas)]/50 sm:p-6">
                        <p className={paperEyebrow}>{isOverBudget ? 'Over budget' : 'Unallocated'}</p>
                        <BlurredValue>
                            <p className={`mt-3 text-3xl ${paperMoney} ${isOverBudget ? paperMoneyTone(-1) : 'text-[var(--paper-ink)]'}`}>
                                {formatCompactCurrency(Math.abs(overview.budget.remaining))}
                            </p>
                        </BlurredValue>
                        <p className="mt-2 text-sm text-[var(--paper-muted)]">
                            {formatCompactCurrency(totalBudgeted)} of {formatCompactCurrency(netPay)} budgeted
                        </p>
                    </Link>
                    <div className="p-5 sm:p-6">
                        <p className={paperEyebrow}>Cash and investments</p>
                        <BlurredValue>
                            <p className={`mt-3 text-3xl text-[var(--paper-ink)] ${paperMoney}`}>
                                {invested == null && cash === 0 ? '—' : formatCompactCurrency(position, overview.investments.baseCurrency)}
                            </p>
                        </BlurredValue>
                        <p className="mt-2 text-sm text-[var(--paper-muted)]">
                            {formatCompactCurrency(cash)} cash
                            {invested != null ? ` · ${formatCompactCurrency(invested, overview.investments.baseCurrency)} invested` : ''}
                        </p>
                    </div>
                </div>
            </PaperCard>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <PaperCard className="p-5 sm:p-6">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Budget</h2>
                        <Link to="/budget" className="cursor-pointer text-sm text-[var(--paper-muted)] hover:text-[var(--paper-ink)]">
                            Open
                        </Link>
                    </div>
                    {netPay > 0 || totalBudgeted > 0 ? (
                        <div className={`mt-2 ${paperDivider}`}>
                            {allocation.map((row) => (
                                <AllocationRow
                                    key={row.name}
                                    label={row.name}
                                    amount={row.amount}
                                    total={Math.max(netPay, totalBudgeted)}
                                    color={row.color}
                                    hint={netPay > 0 ? formatPercent((row.amount / netPay) * 100, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : null}
                                    display={<BlurredValue>{formatCompactCurrency(row.amount)}</BlurredValue>}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="mt-6 text-sm text-[var(--paper-muted)]">Add a budget to see how net pay is split.</p>
                    )}
                </PaperCard>

                <PaperCard className="p-5 sm:p-6">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Payslip</h2>
                        <Link to="/salary" className="cursor-pointer text-sm text-[var(--paper-muted)] hover:text-[var(--paper-ink)]">
                            Open
                        </Link>
                    </div>
                    <div className={`mt-2 ${paperDivider}`}>
                        <MetaRow
                            label="Gross"
                            value={<BlurredValue>{overview.budget.grossSalary != null ? formatCompactCurrency(overview.budget.grossSalary) : '—'}</BlurredValue>}
                        />
                        {overview.budget.hasAdditional ? (
                            <MetaRow
                                label="Additional"
                                hint="Not in monthly budget"
                                value={<BlurredValue>{formatCompactCurrency(overview.budget.additionalIncome)}</BlurredValue>}
                            />
                        ) : null}
                        <MetaRow
                            label="PAYE"
                            value={<BlurredValue>{overview.budget.paye != null ? formatCompactCurrency(overview.budget.paye) : '—'}</BlurredValue>}
                        />
                        <MetaRow
                            label="Paid this month"
                            hint={overview.budget.hasAdditional ? null : (takeHomeShare != null ? formatPercent(takeHomeShare, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' take-home' : null)}
                            value={<BlurredValue>{formatCompactCurrency(overview.budget.payslipNet ?? netPay)}</BlurredValue>}
                        />
                        {overview.budget.salarySkippedAdditional ? (
                            <MetaRow
                                label="For the budget"
                                hint={overview.budget.salaryPayslipLabel ? `${overview.budget.salaryPayslipLabel} take-home` : 'Last payslip without a bonus'}
                                value={<BlurredValue>{formatCompactCurrency(netPay)}</BlurredValue>}
                            />
                        ) : null}
                    </div>
                </PaperCard>
            </div>

            <div className={`grid grid-cols-1 gap-6 ${SHOW_EMERGENCY_SAVINGS_UI ? 'lg:grid-cols-2' : ''}`}>
                <PaperCard className="p-5 sm:p-6">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Net worth</h2>
                        <div className="flex gap-4 text-sm text-[var(--paper-muted)]">
                            <Link to="/investec/accounts" className="cursor-pointer hover:text-[var(--paper-ink)]">Accounts</Link>
                            <Link to="/investments" className="cursor-pointer hover:text-[var(--paper-ink)]">Investments</Link>
                        </div>
                    </div>
                    <BlurredValue>
                        <p className={`mt-4 text-3xl ${paperMoney} ${paperMoneyTone(netWorth)}`}>
                            {formatCompactCurrency(netWorth)}
                        </p>
                    </BlurredValue>
                    <div className={`mt-2 ${paperDivider}`}>
                        <MetaRow
                            label="Cash"
                            hint={
                                overview.accounts.count
                                    ? `${overview.accounts.count} account${overview.accounts.count === 1 ? '' : 's'}`
                                    : null
                            }
                            value={<BlurredValue>{formatCompactCurrency(cash)}</BlurredValue>}
                        />
                        {overview.accounts.items.length > 0 ? (
                            <HoldingLines
                                items={overview.accounts.items.map((account) => ({
                                    key: account.id,
                                    name: account.name,
                                    display: formatCompactCurrency(account.value),
                                }))}
                            />
                        ) : (
                            <p className="py-2 pl-4 text-[13px] text-[var(--paper-muted)]">No bank accounts yet.</p>
                        )}
                        <MetaRow
                            label="Invested"
                            hint={overview.investments.portfolios.length ? `${overview.investments.portfolios.length} portfolios` : null}
                            value={(
                                <BlurredValue>
                                    {invested == null
                                        ? 'Not set'
                                        : formatCompactCurrency(invested, overview.investments.baseCurrency)}
                                </BlurredValue>
                            )}
                        />
                        {sortedPortfolios.length > 0 ? (
                            <HoldingLines
                                items={sortedPortfolios.map((portfolio) => ({
                                    key: portfolio.id ?? portfolio.slug ?? portfolio.name,
                                    name: portfolio.name,
                                    display: formatCompactCurrency(
                                        portfolioBaseValue(portfolio),
                                        overview.investments.baseCurrency,
                                    ),
                                }))}
                            />
                        ) : (
                            <p className="py-2 pl-4 text-[13px] text-[var(--paper-muted)]">No portfolio values yet.</p>
                        )}
                        <MetaRow
                            label="Liabilities"
                            hint={
                                overview.accounts.loanCount > 0
                                    ? `${overview.accounts.loanCount} loan${overview.accounts.loanCount === 1 ? '' : 's'}`
                                    : null
                            }
                            value={(
                                <BlurredValue>
                                    <span className="text-[var(--paper-brick)]">
                                        {formatCompactCurrency(overview.accounts.liabilityTotal)}
                                    </span>
                                </BlurredValue>
                            )}
                        />
                        {overview.accounts.loanItems.length > 0 ? (
                            <HoldingLines
                                valueClassName="text-[var(--paper-brick)]"
                                items={overview.accounts.loanItems.map((account) => ({
                                    key: account.id,
                                    name: account.name,
                                    display: formatCompactCurrency(account.value),
                                }))}
                            />
                        ) : null}
                    </div>
                </PaperCard>

                {SHOW_EMERGENCY_SAVINGS_UI ? (
                    <Link to="/emergency-savings" className="paper-card block cursor-pointer p-5 transition-colors hover:bg-[var(--paper-canvas)]/40 sm:p-6">
                        <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Emergency fund</h2>
                        <BlurredValue>
                            <p className={`mt-4 text-3xl text-[var(--paper-ink)] ${paperMoney}`}>
                                {formatCompactCurrency(overview.emergency.currentFund)}
                            </p>
                        </BlurredValue>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--paper-line)]" aria-hidden="true">
                            <div
                                className="h-full rounded-full bg-[var(--paper-olive)]"
                                style={{ width: `${emergencyPct ?? 0}%` }}
                            />
                        </div>
                        <p className="mt-3 text-sm text-[var(--paper-muted)]">
                            {overview.emergency.targetValue
                                ? `${emergencyPct == null ? '—' : Math.round(overview.emergency.progress)}% of ${formatCompactCurrency(overview.emergency.targetValue)}`
                                : 'No target set'}
                            {overview.emergency.monthlyDeposit
                                ? ` · ${formatCompactCurrency(overview.emergency.monthlyDeposit)} / month`
                                : ''}
                        </p>
                    </Link>
                ) : null}
            </div>

            <PaperCard className="p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Recent activity</h2>
                    <Link to="/investec/transactions" className="cursor-pointer text-sm text-[var(--paper-muted)] hover:text-[var(--paper-ink)]">
                        View all
                    </Link>
                </div>
                {overview.recentTransactions.length > 0 ? (
                    <ul className={`mt-2 ${paperDivider}`}>
                        {overview.recentTransactions.map((txn) => {
                            const isCredit = txn.transaction_type === 'CREDIT'
                            const signedAmount = isCredit ? Math.abs(Number(txn.amount) || 0) : -Math.abs(Number(txn.amount) || 0)
                            const categoryKey = txn.category || 'uncategorized'
                            const categoryLabel = CATEGORY_LABELS[categoryKey] || 'Uncategorized'
                            const dateLabel = formatDateSafe(txn.transaction_date, { day: 'numeric', month: 'short' })

                            return (
                                <li key={txn.id} className="grid grid-cols-[4.25rem_1fr_auto] items-baseline gap-4 py-3">
                                    <p className="text-xs tabular-nums text-[var(--paper-muted)]">{dateLabel}</p>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm text-[var(--paper-ink)]">{txn.description || 'Transaction'}</p>
                                        <p className="mt-0.5 text-xs text-[var(--paper-muted)]">{categoryLabel}</p>
                                    </div>
                                    <BlurredValue>
                                        <p className={`text-right text-sm font-medium tabular-nums ${paperMoneyTone(signedAmount)}`}>
                                            {signedAmount > 0 ? '+' : ''}
                                            {formatCompactCurrency(signedAmount)}
                                        </p>
                                    </BlurredValue>
                                </li>
                            )
                        })}
                    </ul>
                ) : (
                    <p className="mt-6 text-sm text-[var(--paper-muted)]">No transactions loaded yet.</p>
                )}
            </PaperCard>
        </div>
    )
}

function HoldingLines({ items, valueClassName = 'text-[var(--paper-ink)]' }) {
    return items.map((item) => (
        <div key={item.key} className="flex items-baseline justify-between gap-4 py-2 pl-4">
            <p className="truncate text-[13px] text-[var(--paper-muted)]">{item.name}</p>
            <BlurredValue>
                <p className={`text-[13px] font-normal tabular-nums ${valueClassName}`}>{item.display}</p>
            </BlurredValue>
        </div>
    ))
}

function MetaRow({ label, hint, value }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-3">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--paper-ink)]">{label}</p>
                {hint ? <p className="mt-0.5 text-xs font-normal text-[var(--paper-muted)]">{hint}</p> : null}
            </div>
            <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-[var(--paper-ink)]">{value}</p>
        </div>
    )
}
