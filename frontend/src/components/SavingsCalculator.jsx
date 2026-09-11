import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { X } from 'lucide-react'
import { formatCurrency } from '../utils/numberFormatting'
import BlurredValue from './BlurredValue'
import { useAuth } from '../context/AuthContext'
import { PAPER_CHART, paperMoney, paperMoneyTone } from './appUi'

const fieldInput = 'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'

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

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--paper-ink)]/40 p-4">
            <div className="paper-card mx-4 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden">
                <div className="sticky top-0 flex shrink-0 items-center justify-between border-b border-[var(--paper-line)] p-4 sm:p-6">
                    <h2 className="text-xl font-semibold text-[var(--paper-ink)]">Savings Calculator</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="cursor-pointer text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)]"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="space-y-6 overflow-y-auto p-4 sm:p-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-2 block text-sm text-[var(--paper-muted)]">
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
                                className={fieldInput}
                            />
                            </BlurredValue>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm text-[var(--paper-muted)]">
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
                                className={fieldInput}
                            />
                            </BlurredValue>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm text-[var(--paper-muted)]">
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
                                className={fieldInput}
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm text-[var(--paper-muted)]">
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
                                className={fieldInput}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 rounded-md bg-[var(--paper-canvas)] p-4 sm:grid-cols-3">
                        <div>
                            <div className="text-sm text-[var(--paper-muted)]">Projected Final Amount</div>
                            <BlurredValue>
                                <div className={`mt-1 text-2xl text-[var(--paper-ink)] ${paperMoney}`}>
                                    {formatCurrency(finalAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </BlurredValue>
                        </div>
                        <div>
                            <div className="text-sm text-[var(--paper-muted)]">Total Contributions</div>
                            <BlurredValue>
                                <div className={`mt-1 text-2xl text-[var(--paper-ink)] ${paperMoney}`}>
                                    {formatCurrency(totalContributions, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </BlurredValue>
                        </div>
                        <div>
                            <div className="text-sm text-[var(--paper-muted)]">Interest Earned</div>
                            <BlurredValue>
                                <div className={`mt-1 text-2xl ${paperMoney} ${paperMoneyTone(totalInterest)}`}>
                                    {formatCurrency(totalInterest, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </BlurredValue>
                        </div>
                    </div>

                    {projectionData.length > 0 && (
                        <div className={`rounded-md bg-[var(--paper-canvas)] p-4 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                            <h3 className="mb-4 text-lg font-semibold text-[var(--paper-ink)]">Growth Over Time</h3>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={projectionData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--paper-line)" />
                                        <XAxis
                                            dataKey="year"
                                            stroke="var(--paper-muted)"
                                            tick={{ fill: 'var(--paper-muted)' }}
                                            label={{ value: 'Years', position: 'insideBottom', offset: -5, fill: 'var(--paper-muted)' }}
                                        />
                                        <YAxis
                                            stroke="var(--paper-muted)"
                                            tick={{ fill: 'var(--paper-muted)' }}
                                            tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`}
                                        />
                                        <Tooltip
                                            formatter={(value) =>
                                                formatCurrency(value, {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })
                                            }
                                            contentStyle={{
                                                backgroundColor: 'var(--paper-card)',
                                                borderColor: 'var(--paper-line)',
                                                color: 'var(--paper-ink)',
                                            }}
                                            labelStyle={{ color: 'var(--paper-muted)' }}
                                        />
                                        <Legend wrapperStyle={{ color: 'var(--paper-muted)' }} />
                                        <Line
                                            type="monotone"
                                            dataKey="total"
                                            stroke={PAPER_CHART.umber}
                                            strokeWidth={2}
                                            name="Total Amount"
                                            dot={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="contributions"
                                            stroke={PAPER_CHART.khaki}
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            name="Contributions"
                                            dot={false}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="interest"
                                            stroke={PAPER_CHART.olive}
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
        </div>,
        document.body
    )
}
