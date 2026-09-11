import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import axios from 'axios'
import { Calculator, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceDot,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import BlurredValue from '../../components/BlurredValue'
import {
    PAPER_CHART,
    PaperCard,
    paperBackLink,
    paperBtnPrimary,
    paperEyebrow,
    paperField,
    paperIconBtn,
    paperMoney,
    paperMoneyTone,
    paperTableHead,
    paperTableRow,
    paperTitle,
} from '../../components/appUi'
import { useAuth } from '../../context/AuthContext'
import { getRaSummary } from '../../investments-v2/api'
import { formatCurrency } from '../../utils/numberFormatting'

const fieldInputReadonly = `${paperField} cursor-not-allowed bg-[var(--paper-canvas)]/50`

function InfoHint({ label, description }) {
    return (
        <button
            type="button"
            className={paperIconBtn}
            aria-label={`${label}: ${description}`}
            title={description}
        >
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
    )
}

function GrowthChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2 shadow-sm">
            <p className="text-xs text-[var(--paper-muted)]">Year {label}</p>
            <p className={`mt-0.5 text-sm ${paperMoney} text-[var(--paper-ink)]`}>
                {formatCurrency(payload[0].value)}
            </p>
        </div>
    )
}

function scenarioColumnClass(index, isCurrent = false) {
    const base = 'border-l border-[var(--paper-line)] px-3 py-3 text-center tabular-nums sm:px-4'
    if (isCurrent) return `${base} bg-[var(--paper-canvas)]/70`
    if (index % 2 === 1) return `${base} bg-[var(--paper-canvas)]/30`
    return base
}

function scenarioHeaderClass(index, isCurrent = false) {
    const base =
        'border-l border-[var(--paper-line)] px-3 py-3 text-center text-sm font-semibold text-[var(--paper-ink)] sm:px-4'
    if (isCurrent) return `${base} bg-[var(--paper-canvas)]/70`
    if (index % 2 === 1) return `${base} bg-[var(--paper-canvas)]/30`
    return base
}

function sumSuggestedMonthly(accounts) {
    if (!accounts?.length) return 0
    const values = accounts
        .map((row) => row.suggested_monthly_from_debit_order)
        .filter((value) => value != null)
    if (values.length === 0) return 0
    return values.reduce((sum, value) => sum + value, 0)
}

