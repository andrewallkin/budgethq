import { useState, useMemo, useEffect } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'

export default function EmergencyFundCalculator({ needsTotal }) {
    const [currentFund, setCurrentFund] = useState(0)
    const [monthlyExpenses, setMonthlyExpenses] = useState(needsTotal || 0)
    const [targetMonths, setTargetMonths] = useState(6)

    // Update monthly expenses when needsTotal changes (if user hasn't manually set it)
    useEffect(() => {
        if (needsTotal > 0 && monthlyExpenses === 0) {
            setMonthlyExpenses(needsTotal)
        }
    }, [needsTotal])

    const monthsCovered = useMemo(() => {
        if (monthlyExpenses === 0) return 0
        return currentFund / monthlyExpenses
    }, [currentFund, monthlyExpenses])

    const targetAmount = useMemo(() => {
        return monthlyExpenses * targetMonths
    }, [monthlyExpenses, targetMonths])

    const shortfall = useMemo(() => {
        return Math.max(0, targetAmount - currentFund)
    }, [targetAmount, currentFund])

    const progress = useMemo(() => {
        if (targetAmount === 0) return 0
        return Math.min(100, (currentFund / targetAmount) * 100)
    }, [currentFund, targetAmount])

    const status = monthsCovered >= targetMonths ? 'adequate' : monthsCovered >= targetMonths * 0.75 ? 'good' : 'insufficient'

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Emergency Fund</h2>
            
            <div className="space-y-4">
                {/* Input Fields */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Current Emergency Fund (R)
                    </label>
                    <input
                        type="number"
                        value={currentFund === 0 ? '' : currentFund}
                        onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                            setCurrentFund(val)
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Monthly Expenses (R)
                    </label>
                    <input
                        type="number"
                        value={monthlyExpenses === 0 ? '' : monthlyExpenses}
                        onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                            setMonthlyExpenses(val)
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Defaults to "Needs" total. Adjust if needed.
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Target Coverage (Months)
                    </label>
                    <select
                        value={targetMonths}
                        onChange={(e) => setTargetMonths(parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value={3}>3 months</option>
                        <option value={6}>6 months</option>
                        <option value={12}>12 months</option>
                    </select>
                </div>

                {/* Status Display */}
                <div className={`p-4 rounded-lg ${
                    status === 'adequate' ? 'bg-green-50 dark:bg-green-900/20' :
                    status === 'good' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                    'bg-red-50 dark:bg-red-900/20'
                }`}>
                    <div className="flex items-center gap-2 mb-2">
                        {status === 'adequate' ? (
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                            <AlertCircle className={`w-5 h-5 ${
                                status === 'good' ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-red-600 dark:text-red-400'
                            }`} />
                        )}
                        <span className={`font-semibold ${
                            status === 'adequate' ? 'text-green-900 dark:text-green-100' :
                            status === 'good' ? 'text-yellow-900 dark:text-yellow-100' :
                            'text-red-900 dark:text-red-100'
                        }`}>
                            {status === 'adequate' ? 'Adequate Coverage' :
                             status === 'good' ? 'Good Progress' :
                             'Insufficient Coverage'}
                        </span>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                        You have <span className="font-semibold">{monthsCovered.toFixed(1)} months</span> of expenses covered
                    </div>
                </div>

                {/* Progress Bar */}
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">Progress to Target</span>
                        <span className="font-medium text-gray-900 dark:text-white">{progress.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                        <div
                            className={`h-3 rounded-full transition-all ${
                                progress >= 100 ? 'bg-green-600' :
                                progress >= 75 ? 'bg-yellow-500' :
                                'bg-blue-600'
                            }`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span>R {currentFund.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        <span>R {targetAmount.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Target Amount</div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-white">
                            R {targetAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            {shortfall > 0 ? 'Remaining to Save' : 'Excess'}
                        </div>
                        <div className={`text-lg font-semibold ${shortfall > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            R {Math.abs(shortfall).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

