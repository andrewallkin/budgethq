import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { X } from 'lucide-react'
import { formatCurrency } from '../utils/numberFormatting'
import BlurredValue from './BlurredValue'
import { useAuth } from '../context/AuthContext'

export default function SavingsCalculator({ isOpen, onClose }) {
    const { blurSensitiveValues } = useAuth()
    const [initialAmount, setInitialAmount] = useState(0)
    const [monthlyDeposit, setMonthlyDeposit] = useState(0)
    const [annualRate, setAnnualRate] = useState(7)
    const [annualRateDisplay, setAnnualRateDisplay] = useState('7')
    const [years, setYears] = useState(10)

    const calculateSavings = () => {
        const monthlyRate = annualRate / 100 / 12
        const totalMonths = years * 12
        const data = []
        let currentAmount = initialAmount

        for (let month = 0; month <= totalMonths; month++) {
            if (month > 0) {
                // Add monthly deposit at the start of the month
                currentAmount += monthlyDeposit
                // Apply interest at the end of the month
                currentAmount = currentAmount * (1 + monthlyRate)
            }

            if (month % 12 === 0 || month === totalMonths) {
                const year = month / 12
                const contributions = initialAmount + (monthlyDeposit * month)
                const interest = currentAmount - contributions

                data.push({
                    year: year.toFixed(1),
                    total: Math.round(currentAmount * 100) / 100,
                    contributions: Math.round(contributions * 100) / 100,
                    interest: Math.round(interest * 100) / 100
                })
            }
        }

        return data
    }

    const projectionData = useMemo(() => calculateSavings(), [initialAmount, monthlyDeposit, annualRate, years])
    
    const finalAmount = projectionData.length > 0 ? projectionData[projectionData.length - 1].total : 0
    const totalContributions = initialAmount + (monthlyDeposit * years * 12)
    const totalInterest = finalAmount - totalContributions

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
                <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6 flex justify-between items-center shrink-0">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Savings Calculator</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-4 sm:p-6 space-y-6 overflow-y-auto">
                    {/* Input Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Initial Amount (R)
                            </label>
                            <BlurredValue as="div">
                            <input
                                type="number"
                                value={initialAmount === 0 ? '' : initialAmount}
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                                    setInitialAmount(val)
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            </BlurredValue>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Monthly Deposit (R)
                            </label>
                            <BlurredValue as="div">
                            <input
                                type="number"
                                value={monthlyDeposit === 0 ? '' : monthlyDeposit}
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                                    setMonthlyDeposit(val)
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            </BlurredValue>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Annual Interest Rate (%)
                            </label>
                            <input
                                type="text"
                                value={annualRateDisplay}
                                onChange={(e) => {
                                    let value = e.target.value
                                    // Replace comma with dot for decimal separator
                                    value = value.replace(',', '.')
                                    // Only allow numbers and one decimal point
                                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                        setAnnualRateDisplay(value)
                                        const numValue = value === '' ? 0 : parseFloat(value)
                                        if (!isNaN(numValue)) {
                                            setAnnualRate(numValue)
                                        }
                                    }
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Time Period (Years)
                            </label>
                            <input
                                type="number"
                                value={years === 0 ? '' : years}
                                onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value) || 0
                                    setYears(val)
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* Results Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Projected Final Amount</div>
                            <BlurredValue><div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {formatCurrency(finalAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div></BlurredValue>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Total Contributions</div>
                            <BlurredValue><div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {formatCurrency(totalContributions, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div></BlurredValue>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Interest Earned</div>
                            <BlurredValue><div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {formatCurrency(totalInterest, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div></BlurredValue>
                        </div>
                    </div>

                    {/* Chart */}
                    {projectionData.length > 0 && (
                        <div className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-4 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Growth Over Time</h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={projectionData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis 
                                            dataKey="year" 
                                            stroke="#9ca3af"
                                            label={{ value: 'Years', position: 'insideBottom', offset: -5, fill: '#9ca3af' }}
                                        />
                                        <YAxis 
                                            stroke="#9ca3af"
                                            tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`}
                                        />
                                        <Tooltip
                                            formatter={(value) =>
                                                formatCurrency(value, {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })
                                            }
                                            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6' }}
                                            labelStyle={{ color: '#f3f4f6' }}
                                        />
                                        <Legend wrapperStyle={{ color: '#9ca3af' }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="total" 
                                            stroke="#3b82f6" 
                                            strokeWidth={2}
                                            name="Total Amount"
                                            dot={false}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="contributions" 
                                            stroke="#6b7280" 
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            name="Contributions"
                                            dot={false}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="interest" 
                                            stroke="#10b981" 
                                            strokeWidth={2}
                                            strokeDasharray="3 3"
                                            name="Interest Earned"
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

