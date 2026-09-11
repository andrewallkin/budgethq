import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { ChevronRight, Info } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import BlurredValue from '../components/BlurredValue'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../utils/numberFormatting'
import {
    CARD_BAND,
    AppCard,
    eyebrowClass,
    OVERVIEW_COLORS,
} from '../components/appUi'

export default function RATaxCalculator() {
    const { blurSensitiveValues } = useAuth()
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const hasLoadedData = useRef(false)
    const [hasUserEdited, setHasUserEdited] = useState(false)
    const [salary, setSalary] = useState(0)
    const [monthlyRAContribution, setMonthlyRAContribution] = useState(0)
    const [currentRAValue, setCurrentRAValue] = useState(0)
    const [age, setAge] = useState(30)
    const [calculationResult, setCalculationResult] = useState(null)
    const [calculating, setCalculating] = useState(false)
    const [showJumpToResults, setShowJumpToResults] = useState(false)
    const resultsSectionRef = useRef(null)

    // Store latest RA contribution in a ref to avoid stale closures in debounced saves
    const monthlyRAContributionRef = useRef(monthlyRAContribution)
    useEffect(() => {
        monthlyRAContributionRef.current = monthlyRAContribution
    }, [monthlyRAContribution])

    const fetchUserData = async () => {
        try {
            // Fetch salary and RA data in parallel so one failure doesn't block the other
            const [salaryRes, raRes] = await Promise.allSettled([
                axios.get('/api/salary'),
                axios.get('/api/ra/default_user'),
            ])

            // Process salary response
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
                    console.error("Failed to fetch salary data", salaryRes.reason)
                }
            }

            // Process RA response
            if (raRes.status === 'fulfilled' && raRes.value?.data) {
                const data = raRes.value.data
                const latestPortfolioValue = data?.latest_portfolio_value
                const loadedRAValue =
                    latestPortfolioValue !== undefined && latestPortfolioValue !== null
                        ? latestPortfolioValue
                        : (data?.current_value ?? 0)
                const loadedRAContribution = data?.monthly_contribution ?? 0

                setCurrentRAValue(loadedRAValue)
                setMonthlyRAContribution(loadedRAContribution)
                monthlyRAContributionRef.current = loadedRAContribution
            } else {
                setCurrentRAValue(0)
                setMonthlyRAContribution(0)
                if (raRes.status === 'rejected') {
                    console.error("Failed to fetch RA data", raRes.reason)
                }
            }

            hasLoadedData.current = true
        } catch (err) {
            console.error("Failed to fetch user data", err)
            hasLoadedData.current = true
        } finally {
            setLoading(false)
        }
    }

    // Save function - saves ONLY the monthly contribution to the RA endpoint
    const saveRAData = useCallback(async () => {
        if (!hasLoadedData.current) {
            console.log('RA: Not saving - data not loaded yet')
            return
        }
        if (loading) {
            console.log('RA: Not saving - still loading')
            return
        }

        const latestRAContribution = monthlyRAContributionRef.current

        console.log('RA: Saving data', {
            monthly_contribution: latestRAContribution
        })

        setIsSaving(true)
        try {
            await axios.post('/api/ra/default_user', {
                monthly_contribution: latestRAContribution ?? 0
            })
            console.log('RA: Save successful')
        } catch (err) {
            console.error("Failed to save RA data", err)
        } finally {
            setIsSaving(false)
        }
    }, [loading])

    // Derive current SA financial year start: March–Feb cycle
    const currentFinancialYearStart = useMemo(() => {
        const now = new Date()
        const month = now.getMonth() + 1 // 1-12
        const year = now.getFullYear()
        return month >= 3 ? year : year - 1
    }, [])

    // Calculate maximum monthly RA contribution using ra_max_deduction from API response
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
                financial_year_start: currentFinancialYearStart
            })
            setCalculationResult(res.data)
        } catch (err) {
            console.error("Failed to calculate RA tax", err)
        } finally {
            setCalculating(false)
        }
    }, [salary, monthlyRAContribution, currentFinancialYearStart])

    // Wrapper function to update contribution state/ref immediately, and mark as edited
    const updateMonthlyRAContribution = useCallback((value) => {
        setHasUserEdited(true)
        const numValue = parseFloat(value) || 0
        monthlyRAContributionRef.current = numValue
        setMonthlyRAContribution(numValue)
    }, [])

    // Load user data on mount
    useEffect(() => {
        fetchUserData()
    }, [])

    // Responsive chart margins for mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Show Jump to Results FAB when results exist and are below viewport
    useEffect(() => {
        if (!calculationResult || !resultsSectionRef.current) return
        const el = resultsSectionRef.current
        const observer = new IntersectionObserver(
            ([entry]) => {
                setShowJumpToResults(!entry.isIntersecting)
            },
            { threshold: 0.1, rootMargin: '-50px 0px 0px 0px' }
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [calculationResult])

    // Auto-save RA monthly contribution - only after user has explicitly edited data
    useEffect(() => {
        if (!hasLoadedData.current) return
        if (!hasUserEdited) return
        if (loading) return

        const timer = setTimeout(() => {
            saveRAData()
        }, 1000)

        return () => clearTimeout(timer)
    }, [monthlyRAContribution, loading, saveRAData, hasUserEdited])

    // Calculate when RA contribution changes (only if valid)
    useEffect(() => {
        if (salary > 0 && monthlyRAContribution >= 0) {
            if (maxMonthlyRAContribution > 0 && monthlyRAContribution > maxMonthlyRAContribution) {
                return
            }
            calculateRATax()
        }
    }, [salary, age, monthlyRAContribution, maxMonthlyRAContribution, calculateRATax])

    // Calculate RA growth projection
    const calculateRAGrowth = (currentValue, monthlyContribution, annualReturn = 0.055) => {
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1 // 1-12
        const currentDay = now.getDate()
        const endYear = 2060
        const years = endYear - currentYear + 1

        const data = []
        let value = currentValue

        for (let i = 0; i < years; i++) {
            const year = currentYear + i
            let monthsToAdd = 12

            // For the first year, only add contributions for remaining months
            if (i === 0) {
                if (currentDay >= 1) {
                    monthsToAdd = 12 - currentMonth
                } else {
                    monthsToAdd = 12 - currentMonth + 1
                }
            }

            // Apply annual return, then add contributions for the calculated months
            value = value * (1 + annualReturn) + (monthlyContribution * monthsToAdd)
            data.push({
                year,
                value: Math.round(value)
            })
        }

        return data
    }

    // Validate monthly RA contribution (only validate if we have a valid max)
    const isRAContributionValid = maxMonthlyRAContribution === 0 || monthlyRAContribution <= maxMonthlyRAContribution

    // Calculate growth data
    const growthData = useMemo(() => {
        if (currentRAValue > 0 || monthlyRAContribution > 0) {
            return calculateRAGrowth(currentRAValue, monthlyRAContribution)
        }
        return []
    }, [currentRAValue, monthlyRAContribution])

    if (loading) {
        return (
            <div className="mx-auto max-w-[1400px] p-8 text-center text-neutral-400">Loading...</div>
        )
    }

    return (
        <div className="mx-auto max-w-[1400px] space-y-5">
            <Link
                to="/investments/ra"
                className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white w-fit"
            >
                Back to RA performance
            </Link>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <p className={eyebrowClass}>Retirement annuity</p>
                    <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
                        Tax calculator
                    </h1>
                </div>
                <div className="text-sm text-neutral-400">
                    {isSaving ? 'Saving...' : 'All changes saved'}
                </div>
            </div>

            <AppCard band={CARD_BAND.investments} className="p-6">
                <h2 className={eyebrowClass}>Input details</h2>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                            Monthly Gross Salary (R)
                        </label>
                        <BlurredValue as="div">
                        <input
                            type="text"
                            value={formatCurrency(salary)}
                            readOnly
                            className="w-full min-h-[44px] px-3 py-3 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-neutral-950 dark:text-white cursor-not-allowed"
                        />
                        </BlurredValue>
                        <p className="text-xs text-neutral-400 mt-1">From your latest payslip (gross + company contributions + additional income)</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                            Current RA Value (R)
                        </label>
                        <BlurredValue as="div">
                        <input
                            type="text"
                            value={formatCurrency(currentRAValue)}
                            readOnly
                            className="w-full min-h-[44px] px-3 py-3 border border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-neutral-950 dark:text-white cursor-not-allowed"
                            placeholder="0"
                        />
                        </BlurredValue>
                        <p className="text-xs text-neutral-400 mt-1">
                            From your RA performance history (latest month)
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                            Monthly RA Contribution (R)
                        </label>
                        <BlurredValue as="div" className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-neutral-400 pointer-events-none">R</span>
                            <input
                                type="number"
                                inputMode="decimal"
                                value={monthlyRAContribution}
                                onChange={(e) => updateMonthlyRAContribution(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className={`w-full min-h-[44px] pl-8 pr-3 py-3 border rounded-xl focus:ring-2 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-white transition-colors ${monthlyRAContribution > 0 && !isRAContributionValid
                                    ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                                    : 'border-neutral-200 dark:border-neutral-700 focus:ring-neutral-400'
                                    }`}
                                placeholder="0"
                            />
                        </BlurredValue>
                        {monthlyRAContribution > 0 && maxMonthlyRAContribution > 0 && !isRAContributionValid && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Please provide a valid monthly contribution. Maximum monthly contribution is <BlurredValue>{formatCurrency(maxMonthlyRAContribution)}</BlurredValue>
                            </p>
                        )}
                    </div>
                </div>
            </AppCard>

            {calculationResult && (
                <div ref={resultsSectionRef} className="space-y-5">
                    <AppCard
                        id="calculator-result"
                        band={CARD_BAND.investments}
                        className="p-6 scroll-mt-24 pb-8"
                    >
                        <h2 className={eyebrowClass}>Calculator result</h2>
                        <p className="mt-4 text-neutral-700 dark:text-neutral-200 tabular-nums text-sm">
                            On a salary of <BlurredValue>{formatCurrency(calculationResult.monthly_salary)}</BlurredValue> per month,{' '}
                            <BlurredValue>{formatCurrency(calculationResult.annual_salary)}</BlurredValue> per year, you can expect to pay{' '}
                            <BlurredValue><span className="font-semibold text-red-600 dark:text-red-400">
                                {formatCurrency(calculationResult.base_tax_annual)}
                            </span></BlurredValue>{' '}
                            in income tax per year.
                        </p>
                        <p className="mt-2 text-neutral-700 dark:text-neutral-200 text-sm">
                            Here is how your contribution can lower your income tax and potentially increase your tax refund:
                        </p>
                    </AppCard>

                    <AppCard band={CARD_BAND.investments} className="p-4 sm:p-6 overflow-x-auto">
                        <div className="flex items-center gap-2 mb-2 sm:hidden">
                            <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
                            <p className="text-xs text-neutral-400">Swipe horizontally to see all scenarios</p>
                        </div>
                        <table className="w-full min-w-[800px]">
                            <thead>
                                <tr className="border-b border-neutral-200 dark:border-neutral-700">
                                    <th className="text-left py-3 px-4 font-semibold text-neutral-950 dark:text-white"></th>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <th
                                            key={index}
                                            className={`text-center py-3 px-4 font-semibold text-neutral-950 dark:text-white border-l border-neutral-200 dark:border-neutral-700 ${index % 2 === 1 ? 'bg-neutral-50/50 dark:bg-neutral-800/30' : ''}`}
                                        >
                                            {scenario.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {/* Net Income (monthly) */}
                                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-neutral-700 dark:text-neutral-200">Net income (monthly)</span>
                                            <button type="button" className="p-2 -m-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 ml-2" aria-label="More info">
                                                <Info className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                                            </button>
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td key={index} className={`text-center py-3 px-4 text-neutral-950 dark:text-white tabular-nums border-l border-neutral-200 dark:border-neutral-700 ${index % 2 === 1 ? 'bg-neutral-50/50 dark:bg-neutral-800/30' : ''}`}>
                                            <BlurredValue>{formatCurrency(calculationResult.net_income_monthly)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                {/* RA Contributions */}
                                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                    <td className="py-4 px-4 text-neutral-700 dark:text-neutral-200">RA contributions</td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td key={index} className={`text-center py-4 px-4 text-neutral-950 dark:text-white tabular-nums leading-relaxed border-l border-neutral-200 dark:border-neutral-700 ${index % 2 === 1 ? 'bg-neutral-50/50 dark:bg-neutral-800/30' : ''}`}>
                                            <BlurredValue>{formatCurrency(scenario.ra_contribution_annual)} yr / {formatCurrency(scenario.ra_contribution_monthly)} mo</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                {/* Adjusted Income (monthly) */}
                                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-neutral-700 dark:text-neutral-200">Adjusted income (monthly)</span>
                                            <button type="button" className="p-2 -m-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 ml-2" aria-label="More info">
                                                <Info className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                                            </button>
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td key={index} className={`text-center py-3 px-4 text-neutral-950 dark:text-white tabular-nums border-l border-neutral-200 dark:border-neutral-700 ${index % 2 === 1 ? 'bg-neutral-50/50 dark:bg-neutral-800/30' : ''}`}>
                                            <BlurredValue>{formatCurrency(scenario.adjusted_income_monthly)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                {/* Income Tax (annual) */}
                                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                    <td className="py-3 px-4 text-neutral-700 dark:text-neutral-200">Income tax (annual)</td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-3 px-4 font-semibold text-red-600 dark:text-red-400 tabular-nums border-l border-neutral-200 dark:border-neutral-700 ${index % 2 === 1 ? 'bg-neutral-50/50 dark:bg-neutral-800/30' : ''}`}
                                        >
                                            <BlurredValue>{formatCurrency(scenario.income_tax_annual)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                {/* Potential Tax Saved (annual) */}
                                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-neutral-700 dark:text-neutral-200">Potential tax saved (annual)</span>
                                            <button type="button" className="p-2 -m-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 ml-2" aria-label="More info">
                                                <Info className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                                            </button>
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-3 px-4 font-semibold tabular-nums border-l border-neutral-200 dark:border-neutral-700 ${index % 2 === 1 ? 'bg-neutral-50/50 dark:bg-neutral-800/30' : ''}`}
                                            style={{ color: OVERVIEW_COLORS[0] }}
                                        >
                                            <BlurredValue>{formatCurrency(scenario.tax_saved_annual)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>

                                {/* Potential Tax Saved (monthly) */}
                                <tr>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-neutral-700 dark:text-neutral-200">Potential tax saved (monthly)</span>
                                            <button type="button" className="p-2 -m-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 ml-2" aria-label="More info">
                                                <Info className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
                                            </button>
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className={`text-center py-3 px-4 font-semibold tabular-nums border-l border-neutral-200 dark:border-neutral-700 ${index % 2 === 1 ? 'bg-neutral-50/50 dark:bg-neutral-800/30' : ''}`}
                                            style={{ color: OVERVIEW_COLORS[0] }}
                                        >
                                            <BlurredValue>{formatCurrency(scenario.tax_saved_monthly)}</BlurredValue>
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </AppCard>

                    {growthData.length > 0 && (
                        <AppCard band={CARD_BAND.investments} className={`p-4 sm:p-6 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                            <h2 className={eyebrowClass}>RA growth projection</h2>
                            <div className="mt-4 w-full min-w-0 h-[340px] sm:h-[480px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={growthData} margin={{ top: 5, right: 10, left: isMobile ? 0 : 30, bottom: 35 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-neutral-700" />
                                        <XAxis
                                            dataKey="year"
                                            stroke="#9CA3AF"
                                            tick={{ fill: '#9CA3AF', fontSize: isMobile ? 11 : 12 }}
                                            ticks={growthData.length > 8 ? growthData.filter((_, i) => i % 5 === 0).map(d => d.year) : undefined}
                                            tickFormatter={(value) => {
                                                const year = value
                                                const currentYear = new Date().getFullYear()
                                                const yearsFromNow = year - currentYear
                                                return yearsFromNow % 5 === 0 ? year.toString() : ''
                                            }}
                                            label={{ value: 'Year', position: 'insideBottom', offset: -10, style: { fill: '#9CA3AF', fontSize: 13 } }}
                                        />
                                        <YAxis
                                            stroke="#9CA3AF"
                                            width={isMobile ? 52 : 70}
                                            tick={{ fill: '#9CA3AF', fontSize: isMobile ? 10 : 12 }}
                                            tickFormatter={(value) => {
                                                if (value >= 1000000) {
                                                    return `R${(value / 1000000).toFixed(1)}M`
                                                } else if (value >= 1000) {
                                                    return `R${(value / 1000).toFixed(0)}K`
                                                }
                                                return `R${value}`
                                            }}
                                            label={!isMobile ? {
                                                value: 'Portfolio Value (R)',
                                                angle: -90,
                                                position: 'insideLeft',
                                                offset: 15,
                                                style: { fill: '#9CA3AF', fontSize: 13, textAnchor: 'middle' }
                                            } : undefined}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1f2937',
                                                borderColor: '#374151',
                                                color: '#f3f4f6',
                                                borderRadius: '8px'
                                            }}
                                            cursor={{ stroke: '#6b7280', strokeWidth: 1 }}
                                            formatter={(value, name) => {
                                                return [formatCurrency(value), 'Portfolio Value']
                                            }}
                                            labelFormatter={(label) => `Year: ${label}`}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke={OVERVIEW_COLORS[0]}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 6 }}
                                            isAnimationActive={false}
                                            name="Portfolio Value"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-xs text-neutral-400 mt-4 italic">
                                Assumes net return of 5.5% after tax and inflation. This is a projection and actual returns may vary.
                            </p>
                        </AppCard>
                    )}

                    <AppCard band={CARD_BAND.investments} className="p-4">
                        <p className={`${eyebrowClass} mb-2`}>About RA tax benefits</p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
                            <li>RA contributions are tax deductible up to 27.5% of your earnings or <BlurredValue>{calculationResult?.ra_max_deduction ? formatCurrency(calculationResult.ra_max_deduction, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : 'R350,000'}</BlurredValue> per year (whichever is lower)</li>
                            <li>The higher your RA contributions, the higher your potential tax refund</li>
                            <li>Growth on your RA money is tax-free (no tax on interest, dividends, or capital gains)</li>
                            <li>At retirement, you can take up to 1/3 of your RA as a lump sum with lower tax rates</li>
                        </ul>
                    </AppCard>
                </div>
            )}

            {calculating && (
                <div className="text-center text-neutral-400">Calculating...</div>
            )}

            {showJumpToResults && (
                <button
                    type="button"
                    onClick={() => document.getElementById('calculator-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="fixed bottom-4 right-4 z-50 px-4 py-3 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100 dark:focus:ring-offset-neutral-900"
                >
                    Jump to Results
                </button>
            )}
        </div>
    )
}
