import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Trash2, BarChart2, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDateSafe, formatNumber, formatPercent } from '../utils/numberFormatting'
import BlurredValue from '../components/BlurredValue'
import { BUDGET_TRANSACTION_CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS } from '../utils/transactionCategories'
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

const btnBase = 'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const fieldInput = 'min-h-[40px] w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'

const sanitizeAmount = (value) => value.replace(/,/g, '').replace(/[^\d.]/g, '')

const amountKeyDown = (onEnter) => (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
    if (e.key === 'Enter') onEnter?.(e)
}

export default function BudgetDashboard() {
    const { blurSensitiveValues } = useAuth()
    const [loading, setLoading] = useState(true)
    const [salary, setSalary] = useState(0)
    const [needs, setNeeds] = useState([])
    const [wants, setWants] = useState([])
    const [savings, setSavings] = useState([])

    const [latestPayslip, setLatestPayslip] = useState(null)
    const [salaryPayslipLabel, setSalaryPayslipLabel] = useState(null)
    const [salarySkippedAdditional, setSalarySkippedAdditional] = useState(false)
    const [activeTab, setActiveTab] = useState('needs')

    const [isSaving, setIsSaving] = useState(false)
    const hasLoadedData = useRef(false)
    const [hasUserEdited, setHasUserEdited] = useState(false)

    // TFSA Portfolio data
    const [portfolioTotal, setPortfolioTotal] = useState(0)
    const [portfolioEtfCount, setPortfolioEtfCount] = useState(0)

    // Budget period (for non-calendar periods)
    const [currentPeriodLabel, setCurrentPeriodLabel] = useState(null)

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
            const [budgetRes, portfolioRes, periodRes] = await Promise.all([
                axios.get('/api/budget/default_user'),
                axios.get('/api/portfolio'),
                axios.get('/api/budget/period/current').catch(() => null)
            ])

            if (budgetRes.data && Object.keys(budgetRes.data).length > 0) {
                // Only set salary if it exists and is not null
                setSalary(budgetRes.data.salary ?? 0)
                setSalarySkippedAdditional(Boolean(budgetRes.data.salary_skipped_additional))
                setSalaryPayslipLabel(
                    payslipMonthLabel(
                        budgetRes.data.salary_payslip_year,
                        budgetRes.data.salary_payslip_month,
                        formatDateSafe,
                    )
                )
                setNeeds((budgetRes.data.needs || []).map(item => ({ ...item, transaction_category: item.transaction_category || 'uncategorized', excluded: item.excluded ?? false })))
                setWants((budgetRes.data.wants || []).map(item => ({ ...item, transaction_category: item.transaction_category || 'uncategorized', excluded: item.excluded ?? false })))
                setSavings((budgetRes.data.savings || []).map(item => ({ ...item, transaction_category: item.transaction_category || 'uncategorized', excluded: item.excluded ?? false })))

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

            // Show period label when using non-calendar period
            const startDay = budgetRes.data?.budget_period_start_day ?? 1
            if (startDay !== 1 && periodRes?.data?.from_date && periodRes?.data?.to_date) {
                const from = new Date(periodRes.data.from_date)
                const to = new Date(periodRes.data.to_date)
                const opts = { day: 'numeric', month: 'short', year: 'numeric' }
                setCurrentPeriodLabel(`${from.toLocaleDateString('en-ZA', opts)} – ${to.toLocaleDateString('en-ZA', opts)}`)
            } else {
                setCurrentPeriodLabel(null)
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

    const addCategory = (type, name, amount = 0, transactionCategory = 'uncategorized') => {
        setHasUserEdited(true)
        const newItem = { name, amount, transaction_category: transactionCategory, excluded: false }
        if (type === 'needs') setNeeds([...needs, newItem])
        else if (type === 'wants') setWants([...wants, newItem])
        else setSavings([...savings, newItem])
    }

    const updateCategory = (type, index, field, value) => {
        setHasUserEdited(true)
        const list = type === 'needs' ? needs : type === 'wants' ? wants : savings
        const newList = [...list]
        newList[index][field] = field === 'amount' ? parseFloat(value) || 0 : field === 'excluded' ? Boolean(value) : value

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

    // Calculations (excluded entries still count on dashboard; they are only excluded from Budget Analysis)
    const totalNeeds = needs.reduce((sum, item) => sum + item.amount, 0)
    const totalWants = wants.reduce((sum, item) => sum + item.amount, 0)
    const totalSavings = savings.reduce((sum, item) => sum + item.amount, 0)

    const netIncome = salary // salary is now already the net income
    const hasAdditional = hasAdditionalIncome(latestPayslip)
    const additionalIncome = additionalIncomeTotal(latestPayslip)
    const totalSpent = totalNeeds + totalWants + totalSavings
    const remaining = netIncome - totalSpent
    const isOverBudget = remaining < 0

    // Percentage calculation helper
    const calculatePercentage = (amount, total = netIncome) => {
        if (total === 0) return 0
        return (amount / total) * 100
    }

    const periodTitle = currentPeriodLabel || new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    const remainingPct = netIncome > 0 ? (remaining / netIncome) * 100 : 0
    const pct = (value) =>
        formatPercent(Math.abs(value), { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    const incomeRows = latestPayslip
        ? [
              { label: 'Gross', value: formatCurrency(latestPayslip.gross_salary) },
              ...(hasAdditional
                  ? [{ label: 'Additional income', value: formatCurrency(additionalIncome) }]
                  : []),
              { label: 'PAYE', value: formatCurrency(latestPayslip.paye) },
              { label: 'UIF', value: formatCurrency(latestPayslip.uif_employee_portion) },
          ]
        : []
    const allocatedRows = [
        { label: 'Needs', value: formatCurrency(totalNeeds) },
        { label: 'Wants', value: formatCurrency(totalWants) },
        { label: 'Savings', value: formatCurrency(totalSavings) },
    ]
    const remainingRows =
        netIncome > 0
            ? [
                  { label: 'Share', value: pct(remainingPct) },
                  { label: 'Of', value: 'Net income' },
                  {
                      label: 'Status',
                      value: isOverBudget ? 'Over budget' : remaining === 0 ? 'Fully allocated' : 'Still to allocate',
                  },
              ]
            : []
    const paidThisMonth =
        latestPayslip && Math.abs((latestPayslip.net_pay || 0) - netIncome) > 0.005
            ? latestPayslip.net_pay
            : null

    const allocation = [
        { name: 'Needs', amount: totalNeeds, color: PAPER_BUDGET_COLORS.Needs },
        { name: 'Wants', amount: totalWants, color: PAPER_BUDGET_COLORS.Wants },
        { name: 'Savings', amount: totalSavings, color: PAPER_BUDGET_COLORS.Savings },
        {
            name: isOverBudget ? 'Over budget' : 'Unallocated',
            amount: Math.abs(remaining),
            color: isOverBudget ? 'var(--paper-brick)' : PAPER_BUDGET_COLORS.Unallocated,
        },
    ]

    if (loading) {
        return (
            <div className="mx-auto max-w-[1080px] space-y-8">
                <header>
                    <h1 className={paperTitle}>Budget</h1>
                    <p className={`mt-1 ${paperEyebrow}`}>Loading…</p>
                </header>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-[1080px] space-y-8">
            <header className="flex items-end justify-between gap-4">
                <div>
                    <h1 className={paperTitle}>Budget</h1>
                    <p className={`mt-1 ${paperEyebrow}`}>
                        {periodTitle}
                        {latestPayslip?.company_name ? ` · ${latestPayslip.company_name}` : ''}
                        {latestPayslip?.title ? ` · ${latestPayslip.title}` : ''}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-sm">
                    {isSaving ? (
                        <span className="text-xs text-[var(--paper-muted)]">Saving…</span>
                    ) : null}
                    <Link
                        to="/salary"
                        className="cursor-pointer text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)]"
                    >
                        Payslip
                    </Link>
                </div>
            </header>

            <PaperCard className="overflow-hidden">
                <div className="grid grid-cols-1 divide-y divide-[var(--paper-line)] md:grid-cols-3 md:divide-x md:divide-y-0">
                    <div className="flex flex-col p-5 sm:p-6">
                        <p className={paperEyebrow}>Net income</p>
                        <BlurredValue>
                            <p className={`mt-3 text-3xl text-[var(--paper-ink)] ${paperMoney}`}>
                                {formatCurrency(netIncome)}
                            </p>
                        </BlurredValue>
                        <SummaryMeta rows={incomeRows} />
                        {salarySkippedAdditional && salaryPayslipLabel ? (
                            <p className="mt-1 text-xs text-[var(--paper-muted)]">{salaryPayslipLabel}</p>
                        ) : null}
                    </div>
                    <div className="flex flex-col p-5 sm:p-6">
                        <p className={paperEyebrow}>Allocated</p>
                        <BlurredValue>
                            <p className={`mt-3 text-3xl text-[var(--paper-ink)] ${paperMoney}`}>
                                {formatCurrency(totalSpent)}
                            </p>
                        </BlurredValue>
                        <SummaryMeta rows={allocatedRows} />
                    </div>
                    <div className="flex flex-col p-5 sm:p-6">
                        <p className={paperEyebrow}>{isOverBudget ? 'Over budget' : 'Remaining'}</p>
                        <BlurredValue>
                            <p className={`mt-3 text-3xl ${paperMoney} ${isOverBudget ? paperMoneyTone(-1) : 'text-[var(--paper-ink)]'}`}>
                                {formatCurrency(Math.abs(remaining))}
                            </p>
                        </BlurredValue>
                        <SummaryMeta rows={remainingRows} />
                    </div>
                </div>
            </PaperCard>

            {latestPayslip ? (
                <PaperCard className="p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Income breakdown</h2>
                    <div className={`mt-2 ${paperDivider}`}>
                        <MetaRow
                            label="Gross salary"
                            tone={paperMoneyTone(1)}
                            value={<BlurredValue>{formatCurrency(latestPayslip.gross_salary)}</BlurredValue>}
                        />
                        {hasAdditional ? (
                            <MetaRow
                                label="Additional income"
                                tone={paperMoneyTone(1)}
                                value={<BlurredValue>{formatCurrency(additionalIncome)}</BlurredValue>}
                            />
                        ) : null}
                        <MetaRow
                            label="PAYE"
                            tone={paperMoneyTone(-1)}
                            value={<BlurredValue>{formatCurrency(latestPayslip.paye)}</BlurredValue>}
                        />
                        <MetaRow
                            label="UIF"
                            tone={paperMoneyTone(-1)}
                            value={<BlurredValue>{formatCurrency(latestPayslip.uif_employee_portion)}</BlurredValue>}
                        />
                        {paidThisMonth != null ? (
                            <MetaRow
                                label="Paid this month"
                                value={<BlurredValue>{formatCurrency(paidThisMonth)}</BlurredValue>}
                            />
                        ) : null}
                        <MetaRow
                            label="Net income"
                            hint={salarySkippedAdditional ? salaryPayslipLabel : null}
                            value={<BlurredValue>{formatCurrency(netIncome)}</BlurredValue>}
                        />
                    </div>
                </PaperCard>
            ) : null}

            {netIncome > 0 || totalSpent > 0 ? (
                <PaperCard className={`p-5 sm:p-6 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                    <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Budget split</h2>
                    <p className="mt-1 text-sm text-[var(--paper-muted)]">Share of net income</p>
                    <div className={`mt-2 ${paperDivider}`}>
                        {allocation.map((row) => (
                            <AllocationRow
                                key={row.name}
                                label={row.name}
                                amount={row.amount}
                                total={Math.max(netIncome, totalSpent)}
                                color={row.color}
                                hint={
                                    netIncome > 0
                                        ? formatPercent(calculatePercentage(row.amount), {
                                              minimumFractionDigits: 0,
                                              maximumFractionDigits: 0,
                                          })
                                        : null
                                }
                                display={<BlurredValue>{formatCurrency(row.amount)}</BlurredValue>}
                            />
                        ))}
                    </div>
                </PaperCard>
            ) : null}

            <PaperCard className="p-5 sm:p-6">
                <div className="flex gap-1 rounded-md bg-[var(--paper-canvas)] p-1">
                    {[
                        { id: 'needs', label: 'Needs', total: totalNeeds, color: PAPER_BUDGET_COLORS.Needs },
                        { id: 'wants', label: 'Wants', total: totalWants, color: PAPER_BUDGET_COLORS.Wants },
                        { id: 'savings', label: 'Savings', total: totalSavings, color: PAPER_BUDGET_COLORS.Savings },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex min-h-[48px] flex-1 cursor-pointer flex-col items-start justify-center rounded-md px-4 py-2 text-left transition-colors ${
                                activeTab === tab.id
                                    ? 'bg-[var(--paper-card)] text-[var(--paper-ink)] shadow-sm'
                                    : 'text-[var(--paper-muted)] hover:text-[var(--paper-ink)]'
                            }`}
                        >
                            <span className="flex items-center gap-2 text-sm">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tab.color }} />
                                {tab.label}
                            </span>
                            <span className={`mt-1 text-sm tabular-nums ${paperMoney}`}>
                                <BlurredValue>{formatCurrency(tab.total)}</BlurredValue>
                            </span>
                        </button>
                    ))}
                </div>
                <div className="mt-6">
                    <CategoryList
                        items={activeTab === 'needs' ? needs : activeTab === 'wants' ? wants : savings}
                        netIncome={netIncome}
                        onAdd={(name, amount, transactionCategory) => addCategory(activeTab, name, amount, transactionCategory)}
                        onUpdate={(index, field, val) => updateCategory(activeTab, index, field, val)}
                        onRemove={(index) => removeCategory(activeTab, index)}
                    />
                </div>
            </PaperCard>
        </div>
    )
}

function SummaryMeta({ rows }) {
    if (!rows.length) return null
    return (
        <div className="mt-2 space-y-0.5 text-sm text-[var(--paper-muted)]">
            {rows.map((row) => (
                <p key={row.label} className="flex justify-between gap-3">
                    <span>{row.label}</span>
                    <span className={`min-w-0 truncate text-right tabular-nums ${paperMoney}`}>{row.value}</span>
                </p>
            ))}
        </div>
    )
}

function MetaRow({ label, hint, value, tone }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-3">
            <div className="min-w-0">
                <p className="text-sm text-[var(--paper-muted)]">{label}</p>
                {hint ? <p className="mt-0.5 text-xs text-[var(--paper-muted)]">{hint}</p> : null}
            </div>
            <p className={`shrink-0 text-right text-sm font-medium tabular-nums ${tone || 'text-[var(--paper-ink)]'}`}>{value}</p>
        </div>
    )
}

function QuietMenu({ value, options, labels, onChange, swatchFor, align = 'left' }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return undefined
        const onPointer = (event) => {
            if (ref.current && !ref.current.contains(event.target)) setOpen(false)
        }
        document.addEventListener('mousedown', onPointer)
        return () => document.removeEventListener('mousedown', onPointer)
    }, [open])

    const swatch = swatchFor?.(value)

    return (
        <div className="relative w-[11rem] shrink-0" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="flex w-full cursor-pointer items-center gap-1.5 text-left text-xs text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)]"
            >
                {swatch ? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: swatch }} /> : null}
                <span className="min-w-0 flex-1 truncate">{labels[value] || value}</span>
                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open ? (
                <div
                    className={`absolute z-20 mt-2 max-h-64 min-w-[14rem] overflow-y-auto rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] py-1 shadow-sm ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                >
                    {options.map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => {
                                onChange(option)
                                setOpen(false)
                            }}
                            className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--paper-canvas)] ${
                                option === value
                                    ? 'font-medium text-[var(--paper-ink)]'
                                    : 'text-[var(--paper-muted)]'
                            }`}
                        >
                            {swatchFor ? (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: swatchFor(option) }} />
                            ) : null}
                            {labels[option] || option}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    )
}