export default function InvestmentsV2RaCalculator() {
    const { blurSensitiveValues } = useAuth()
    const location = useLocation()
    const fromAccountId = location.state?.fromAccountId
    const backTo = fromAccountId ? `/investments/${fromAccountId}` : '/investments'
    const backLabel = fromAccountId ? 'Back to account' : 'Back to Investments'

    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const hasLoadedData = useRef(false)
    const [hasUserEdited, setHasUserEdited] = useState(false)
    const [salary, setSalary] = useState(0)
    const [monthlyRAContribution, setMonthlyRAContribution] = useState(0)
    const [currentRAValue, setCurrentRAValue] = useState(0)
    const [raSummary, setRaSummary] = useState(null)
    const [raSummaryError, setRaSummaryError] = useState(null)
    const [age, setAge] = useState(30)
    const [calculationResult, setCalculationResult] = useState(null)
    const [calculating, setCalculating] = useState(false)
    const [showJumpToResults, setShowJumpToResults] = useState(false)
    const resultsSectionRef = useRef(null)
    const calculationRequestId = useRef(0)

    const monthlyRAContributionRef = useRef(monthlyRAContribution)
    useEffect(() => {
        monthlyRAContributionRef.current = monthlyRAContribution
    }, [monthlyRAContribution])

    const fetchUserData = async () => {
        try {
            const [salaryRes, raRes, raSummaryRes] = await Promise.allSettled([
                axios.get('/api/salary'),
                axios.get('/api/ra/default_user'),
                getRaSummary(),
            ])

            if (salaryRes.status === 'fulfilled' && salaryRes.value?.data) {
                const data = salaryRes.value.data
                if (data.gross_income !== undefined) {
                    setSalary(parseFloat(data.gross_income) || 0)
                }
                if (data.age !== undefined) {
                    setAge(parseInt(data.age) || 30)
                }
            } else {
                setSalary(0)
                setAge(30)
                if (salaryRes.status === 'rejected') {
                    console.error('Failed to fetch salary data', salaryRes.reason)
                }
            }

            let summary = null
            if (raSummaryRes.status === 'fulfilled') {
                summary = raSummaryRes.value
                setRaSummary(summary)
                setRaSummaryError(null)
                setCurrentRAValue(summary?.total_value ?? 0)
            } else {
                setRaSummary(null)
                setRaSummaryError(
                    raSummaryRes.reason?.message || 'Failed to load RA summary',
                )
                setCurrentRAValue(0)
                console.error('Failed to fetch RA summary', raSummaryRes.reason)
            }

            if (raRes.status === 'fulfilled' && raRes.value?.data) {
                const data = raRes.value.data
                let loadedRAContribution = data?.monthly_contribution ?? 0
                if (loadedRAContribution === 0 && summary?.accounts?.length) {
                    loadedRAContribution = sumSuggestedMonthly(summary.accounts)
                }
                setMonthlyRAContribution(loadedRAContribution)
                monthlyRAContributionRef.current = loadedRAContribution
            } else {
                const fallbackMonthly = summary?.accounts?.length
                    ? sumSuggestedMonthly(summary.accounts)
                    : 0
                setMonthlyRAContribution(fallbackMonthly)
                monthlyRAContributionRef.current = fallbackMonthly
                if (raRes.status === 'rejected') {
                    console.error('Failed to fetch RA contribution preference', raRes.reason)
                }
            }

            hasLoadedData.current = true
        } catch (err) {
            console.error('Failed to fetch user data', err)
            hasLoadedData.current = true
        } finally {
            setLoading(false)
        }
    }

    const saveRAData = useCallback(async () => {
        if (!hasLoadedData.current) return
        if (loading) return

        const latestRAContribution = monthlyRAContributionRef.current

        setIsSaving(true)
        try {
            await axios.post('/api/ra/default_user', {
                monthly_contribution: latestRAContribution ?? 0,
            })
        } catch (err) {
            console.error('Failed to save RA data', err)
        } finally {
            setIsSaving(false)
        }
    }, [loading])

    const currentFinancialYearStart = useMemo(() => {
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()
        return month >= 3 ? year : year - 1
    }, [])

    const statutoryRaAnnualCap = currentFinancialYearStart >= 2026 ? 430000 : 350000

    const maxMonthlyRAContribution = useMemo(() => {
        if (salary <= 0) return 0
        const resultSalary = Number(calculationResult?.monthly_salary)
        const resultMatchesSalary =
            calculationResult?.ra_max_deduction != null &&
            Number.isFinite(resultSalary) &&
            Math.abs(resultSalary - salary) < 0.005
        if (resultMatchesSalary) {
            return calculationResult.ra_max_deduction / 12
        }
        return Math.min(salary * 12 * 0.275, statutoryRaAnnualCap) / 12
    }, [salary, calculationResult, statutoryRaAnnualCap])

    const calculateRATax = useCallback(async () => {
        if (salary <= 0) return

        const requestId = calculationRequestId.current + 1
        calculationRequestId.current = requestId
        setCalculating(true)
        try {
            const res = await axios.post('/api/calculate/ra-tax', {
                salary: parseFloat(salary || 0).toFixed(2),
                age: age || 30,
                monthly_ra_contribution: monthlyRAContribution || 0,
                financial_year_start: currentFinancialYearStart,
            })
            if (requestId !== calculationRequestId.current) return
            setCalculationResult(res.data)
        } catch (err) {
            if (requestId !== calculationRequestId.current) return
            console.error('Failed to calculate RA tax', err)
        } finally {
            if (requestId === calculationRequestId.current) {
                setCalculating(false)
            }
        }
    }, [salary, age, monthlyRAContribution, currentFinancialYearStart])

    const updateSalary = useCallback((value) => {
        const numValue = parseFloat(value)
        setSalary(Number.isFinite(numValue) && numValue >= 0 ? numValue : 0)
    }, [])

    const updateMonthlyRAContribution = useCallback((value) => {
        setHasUserEdited(true)
        const numValue = parseFloat(value) || 0
        monthlyRAContributionRef.current = numValue
        setMonthlyRAContribution(numValue)
    }, [])

    useEffect(() => {
        fetchUserData()
    }, [])

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        if (!calculationResult || !resultsSectionRef.current) return
        const el = resultsSectionRef.current
        const observer = new IntersectionObserver(
            ([entry]) => {
                setShowJumpToResults(!entry.isIntersecting)
            },
            { threshold: 0.1, rootMargin: '-50px 0px 0px 0px' },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [calculationResult])

    useEffect(() => {
        if (!hasLoadedData.current) return
        if (!hasUserEdited) return
        if (loading) return

        const timer = setTimeout(() => {
            saveRAData()
        }, 1000)

        return () => clearTimeout(timer)
    }, [monthlyRAContribution, loading, saveRAData, hasUserEdited])

    useEffect(() => {
        if (salary <= 0 || monthlyRAContribution < 0) return

        const timer = setTimeout(() => {
            calculateRATax()
        }, 400)

        return () => clearTimeout(timer)
    }, [salary, monthlyRAContribution, calculateRATax])

    const calculateRAGrowth = (currentValue, monthlyContribution, annualReturn = 0.055) => {
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1
        const currentDay = now.getDate()
        const endYear = 2060
        const years = endYear - currentYear + 1

        const data = []
        let value = currentValue

        for (let i = 0; i < years; i++) {
            const year = currentYear + i
            let monthsToAdd = 12

            if (i === 0) {
                if (currentDay >= 1) {
                    monthsToAdd = 12 - currentMonth
                } else {
                    monthsToAdd = 12 - currentMonth + 1
                }
            }

            value = value * (1 + annualReturn) + monthlyContribution * monthsToAdd
            data.push({
                year,
                value: Math.round(value),
            })
        }

        return data
    }

    const isRAContributionValid =
        maxMonthlyRAContribution === 0 || monthlyRAContribution <= maxMonthlyRAContribution

    const growthData = useMemo(() => {
        if (currentRAValue > 0 || monthlyRAContribution > 0) {
            return calculateRAGrowth(currentRAValue, monthlyRAContribution)
        }
        return []
    }, [currentRAValue, monthlyRAContribution])

    const raAccounts = raSummary?.accounts ?? []
    const fyLabel = raSummary?.financial_year_label ?? ''
    const fyDeposits = raSummary?.contributions_current_fy ?? 0
    const remainingRoom = raSummary?.remaining_room
    const currentScenario = calculationResult?.scenarios?.[0]

    if (loading) {
        return (
            <div className="mx-auto flex h-64 max-w-[1080px] items-center justify-center text-[var(--paper-muted)]">
                Loading...
            </div>
        )
    }

    if (raSummaryError) {
        return (
            <div className="mx-auto max-w-[1080px] space-y-5">
                <Link to={backTo} className={paperBackLink}>
                    <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {backLabel}
                </Link>
                <PaperCard className="px-5 py-4 text-sm text-[var(--paper-brick)]">{raSummaryError}</PaperCard>
            </div>
        )
    }

    if (raSummary && raAccounts.length === 0) {
        return (
            <div className="mx-auto max-w-[1080px] space-y-5">
                <Link to={backTo} className={paperBackLink}>
                    <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {backLabel}
                </Link>
                <PaperCard className="max-w-lg px-6 py-12 text-center">
                    <Calculator className="mx-auto mb-3 h-10 w-10 text-[var(--paper-muted)]" aria-hidden />
                    <p className={paperEyebrow}>Retirement annuity</p>
                    <h1 className={`mt-2 ${paperTitle}`}>RA tax calculator</h1>
                    <p className="mt-3 text-sm text-[var(--paper-muted)]">
                        Mark a connected account as Retirement annuity to use this calculator.
                    </p>
                    <Link
                        to="/investments"
                        className="mt-6 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--paper-accent)] hover:text-[var(--paper-ink)]"
                    >
                        Go to Investments
                    </Link>
                </PaperCard>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-[1080px] space-y-6">
            <Link to={backTo} className={paperBackLink}>
                <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                {backLabel}
            </Link>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className={paperEyebrow}>Retirement annuity</p>
                    <h1 className={paperTitle}>RA tax calculator</h1>
                </div>
                <p
                    className="inline-flex min-h-[40px] items-center gap-2 self-start rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)]/50 px-3 py-1.5 text-sm text-[var(--paper-muted)] sm:self-auto"
                    aria-live="polite"
                >
                    <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            isSaving ? 'bg-[var(--paper-accent)]' : 'bg-[var(--paper-olive)]'
                        }`}
                        aria-hidden="true"
                    />
                    {isSaving ? 'Saving…' : 'All changes saved'}
                </p>
            </div>

            <PaperCard className="p-5 sm:p-6">
                <p className={paperEyebrow}>Input details</p>
                <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
                    <div className="min-w-0 space-y-1.5">
                        <label
                            htmlFor="ra-calc-salary"
                            className="block text-sm font-medium text-[var(--paper-ink)]"
                        >
                            Monthly gross salary
                        </label>
                        <BlurredValue as="div" className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--paper-muted)]">
                                R
                            </span>
                            <input
                                id="ra-calc-salary"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="1"
                                value={salary}
                                onChange={(e) => updateSalary(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className={`${paperField} pl-8`}
                                placeholder="0"
                            />
                        </BlurredValue>
                        <p className="text-xs leading-relaxed text-[var(--paper-muted)]">
                            Prefills from your latest payslip. Change it to model a different salary.
                        </p>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                        <label
                            htmlFor="ra-calc-value"
                            className="block text-sm font-medium text-[var(--paper-ink)]"
                        >
                            Current RA value
                        </label>
                        <BlurredValue as="div">
                            <input
                                id="ra-calc-value"
                                type="text"
                                value={formatCurrency(currentRAValue)}
                                readOnly
                                className={fieldInputReadonly}
                                placeholder="0"
                            />
                        </BlurredValue>
                        <div className="space-y-1 text-xs leading-relaxed text-[var(--paper-muted)]">
                            {raAccounts.length > 1 && (
                                <p className="break-words">{raAccounts.map((account) => account.name).join(', ')}</p>
                            )}
                            <p>Total across RA accounts in Investments.</p>
                            <p className="tabular-nums">
                                FY deposits ({fyLabel}):{' '}
                                <BlurredValue as="span">{formatCurrency(fyDeposits)}</BlurredValue>
                                {' · '}
                                {remainingRoom != null ? (
                                    <>
                                        Remaining room:{' '}
                                        <BlurredValue as="span">{formatCurrency(remainingRoom)}</BlurredValue>
                                    </>
                                ) : (
                                    <Link
                                        to="/salary"
                                        className="cursor-pointer text-[var(--paper-accent)] transition-colors duration-200 hover:text-[var(--paper-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20"
                                    >
                                        Add salary to see remaining room
                                    </Link>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="min-w-0 space-y-1.5">
                        <label
                            htmlFor="ra-calc-contribution"
                            className="block text-sm font-medium text-[var(--paper-ink)]"
                        >
                            Monthly RA contribution
                        </label>
                        <BlurredValue as="div" className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--paper-muted)]">
                                R
                            </span>
                            <input
                                id="ra-calc-contribution"
                                type="number"
                                inputMode="decimal"
                                value={monthlyRAContribution}
                                onChange={(e) => updateMonthlyRAContribution(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className={`${paperField} pl-8 ${
                                    monthlyRAContribution > 0 && !isRAContributionValid
                                        ? 'border-[var(--paper-brick)] focus:ring-[var(--paper-brick)]/20'
                                        : ''
                                }`}
                                placeholder="0"
                            />
                        </BlurredValue>
                        {monthlyRAContribution > 0 && maxMonthlyRAContribution > 0 && !isRAContributionValid ? (
                            <p className="text-xs leading-relaxed text-[var(--paper-brick)]">
                                Maximum monthly contribution is{' '}
                                <BlurredValue>{formatCurrency(maxMonthlyRAContribution)}</BlurredValue>
                            </p>
                        ) : (
                            <p className="text-xs leading-relaxed text-[var(--paper-muted)]">
                                Editable — saved automatically when you change it.
                            </p>
                        )}
                    </div>
                </div>
            </PaperCard>

            {calculationResult && (
                <div ref={resultsSectionRef} className="space-y-6">
                    <PaperCard id="calculator-result" className="scroll-mt-24 p-5 sm:p-6">
                        <p className={paperEyebrow}>Calculator result</p>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)]/40 p-4">
                                <p className="text-xs font-medium uppercase tracking-wider text-[var(--paper-muted)]">
                                    Income tax (annual)
                                </p>
                                <p className={`mt-2 text-2xl sm:text-3xl ${paperMoney} ${paperMoneyTone(-1)}`}>
                                    <BlurredValue>{formatCurrency(calculationResult.base_tax_annual)}</BlurredValue>
                                </p>
                                <p className="mt-2 text-xs leading-relaxed text-[var(--paper-muted)]">
                                    Before RA deductions, on{' '}
                                    <BlurredValue>{formatCurrency(calculationResult.monthly_salary)}</BlurredValue>
                                    /mo (
                                    <BlurredValue>{formatCurrency(calculationResult.annual_salary)}</BlurredValue>
                                    /yr).
                                </p>
                            </div>
                            <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)]/40 p-4">
                                <p className="text-xs font-medium uppercase tracking-wider text-[var(--paper-muted)]">
                                    Tax saved (current contribution)
                                </p>
                                <p className={`mt-2 text-2xl sm:text-3xl ${paperMoney} ${paperMoneyTone(1)}`}>
                                    <BlurredValue>
                                        {formatCurrency(currentScenario?.tax_saved_annual ?? 0)}
                                    </BlurredValue>
                                </p>
                                <p className="mt-2 text-xs leading-relaxed text-[var(--paper-muted)]">
                                    <BlurredValue>
                                        {formatCurrency(currentScenario?.tax_saved_monthly ?? 0)}
                                    </BlurredValue>{' '}
                                    per month back in your pocket — compare scenarios below.
                                </p>
                            </div>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-[var(--paper-muted)]">
                            Your RA contribution can lower taxable income and increase your potential tax refund.
                        </p>
                    </PaperCard>

                    <PaperCard className="overflow-hidden p-4 sm:p-6">
                        <p className={paperEyebrow}>Contribution scenarios</p>
                        <div className="mb-3 mt-3 flex items-center gap-2 sm:hidden">
                            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
                            <p className="text-xs text-[var(--paper-muted)]">
                                Swipe horizontally to see all scenarios
                            </p>
                        </div>
                        <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 sm:-mx-6 sm:px-6">
                            <table className="w-full min-w-[720px] border-collapse text-sm">
                                <thead className="sticky top-0 z-10 bg-[var(--paper-card)]">
                                    <tr className={paperTableHead}>
                                        <th className="sticky left-0 z-20 min-w-[180px] bg-[var(--paper-card)] py-2.5 pr-4 text-left">
                                            &nbsp;
                                        </th>
                                        {calculationResult.scenarios.map((scenario, index) => (
                                            <th
                                                key={index}
                                                scope="col"
                                                className={scenarioHeaderClass(index, index === 0)}
                                            >
                                                <span className="block">{scenario.label}</span>
                                                {index === 0 && (
                                                    <span className="mt-1 block text-[10px] font-normal uppercase tracking-wider text-[var(--paper-muted)]">
                                                        Your plan
                                                    </span>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className={paperTableRow}>
                                        <th scope="row" className="sticky left-0 z-[1] bg-[var(--paper-card)] py-3 pr-4 text-left font-normal text-[var(--paper-ink)]">
                                            <div className="flex items-center gap-1">
                                                <span>Net income (monthly)</span>
                                                <InfoHint
                                                    label="Net income"
                                                    description="Take-home pay after tax and UIF, before RA contributions."
                                                />
                                            </div>
                                        </th>
                                        {calculationResult.scenarios.map((scenario, index) => (
                                            <td key={index} className={scenarioColumnClass(index, index === 0)}>
                                                <BlurredValue>{formatCurrency(calculationResult.net_income_monthly)}</BlurredValue>
                                            </td>
                                        ))}
                                    </tr>

                                    <tr className={paperTableRow}>
                                        <th scope="row" className="sticky left-0 z-[1] bg-[var(--paper-card)] py-3 pr-4 text-left font-normal text-[var(--paper-ink)]">
                                            RA contributions
                                        </th>
                                        {calculationResult.scenarios.map((scenario, index) => (
                                            <td key={index} className={`${scenarioColumnClass(index, index === 0)} leading-relaxed`}>
                                                <BlurredValue>
                                                    {formatCurrency(scenario.ra_contribution_annual)} yr /{' '}
                                                    {formatCurrency(scenario.ra_contribution_monthly)} mo
                                                </BlurredValue>
                                            </td>
                                        ))}
                                    </tr>

                                    <tr className={paperTableRow}>
                                        <th scope="row" className="sticky left-0 z-[1] bg-[var(--paper-card)] py-3 pr-4 text-left font-normal text-[var(--paper-ink)]">
                                            <div className="flex items-center gap-1">
                                                <span>Adjusted income (monthly)</span>
                                                <InfoHint
                                                    label="Adjusted income"
                                                    description="Take-home pay after RA deductions and revised tax."
                                                />
                                            </div>
                                        </th>
                                        {calculationResult.scenarios.map((scenario, index) => (
                                            <td key={index} className={scenarioColumnClass(index, index === 0)}>
                                                <BlurredValue>{formatCurrency(scenario.adjusted_income_monthly)}</BlurredValue>
                                            </td>
                                        ))}
                                    </tr>

                                    <tr className={paperTableRow}>
                                        <th scope="row" className="sticky left-0 z-[1] bg-[var(--paper-card)] py-3 pr-4 text-left font-normal text-[var(--paper-ink)]">
                                            Income tax (annual)
                                        </th>
                                        {calculationResult.scenarios.map((scenario, index) => (
                                            <td
                                                key={index}
                                                className={`${scenarioColumnClass(index, index === 0)} ${paperMoney} ${paperMoneyTone(-1)}`}
                                            >
                                                <BlurredValue>{formatCurrency(scenario.income_tax_annual)}</BlurredValue>
                                            </td>
                                        ))}
                                    </tr>

                                    <tr className={paperTableRow}>
                                        <th scope="row" className="sticky left-0 z-[1] bg-[var(--paper-card)] py-3 pr-4 text-left font-normal text-[var(--paper-ink)]">
                                            <div className="flex items-center gap-1">
                                                <span>Potential tax saved (annual)</span>
                                                <InfoHint
                                                    label="Tax saved annually"
                                                    description="Difference between base tax and tax after RA deduction."
                                                />
                                            </div>
                                        </th>
                                        {calculationResult.scenarios.map((scenario, index) => (
                                            <td
                                                key={index}
                                                className={`${scenarioColumnClass(index, index === 0)} ${paperMoney} ${paperMoneyTone(1)}`}
                                            >
                                                <BlurredValue>{formatCurrency(scenario.tax_saved_annual)}</BlurredValue>
                                            </td>
                                        ))}
                                    </tr>

                                    <tr className={paperTableRow}>
                                        <th scope="row" className="sticky left-0 z-[1] bg-[var(--paper-card)] py-3 pr-4 text-left font-normal text-[var(--paper-ink)]">
                                            <div className="flex items-center gap-1">
                                                <span>Potential tax saved (monthly)</span>
                                                <InfoHint
                                                    label="Tax saved monthly"
                                                    description="Annual tax saving divided by twelve."
                                                />
                                            </div>
                                        </th>
                                        {calculationResult.scenarios.map((scenario, index) => (
                                            <td
                                                key={index}
                                                className={`${scenarioColumnClass(index, index === 0)} ${paperMoney} ${paperMoneyTone(1)}`}
                                            >
                                                <BlurredValue>{formatCurrency(scenario.tax_saved_monthly)}</BlurredValue>
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </PaperCard>

                    {growthData.length > 0 && (
                        <PaperCard
                            className={`p-4 sm:p-6 ${
                                blurSensitiveValues ? 'blur-[5px] select-none' : ''
                            }`}
                        >
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                                <p className={paperEyebrow}>RA growth projection</p>
                                <div className="flex items-center gap-2 text-xs text-[var(--paper-muted)]">
                                    <span
                                        className="inline-block h-2 w-4 rounded-sm"
                                        style={{ backgroundColor: PAPER_CHART.olive }}
                                        aria-hidden="true"
                                    />
                                    Projected RA value
                                </div>
                            </div>
                            <div className="mt-3 h-[260px] min-w-0 w-full sm:h-[320px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart
                                        data={growthData}
                                        margin={{ top: 8, right: 8, left: isMobile ? 4 : 12, bottom: 4 }}
                                    >
                                        <defs>
                                            <linearGradient id="raGrowthFill" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={PAPER_CHART.olive} stopOpacity={0.35} />
                                                <stop offset="95%" stopColor={PAPER_CHART.olive} stopOpacity={0.03} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--paper-line)" vertical={false} />
                                        <XAxis
                                            dataKey="year"
                                            stroke="var(--paper-muted)"
                                            tick={{ fill: 'var(--paper-muted)', fontSize: isMobile ? 10 : 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            interval="preserveStartEnd"
                                            minTickGap={isMobile ? 24 : 32}
                                        />
                                        <YAxis
                                            stroke="var(--paper-muted)"
                                            width={isMobile ? 48 : 56}
                                            tick={{ fill: 'var(--paper-muted)', fontSize: isMobile ? 10 : 11 }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={4}
                                            tickFormatter={(value) => {
                                                if (value >= 1000000) {
                                                    return `R${(value / 1000000).toFixed(1)}M`
                                                }
                                                if (value >= 1000) {
                                                    return `R${(value / 1000).toFixed(0)}K`
                                                }
                                                return `R${value}`
                                            }}
                                        />
                                        <Tooltip
                                            content={<GrowthChartTooltip />}
                                            cursor={{ stroke: 'var(--paper-line)', strokeWidth: 1 }}
                                            wrapperStyle={{ outline: 'none' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke={PAPER_CHART.olive}
                                            fill="url(#raGrowthFill)"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            dot={false}
                                            activeDot={{ r: 4, fill: PAPER_CHART.olive, stroke: 'var(--paper-card)', strokeWidth: 2 }}
                                            isAnimationActive={false}
                                            name="Projected RA value"
                                        />
                                        {growthData[0] && (
                                            <ReferenceDot
                                                x={growthData[0].year}
                                                y={growthData[0].value}
                                                r={4}
                                                fill={PAPER_CHART.umber}
                                                stroke="var(--paper-card)"
                                                strokeWidth={2}
                                                isFront
                                            />
                                        )}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            {growthData[0] && (
                                <p className="mt-2 text-xs text-[var(--paper-muted)]">
                                    Today:{' '}
                                    <BlurredValue as="span" className={`${paperMoney} text-[var(--paper-ink)]`}>
                                        {formatCurrency(growthData[0].value)}
                                    </BlurredValue>
                                </p>
                            )}
                            <p className="mt-2 text-xs leading-relaxed text-[var(--paper-muted)]">
                                Assumes net return of 5.5% after tax and inflation. Projection only — actual returns
                                may vary.
                            </p>
                        </PaperCard>
                    )}

                    <PaperCard className="p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
                            <div className="min-w-0 text-sm">
                                <p className="font-semibold text-[var(--paper-ink)]">About RA tax benefits</p>
                                <ul className="mt-2 space-y-2 text-[var(--paper-muted)]">
                                    <li className="flex gap-2 leading-relaxed">
                                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--paper-line)]" aria-hidden="true" />
                                        <span>
                                            RA contributions are tax deductible up to 27.5% of your earnings or{' '}
                                            <BlurredValue>
                                                {calculationResult?.ra_max_deduction
                                                    ? formatCurrency(calculationResult.ra_max_deduction, {
                                                          minimumFractionDigits: 0,
                                                          maximumFractionDigits: 0,
                                                      })
                                                    : 'R350,000'}
                                            </BlurredValue>{' '}
                                            per year (whichever is lower).
                                        </span>
                                    </li>
                                    <li className="flex gap-2 leading-relaxed">
                                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--paper-line)]" aria-hidden="true" />
                                        <span>The higher your RA contributions, the higher your potential tax refund.</span>
                                    </li>
                                    <li className="flex gap-2 leading-relaxed">
                                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--paper-line)]" aria-hidden="true" />
                                        <span>
                                            Growth on your RA money is tax-free (no tax on interest, dividends, or
                                            capital gains).
                                        </span>
                                    </li>
                                    <li className="flex gap-2 leading-relaxed">
                                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--paper-line)]" aria-hidden="true" />
                                        <span>
                                            At retirement, you can take up to 1/3 of your RA as a lump sum with lower
                                            tax rates.
                                        </span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </PaperCard>
                </div>
            )}

            {calculating && (
                <div className="text-center text-[var(--paper-muted)]">Calculating…</div>
            )}

            {showJumpToResults && (
                <button
                    type="button"
                    onClick={() => {
                        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        document.getElementById('calculator-result')?.scrollIntoView({
                            behavior: reduceMotion ? 'auto' : 'smooth',
                            block: 'start',
                        })
                    }}
                    className={`${paperBtnPrimary} fixed bottom-4 right-4 z-50 shadow-lg`}
                >
                    Jump to results
                </button>
            )}
        </div>
    )
}
