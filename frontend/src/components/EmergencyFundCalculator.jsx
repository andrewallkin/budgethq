import { useState, useMemo, useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { formatCurrency, formatNumber } from '../utils/numberFormatting'

export default function EmergencyFundCalculator({ needsTotal, emergencyFundData, onSave }) {
    // Initialize state from props or defaults
    const [currentFund, setCurrentFund] = useState(emergencyFundData?.current_emergency_fund || 0)
    const [monthlyDeposit, setMonthlyDeposit] = useState(emergencyFundData?.monthly_emergency_deposit || 0)
    const [monthlyExpenses, setMonthlyExpenses] = useState(needsTotal || 0)
    const [targetType, setTargetType] = useState(emergencyFundData?.emergency_target_type || 'months')
    const [targetMonths, setTargetMonths] = useState(emergencyFundData?.emergency_target_months || 6)
    const [targetValue, setTargetValue] = useState(emergencyFundData?.emergency_target_value || 0)

    // Track if user has explicitly edited values (not just prop updates)
    const [userHasEdited, setUserHasEdited] = useState(false)

    // Update state when props change (e.g., after loading from API)
    // Track the last emergencyFundData we initialized from to detect prop changes
    const lastInitializedDataRef = useRef(null)

    useEffect(() => {
        // Check if emergencyFundData has actually changed from what we last initialized
        const dataChanged = lastInitializedDataRef.current === null ||
            JSON.stringify(lastInitializedDataRef.current) !== JSON.stringify(emergencyFundData)

        // Initialize when we first get data, or when data actually changes (e.g., navigating back)
        if (emergencyFundData && dataChanged) {
            setCurrentFund(emergencyFundData.current_emergency_fund ?? 0)
            setMonthlyDeposit(emergencyFundData.monthly_emergency_deposit ?? 0)
            setTargetType(emergencyFundData.emergency_target_type || 'months')
            setTargetMonths(emergencyFundData.emergency_target_months ?? 6)
            setTargetValue(emergencyFundData.emergency_target_value ?? 0)
            lastInitializedDataRef.current = emergencyFundData
            // Reset userHasEdited when new data comes from parent
            setUserHasEdited(false)
        }
    }, [emergencyFundData])

    // Update monthly expenses when needsTotal changes (if user hasn't manually set it)
    useEffect(() => {
        if (needsTotal > 0 && monthlyExpenses === 0) {
            setMonthlyExpenses(needsTotal)
        }
    }, [needsTotal])

    // Notify parent of changes for auto-save - ONLY when user has explicitly edited
    useEffect(() => {
        if (onSave && userHasEdited) {
            onSave({
                current_emergency_fund: currentFund,
                monthly_emergency_deposit: monthlyDeposit,
                emergency_target_type: targetType,
                emergency_target_months: targetType === 'months' ? targetMonths : null,
                emergency_target_value: targetType === 'target_value' ? targetValue : null
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFund, monthlyDeposit, targetType, targetMonths, targetValue, userHasEdited])

    const monthsCovered = useMemo(() => {
        if (monthlyExpenses === 0) return 0
        return currentFund / monthlyExpenses
    }, [currentFund, monthlyExpenses])

    const targetAmount = useMemo(() => {
        if (targetType === 'target_value') {
            return targetValue
        } else {
            return monthlyExpenses * targetMonths
        }
    }, [targetType, monthlyExpenses, targetMonths, targetValue])

    const shortfall = useMemo(() => {
        return Math.max(0, targetAmount - currentFund)
    }, [targetAmount, currentFund])

    const progress = useMemo(() => {
        if (targetAmount === 0) return 0
        return Math.min(100, (currentFund / targetAmount) * 100)
    }, [currentFund, targetAmount])

    const monthsToGoal = useMemo(() => {
        if (monthlyDeposit === 0) return null
        if (currentFund >= targetAmount) return 0
        return Math.ceil((targetAmount - currentFund) / monthlyDeposit)
    }, [currentFund, targetAmount, monthlyDeposit])

    const status = useMemo(() => {
        if (targetType === 'target_value') {
            if (currentFund >= targetAmount) return 'adequate'
            if (progress >= 75) return 'good'
            return 'insufficient'
        } else {
            if (monthsCovered >= targetMonths) return 'adequate'
            if (monthsCovered >= targetMonths * 0.75) return 'good'
            return 'insufficient'
        }
    }, [currentFund, targetAmount, progress, monthsCovered, targetMonths, targetType])

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
                            setUserHasEdited(true)
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
                        Monthly Deposit (R)
                    </label>
                    <input
                        type="number"
                        value={monthlyDeposit === 0 ? '' : monthlyDeposit}
                        onChange={(e) => {
                            setUserHasEdited(true)
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                            setMonthlyDeposit(val)
                        }}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        How much you are currently depositing each month for your emergency savings.
                    </p>
                </div>

                {targetType === 'months' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Monthly Expenses (R)
                        </label>
                        <input
                            type="number"
                            value={monthlyExpenses === 0 ? '' : monthlyExpenses}
                            onChange={(e) => {
                                setUserHasEdited(true)
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
                )}

                {/* Goal Type Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Goal Type
                    </label>
                    <div className="flex gap-4">
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name="targetType"
                                value="months"
                                checked={targetType === 'months'}
                                onChange={(e) => {
                                    setUserHasEdited(true)
                                    setTargetType('months')
                                    if (!targetMonths) setTargetMonths(6)
                                }}
                                className="mr-2"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Months of Expenses</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name="targetType"
                                value="target_value"
                                checked={targetType === 'target_value'}
                                onChange={(e) => {
                                    setUserHasEdited(true)
                                    setTargetType('target_value')
                                    if (!targetValue) setTargetValue(0)
                                }}
                                className="mr-2"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Target Value</span>
                        </label>
                    </div>
                </div>

                {/* Conditional Goal Input */}
                {targetType === 'months' ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Target Coverage (Months)
                        </label>
                        <select
                            value={targetMonths}
                            onChange={(e) => { setUserHasEdited(true); setTargetMonths(parseInt(e.target.value)) }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value={3}>3 months</option>
                            <option value={6}>6 months</option>
                            <option value={12}>12 months</option>
                        </select>
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Target Value (R)
                        </label>
                        <input
                            type="number"
                            value={targetValue === 0 ? '' : targetValue}
                            onChange={(e) => {
                                setUserHasEdited(true)
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                                setTargetValue(val)
                            }}
                            onFocus={(e) => e.target.select()}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                )}

                {/* Months to Reach Goal Calculator */}
                {monthsToGoal !== null && (
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                            Months to Reach Goal
                        </div>
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                            {monthsToGoal} {monthsToGoal === 1 ? 'month' : 'months'}
                        </div>
                    </div>
                )}

                {/* Status Display */}
                <div className={`p-4 rounded-lg ${status === 'adequate' ? 'bg-green-50 dark:bg-green-900/20' :
                    status === 'good' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                        'bg-red-50 dark:bg-red-900/20'
                    }`}>
                    <div className="flex items-center gap-2 mb-2">
                        {status === 'adequate' ? (
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                        ) : (
                            <AlertCircle className={`w-5 h-5 ${status === 'good' ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-red-600 dark:text-red-400'
                                }`} />
                        )}
                        <span className={`font-semibold ${status === 'adequate' ? 'text-green-900 dark:text-green-100' :
                            status === 'good' ? 'text-yellow-900 dark:text-yellow-100' :
                                'text-red-900 dark:text-red-100'
                            }`}>
                            {status === 'adequate' ? 'Adequate Coverage' :
                                status === 'good' ? 'Good Progress' :
                                    'Insufficient Coverage'}
                        </span>
                    </div>
                    {targetType === 'months' && (
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                            You have{' '}
                            <span className="font-semibold">
                                {formatNumber(monthsCovered, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} months
                            </span>{' '}
                            of expenses covered
                        </div>
                    )}
                </div>

                {/* Progress Bar */}
                <div>
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">Progress to Target</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                            {formatNumber(progress, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                        <div
                            className={`h-3 rounded-full transition-all ${progress >= 100 ? 'bg-green-600' :
                                progress >= 75 ? 'bg-yellow-500' :
                                    'bg-blue-600'
                                }`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span>
                            {formatCurrency(currentFund, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span>
                            {formatCurrency(targetAmount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Target Amount</div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(targetAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            {shortfall > 0 ? 'Remaining to Save' : 'Excess'}
                        </div>
                        <div
                            className={`text-lg font-semibold ${
                                shortfall > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                            }`}
                        >
                            {formatCurrency(Math.abs(shortfall), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