const CategoryList = ({ items, netIncome, onAdd, onUpdate, onRemove }) => {
    const [newName, setNewName] = useState('')
    const [newAmount, setNewAmount] = useState('')
    const [newTransactionCategory, setNewTransactionCategory] = useState('uncategorized')

    const calculatePercentage = (amount) => {
        if (netIncome === 0) return 0
        return (amount / netIncome) * 100
    }

    const handleAdd = () => {
        if (newName.trim()) {
            onAdd(newName.trim(), parseFloat(newAmount) || 0, newTransactionCategory)
            setNewName('')
            setNewAmount('')
            setNewTransactionCategory('uncategorized')
        }
    }

    const renderCategoryItem = (item, index) => {
        const percentage = calculatePercentage(item.amount)
        const isExcluded = item.excluded ?? false

        return (
            <div
                key={index}
                className={`group flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:flex-nowrap ${isExcluded ? 'opacity-60' : ''}`}
            >
                <input
                    type="text"
                    value={item.name}
                    onChange={(e) => onUpdate(index, 'name', e.target.value)}
                    className="min-w-0 flex-1 rounded-md border-none bg-transparent px-0 py-1 text-sm font-medium text-[var(--paper-ink)] outline-none transition-all focus:ring-2 focus:ring-[var(--paper-accent)]/20 sm:text-base"
                />
                <QuietMenu
                    value={item.transaction_category || 'uncategorized'}
                    options={BUDGET_TRANSACTION_CATEGORIES}
                    labels={CATEGORY_LABELS}
                    swatchFor={(key) => CATEGORY_COLORS[key] || '#9ca3af'}
                    onChange={(next) => onUpdate(index, 'transaction_category', next)}
                />
                <BlurredValue as="div" className="flex w-28 shrink-0 items-center justify-end gap-1">
                    <span className="text-sm tabular-nums text-[var(--paper-muted)]">R</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={item.amount}
                        placeholder="0"
                        onChange={(e) => onUpdate(index, 'amount', sanitizeAmount(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={amountKeyDown()}
                        className="w-full min-w-0 border-none bg-transparent py-1 text-right text-sm tabular-nums text-[var(--paper-ink)] outline-none sm:text-base"
                    />
                </BlurredValue>
                <span className="w-8 shrink-0 text-right text-xs text-[var(--paper-muted)]">/mo</span>
                <span className="w-14 shrink-0 text-right text-xs text-[var(--paper-muted)]">
                    {isExcluded ? (
                        <span className="text-[var(--paper-accent)]" title="Not compared in Budget Analysis">Excl.</span>
                    ) : (
                        <BlurredValue>({formatNumber(percentage, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)</BlurredValue>
                    )}
                </span>
                <button
                    type="button"
                    onClick={() => onUpdate(index, 'excluded', !isExcluded)}
                    title="Exclude from Budget Analysis (transaction comparison)"
                    className={`cursor-pointer rounded-md p-2 text-[var(--paper-muted)] transition-all sm:opacity-0 sm:group-hover:opacity-100 ${isExcluded ? 'text-[var(--paper-accent)]' : 'hover:text-[var(--paper-ink)]'}`}
                >
                    <BarChart2 className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="cursor-pointer rounded-md p-2 text-[var(--paper-muted)] transition-all hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-brick)] sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Delete item"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        )
    }

    return (
        <div>
            <div className={paperDivider}>
                {items.map((item, index) => renderCategoryItem(item, index))}
                {items.length === 0 ? (
                    <p className="py-6 text-center text-sm text-[var(--paper-muted)]">No categories yet</p>
                ) : null}
            </div>
            <div className="flex flex-col gap-3 border-t border-[var(--paper-line)] pt-4 sm:flex-row sm:items-center">
                <input
                    type="text"
                    placeholder="Category name…"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    className={`${fieldInput} min-w-0 flex-1`}
                />
                <QuietMenu
                    value={newTransactionCategory}
                    options={BUDGET_TRANSACTION_CATEGORIES}
                    labels={CATEGORY_LABELS}
                    swatchFor={(key) => CATEGORY_COLORS[key] || '#9ca3af'}
                    onChange={setNewTransactionCategory}
                />
                <BlurredValue as="div" className="flex w-full items-center gap-1 sm:w-32">
                    <span className="text-sm tabular-nums text-[var(--paper-muted)]">R</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={newAmount}
                        onChange={(e) => setNewAmount(sanitizeAmount(e.target.value))}
                        onKeyDown={amountKeyDown(() => handleAdd())}
                        onFocus={(e) => e.target.select()}
                        className="w-full border-none bg-transparent py-1 text-right text-sm tabular-nums text-[var(--paper-ink)] outline-none"
                    />
                </BlurredValue>
                <button type="button" onClick={handleAdd} className={btnPrimary}>
                    Add
                </button>
            </div>
        </div>
    )
}
