import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import axios from 'axios'
import { Calculator, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import BlurredValue from '../../components/BlurredValue'
import { useAuth } from '../../context/AuthContext'
import { getRaSummary } from '../../investments-v2/api'
import { formatCurrency } from '../../utils/numberFormatting'

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
    const backTo = fromAccountId ? `/investments-v2/${fromAccountId}` : '/investments-v2'
    const backLabel = fromAccountId ? 'Back to account' : 'Back to Investments 2.0'

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

    const maxMonthlyRAContribution = useMemo(() => {
        if (salary <= 0) return 0
        const annualSalary = salary * 12
        const raCapFromAPI = calculationResult?.ra_max_deduction ?? null
        const annualCap = raCapFromAPI !== null ? raCapFromAPI : Math.min(annualSalary * 0.275, 350000)
        return annualCap / 12
    }, [salary, calculationResult])

    const calculateRATax = useCallback(async () => {
        if (salary <= 0) return

        setCalculating(true)
        try {
            const res = await axios.post('/api/calculate/ra-tax', {
                salary: parseFloat(salary || 0).toFixed(2),
                age: age || 30,
                monthly_ra_contribution: monthlyRAContribution || 0,
                financial_year_start: currentFinancialYearStart,
            })
            setCalculationResult(res.data)
        } catch (err) {
            console.error('Failed to calculate RA tax', err)
        } finally {
            setCalculating(false)
        }
    }, [salary, age, monthlyRAContribution, currentFinancialYearStart])

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
        if (salary > 0 && monthlyRAContribution >= 0) {
            if (maxMonthlyRAContribution > 0 && monthlyRAContribution > maxMonthlyRAContribution) {
                return
            }
            calculateRATax()
        }
    }, [salary, age, monthlyRAContribution, maxMonthlyRAContribution, calculateRATax])

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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600 dark:text-gray-400">Loading...</div>
            </div>
        )
    }

    if (raSummaryError) {
        return (
            <div className="space-y-6">
                <Link
                    to={backTo}
                    className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline w-fit"
                >
                    <ChevronLeft className="w-4 h-4 shrink-0" />
                    {backLabel}
                </Link>
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                    {raSummaryError}
                </p>
            </div>
        )
    }

    if (raSummary && raAccounts.length === 0) {
        return (
            <div className="space-y-6">
                <Link
                    to={backTo}
                    className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline w-fit"
                >
                    <ChevronLeft className="w-4 h-4 shrink-0" />
                    {backLabel}
                </Link>
                <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800/50 px-6 py-12 text-center max-w-lg">
                    <Calculator className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" aria-hidden />
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">RA tax calculator</h1>
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                        Mark a connected account as Retirement annuity to use this calculator.
                    </p>
                    <Link
                        to="/investments-v2"
                        className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline"
                    >
                        Go to Investments 2.0
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <Link
                to={backTo}
                className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline w-fit"
            >
                <ChevronLeft className="w-4 h-4 shrink-0" />
                {backLabel}
            </Link>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                    RA tax calculator
                </h1>
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {isSaving ? 'Saving...' : 'All changes saved'}
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Input Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                            Monthly Gross Salary (R)
                        </label>
                        <BlurredValue as="div">
                            <input
                                type="text"
                                value={formatCurrency(salary)}
                                readOnly
                                className="w-full min-h-[44px] px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed"
                            />
                        </BlurredValue>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            From your latest payslip (gross + company contributions + additional income)
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                            Current RA Value (R)
                        </label>
                        <BlurredValue as="div">
                            <input
                                type="text"
                                value={formatCurrency(currentRAValue)}
                                readOnly
                                className="w-full min-h-[44px] px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed"
                                placeholder="0"
                            />
                        </BlurredValue>
                        {raAccounts.length > 1 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {raAccounts.map((account) => account.name).join(', ')}
                            </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Total across RA accounts in Investments 2.0
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
                            FY deposits ({fyLabel}):{' '}
                            <BlurredValue as="span">{formatCurrency(fyDeposits)}</BlurredValue>
                            {' · '}
                            {remainingRoom != null ? (
                                <>
                                    Remaining room:{' '}
                                    <BlurredValue as="span">{formatCurrency(remainingRoom)}</BlurredValue>
                                </>
                            ) : (
                                <Link to="/salary" className="text-teal-700 dark:text-teal-300 hover:underline">
                                    Add salary to see remaining room
                                </Link>
                            )}
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                            Monthly RA Contribution (R)
                        </label>
                        <BlurredValue as="div" className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none">
                                R
                            </span>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={monthlyRAContribution}
                                onChange={(e) => updateMonthlyRAContribution(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className={`w-full min-h-[44px] pl-8 pr-3 py-3 border rounded-lg focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors ${
                                    monthlyRAContribution > 0 && !isRAContributionValid
                                        ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                                        : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                                }`}
                                placeholder="0"
                            />
                        </BlurredValue>
                        {monthlyRAContribution > 0 && maxMonthlyRAContribution > 0 && !isRAContributionValid && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Please provide a valid monthly contribution. Maximum monthly contribution is{' '}
                                <BlurredValue>{formatCurrency(maxMonthlyRAContribution)}</BlurredValue>
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {calculationResult && (
                <div ref={resultsSectionRef} className="space-y-6">
                    <div
                        id="calculator-result"
                        className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 scroll-mt-24 pb-8"
                    >
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                            Calculator Result
                        </h2>
                        <p className="text-gray-700 dark:text-gray-200 mb-2 tabular-nums">
                            On a salary of{' '}
                            <BlurredValue>{formatCurrency(calculationResult.monthly_salary)}</BlurredValue> per month,{' '}
                            <BlurredValue>{formatCurrency(calculationResult.annual_salary)}</BlurredValue> per year,
                            you can expect to pay{' '}
                            <BlurredValue>
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                    {formatCurrency(calculationResult.base_tax_annual)}
                                </span>
                            </BlurredValue>{' '}
                            in income tax per year.
                        </p>
                        <p className="text-gray-700 dark:text-gray-200">
                            Here is how your contribution can lower your income tax and potentially increase your tax
                            refund:
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
                        <div className="flex items-center gap-2 mb-2 sm:hidden">
                            <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Swipe horizontally to see all scenarios
                            </p>
                        </div>
                        <table className="w-full min-w-[800px]">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white"></th>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <th
                                            key={index}
                                            className={`text-center py-3 px-4 font-semibold text-gray-900 dark:text-white border-l border-gray-200 dark:border-gray-600 ${
                                                index % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''
                                            }`}
                                        >
                                            {scenario.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700 dark:text-gray-200">Net income (monthly)</span>
                                            <button
                                                type="button"
                                                className="p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ml-2"
                                                aria-label="More info"
                                            >
                                                <Info className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            </button>
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-3 px-4 text-gray-900 dark:text-white tabular-nums border-l border-gray-200 dark:border-gray-600 ${
                                                index % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''
                                            }`}
                                        >
                                            <BlurredValue>{formatCurrency(calculationResult.net_income_monthly)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-4 px-4 text-gray-700 dark:text-gray-200">RA contributions</td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-4 px-4 text-gray-900 dark:text-white tabular-nums leading-relaxed border-l border-gray-200 dark:border-gray-600 ${
                                                index % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''
                                            }`}
                                        >
                                            <BlurredValue>
                                                {formatCurrency(scenario.ra_contribution_annual)} yr /{' '}
                                                {formatCurrency(scenario.ra_contribution_monthly)} mo
                                            </BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700 dark:text-gray-200">
                                                Adjusted income (monthly)
                                            </span>
                                            <button
                                                type="button"
                                                className="p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ml-2"
                                                aria-label="More info"
                                            >
                                                <Info className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            </button>
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-3 px-4 text-gray-900 dark:text-white tabular-nums border-l border-gray-200 dark:border-gray-600 ${
                                                index % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''
                                            }`}
                                        >
                                            <BlurredValue>{formatCurrency(scenario.adjusted_income_monthly)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4 text-gray-700 dark:text-gray-200">Income tax (annual)</td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-3 px-4 font-semibold text-red-600 dark:text-red-400 tabular-nums border-l border-gray-200 dark:border-gray-600 ${
                                                index % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''
                                            }`}
                                        >
                                            <BlurredValue>{formatCurrency(scenario.income_tax_annual)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700 dark:text-gray-200">
                                                Potential tax saved (annual)
                                            </span>
                                            <button
                                                type="button"
                                                className="p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ml-2"
                                                aria-label="More info"
                                            >
                                                <Info className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            </button>
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-3 px-4 font-semibold text-blue-600 dark:text-blue-400 tabular-nums border-l border-gray-200 dark:border-gray-600 ${
                                                index % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''
                                            }`}
                                        >
                                            <BlurredValue>{formatCurrency(scenario.tax_saved_annual)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                <tr>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700 dark:text-gray-200">
                                                Potential tax saved (monthly)
                                            </span>
                                            <button
                                                type="button"
                                                className="p-2 -m-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 ml-2"
                                                aria-label="More info"
                                            >
                                                <Info className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                            </button>
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-3 px-4 font-semibold text-blue-600 dark:text-blue-400 tabular-nums border-l border-gray-200 dark:border-gray-600 ${
                                                index % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-700/30' : ''
                                            }`}
                                        >
                                            <BlurredValue>{formatCurrency(scenario.tax_saved_monthly)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {growthData.length > 0 && (
                        <div
                            className={`bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 ${
                                blurSensitiveValues ? 'blur-[5px] select-none' : ''
                            }`}
                        >
                            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                                RA Growth Projection
                            </h2>
                            <div className="w-full min-w-0 h-[340px] sm:h-[480px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={growthData}
                                        margin={{ top: 5, right: 10, left: isMobile ? 0 : 30, bottom: 35 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                                        <XAxis
                                            dataKey="year"
                                            stroke="#6b7280"
                                            className="dark:stroke-gray-400"
                                            tick={{ fill: '#6b7280', fontSize: isMobile ? 11 : 12 }}
                                            ticks={
                                                growthData.length > 8
                                                    ? growthData.filter((_, i) => i % 5 === 0).map((d) => d.year)
                                                    : undefined
                                            }
                                            tickFormatter={(value) => {
                                                const year = value
                                                const currentYear = new Date().getFullYear()
                                                const yearsFromNow = year - currentYear
                                                return yearsFromNow % 5 === 0 ? year.toString() : ''
                                            }}
                                            label={{
                                                value: 'Year',
                                                position: 'insideBottom',
                                                offset: -10,
                                                style: { fill: '#6b7280', fontSize: 13 },
                                            }}
                                        />
                                        <YAxis
                                            stroke="#6b7280"
                                            className="dark:stroke-gray-400"
                                            width={isMobile ? 52 : 70}
                                            tick={{ fill: '#6b7280', fontSize: isMobile ? 10 : 12 }}
                                            tickFormatter={(value) => {
                                                if (value >= 1000000) {
                                                    return `R${(value / 1000000).toFixed(1)}M`
                                                }
                                                if (value >= 1000) {
                                                    return `R${(value / 1000).toFixed(0)}K`
                                                }
                                                return `R${value}`
                                            }}
                                            label={
                                                !isMobile
                                                    ? {
                                                          value: 'Portfolio Value (R)',
                                                          angle: -90,
                                                          position: 'insideLeft',
                                                          offset: 15,
                                                          style: {
                                                              fill: '#6b7280',
                                                              fontSize: 13,
                                                              textAnchor: 'middle',
                                                          },
                                                      }
                                                    : undefined
                                            }
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1f2937',
                                                borderColor: '#374151',
                                                color: '#f3f4f6',
                                                borderRadius: '8px',
                                            }}
                                            cursor={{ stroke: '#6b7280', strokeWidth: 1 }}
                                            formatter={(value) => [formatCurrency(value), 'Portfolio Value']}
                                            labelFormatter={(label) => `Year: ${label}`}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 6 }}
                                            isAnimationActive={false}
                                            name="Portfolio Value"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 italic">
                                Assumes net return of 5.5% after tax and inflation. This is a projection and actual
                                returns may vary.
                            </p>
                        </div>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <Calculator className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                            <div className="text-sm text-blue-800 dark:text-blue-200">
                                <p className="font-semibold mb-1">About RA Tax Benefits</p>
                                <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300">
                                    <li>
                                        RA contributions are tax deductible up to 27.5% of your earnings or{' '}
                                        <BlurredValue>
                                            {calculationResult?.ra_max_deduction
                                                ? formatCurrency(calculationResult.ra_max_deduction, {
                                                      minimumFractionDigits: 0,
                                                      maximumFractionDigits: 0,
                                                  })
                                                : 'R350,000'}
                                        </BlurredValue>{' '}
                                        per year (whichever is lower)
                                    </li>
                                    <li>The higher your RA contributions, the higher your potential tax refund</li>
                                    <li>
                                        Growth on your RA money is tax-free (no tax on interest, dividends, or capital
                                        gains)
                                    </li>
                                    <li>
                                        At retirement, you can take up to 1/3 of your RA as a lump sum with lower tax
                                        rates
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {calculating && (
                <div className="text-center text-gray-600 dark:text-gray-400">Calculating...</div>
            )}

            {showJumpToResults && (
                <button
                    type="button"
                    onClick={() =>
                        document.getElementById('calculator-result')?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                        })
                    }
                    className="fixed bottom-4 right-4 z-50 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                >
                    Jump to Results
                </button>
            )}
        </div>
    )
}
