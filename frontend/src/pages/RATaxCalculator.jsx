import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import axios from 'axios'
import { Calculator, Info } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency, formatNumber } from '../utils/numberFormatting'

export default function RATaxCalculator() {
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const hasLoadedData = useRef(false)
    const [hasUserEdited, setHasUserEdited] = useState(false)
    const [salary, setSalary] = useState(0)
    const [monthlyRAContribution, setMonthlyRAContribution] = useState(0)
    const [currentRAValue, setCurrentRAValue] = useState(0)
    const [age, setAge] = useState(30)
    const [calculationResult, setCalculationResult] = useState(null)
    const [calculating, setCalculating] = useState(false)

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

    // Calculate maximum monthly RA contribution (27.5% of annual salary or R350,000 per year, whichever is lower)
    const maxMonthlyRAContribution = useMemo(() => {
        if (salary <= 0) return 0
        const annualSalary = salary * 12
        const maxAnnualDeduction = Math.min(annualSalary * 0.275, 350000)
        return maxAnnualDeduction / 12
    }, [salary])

    const calculateRATax = useCallback(async () => {
        if (salary <= 0) return

        setCalculating(true)
        try {
            const res = await axios.post('/api/calculate/ra-tax', {
                salary: parseFloat(salary || 0).toFixed(2),
                age: age || 30,
                monthly_ra_contribution: monthlyRAContribution || 0
            })
            setCalculationResult(res.data)
        } catch (err) {
            console.error("Failed to calculate RA tax", err)
        } finally {
            setCalculating(false)
        }
    }, [salary, monthlyRAContribution])

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
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600 dark:text-gray-400">Loading...</div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🏦 Retirement Annuity Tax Calculator</h1>
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {isSaving ? 'Saving...' : 'All changes saved'}
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Input Details</h2>
                <div className="grid md:grid-cols-4 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Monthly Gross Salary (R)
                        </label>
                        <input
                            type="text"
                            value={formatCurrency(salary)}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">From your latest payslip (gross + company contributions + additional income)</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Current RA Value (R)
                        </label>
                        <input
                            type="text"
                            value={formatCurrency(currentRAValue)}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white cursor-not-allowed"
                            placeholder="0"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            From your RA performance history (latest month)
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Monthly RA Contribution (R)
                        </label>
                        <input
                            type="number"
                            value={monthlyRAContribution}
                            onChange={(e) => updateMonthlyRAContribution(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors ${monthlyRAContribution > 0 && !isRAContributionValid
                                ? 'border-red-500 dark:border-red-500 focus:ring-red-500'
                                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                                }`}
                            placeholder="0"
                        />
                        {monthlyRAContribution > 0 && maxMonthlyRAContribution > 0 && !isRAContributionValid && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Please provide a valid monthly contribution. Maximum monthly contribution is {formatCurrency(maxMonthlyRAContribution)}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {calculationResult && (
                <div className="space-y-6">
                    {/* Summary */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Calculator Result</h2>
                        <p className="text-gray-700 dark:text-gray-300 mb-2">
                            On a salary of {formatCurrency(calculationResult.monthly_salary)} per month,{' '}
                            {formatCurrency(calculationResult.annual_salary)} per year, you can expect to pay{' '}
                            <span className="font-semibold text-red-600 dark:text-red-400">
                                {formatCurrency(calculationResult.base_tax_annual)}
                            </span>{' '}
                            in income tax per year.
                        </p>
                        <p className="text-gray-700 dark:text-gray-300">
                            Here is how your contribution can lower your income tax and potentially increase your tax refund:
                        </p>
                    </div>

                    {/* Results Table */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto">
                        <table className="w-full min-w-[800px]">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-white"></th>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <th
                                            key={index}
                                            className="text-center py-3 px-4 font-semibold text-gray-900 dark:text-white"
                                        >
                                            {scenario.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {/* Net Income (monthly) */}
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700 dark:text-gray-300">Net income (monthly)</span>
                                            <Info className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td key={index} className="text-center py-3 px-4 text-gray-900 dark:text-white">
                                            {formatCurrency(calculationResult.net_income_monthly)}
                                        </td>
                                    ))}
                                </tr>

                                {/* RA Contributions */}
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">RA contributions</td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td key={index} className="text-center py-3 px-4 text-gray-900 dark:text-white">
                                            {formatCurrency(scenario.ra_contribution_annual)} yr /{' '}
                                            {formatCurrency(scenario.ra_contribution_monthly)} mo
                                        </td>
                                    ))}
                                </tr>

                                {/* Adjusted Income (monthly) */}
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700 dark:text-gray-300">Adjusted income (monthly)</span>
                                            <Info className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td key={index} className="text-center py-3 px-4 text-gray-900 dark:text-white">
                                            {formatCurrency(scenario.adjusted_income_monthly)}
                                        </td>
                                    ))}
                                </tr>

                                {/* Income Tax (annual) */}
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">Income tax (annual)</td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className="text-center py-3 px-4 font-semibold text-red-600 dark:text-red-400"
                                        >
                                            {formatCurrency(scenario.income_tax_annual)}
                                        </td>
                                    ))}
                                </tr>

                                {/* Potential Tax Saved (annual) */}
                                <tr className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700 dark:text-gray-300">Potential tax saved (annual)</span>
                                            <Info className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className="text-center py-3 px-4 font-semibold text-blue-600 dark:text-blue-400"
                                        >
                                            {formatCurrency(scenario.tax_saved_annual)}
                                        </td>
                                    ))}
                                </tr>

                                {/* Potential Tax Saved (monthly) */}
                                <tr>
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700 dark:text-gray-300">Potential tax saved (monthly)</span>
                                            <Info className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                        </div>
                                    </td>
                                    {calculationResult.scenarios.map((scenario, index) => (
                                        <td
                                            key={index}
                                            className="text-center py-3 px-4 font-semibold text-blue-600 dark:text-blue-400"
                                        >
                                            {formatCurrency(scenario.tax_saved_monthly)}
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Growth Projection Graph */}
                    {growthData.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">RA Growth Projection</h2>
                            <div className="h-96 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={growthData} margin={{ top: 5, right: 30, left: 120, bottom: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
                                        <XAxis
                                            dataKey="year"
                                            stroke="#6b7280"
                                            className="dark:stroke-gray-400"
                                            tick={{ fill: '#6b7280', fontSize: 12 }}
                                            tickFormatter={(value) => {
                                                const year = value
                                                const currentYear = new Date().getFullYear()
                                                const yearsFromNow = year - currentYear
                                                return yearsFromNow % 5 === 0 ? year.toString() : ''
                                            }}
                                            label={{ value: 'Year', position: 'bottom', offset: 10, style: { fill: '#6b7280', fontSize: 14 } }}
                                        />
                                        <YAxis
                                            stroke="#6b7280"
                                            className="dark:stroke-gray-400"
                                            tick={{ fill: '#6b7280', fontSize: 12 }}
                                            tickFormatter={(value) => {
                                                if (value >= 1000000) {
                                                    return `R${(value / 1000000).toFixed(1)}M`
                                                } else if (value >= 1000) {
                                                    return `R${(value / 1000).toFixed(0)}K`
                                                }
                                                return `R${value}`
                                            }}
                                            label={{
                                                value: 'Portfolio Value (R)',
                                                angle: -90,
                                                position: 'left',
                                                offset: 10,
                                                style: { fill: '#6b7280', fontSize: 14, textAnchor: 'middle' }
                                            }}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1f2937',
                                                borderColor: '#374151',
                                                color: '#f3f4f6',
                                                borderRadius: '8px'
                                            }}
                                            formatter={(value, name) => {
                                                return [formatCurrency(value), 'Portfolio Value']
                                            }}
                                            labelFormatter={(label) => `Year: ${label}`}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={false}
                                            name="Portfolio Value"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 italic">
                                Assumes net return of 5.5% after tax and inflation. This is a projection and actual returns may vary.
                            </p>
                        </div>
                    )}

                    {/* Info Box */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <Calculator className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                            <div className="text-sm text-blue-800 dark:text-blue-200">
                                <p className="font-semibold mb-1">About RA Tax Benefits</p>
                                <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300">
                                    <li>RA contributions are tax deductible up to 27.5% of your earnings or R350,000 per year (whichever is lower)</li>
                                    <li>The higher your RA contributions, the higher your potential tax refund</li>
                                    <li>Growth on your RA money is tax-free (no tax on interest, dividends, or capital gains)</li>
                                    <li>At retirement, you can take up to 1/3 of your RA as a lump sum with lower tax rates</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {calculating && (
                <div className="text-center text-gray-600 dark:text-gray-400">Calculating...</div>
            )}
        </div>
    )
}
