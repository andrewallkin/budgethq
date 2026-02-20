import { useState, useEffect } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import axios from 'axios'

export default function EditHoldingModal({ isOpen, onClose, holding, onSuccess }) {
    const [targetPercentage, setTargetPercentage] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const isBond = holding?.type === 'BOND'

    // Reset form when modal opens or holding changes
    useEffect(() => {
        if (isOpen && holding) {
            setTargetPercentage(holding.target_percentage.toString())
            setError('')
        }
    }, [isOpen, holding])

    const handleSubmit = async () => {
        if (!holding) return

        const targetPct = parseFloat(targetPercentage)

        // Validation
        if (isNaN(targetPct) || targetPct < 0 || targetPct > 100) {
            setError('Target percentage must be between 0 and 100')
            return
        }

        setSubmitting(true)
        setError('')

        try {
            if (isBond) {
                await axios.put(`/api/bond/holdings/${holding.id}`, {
                    target_percentage: targetPct
                })
            } else {
                await axios.put(`/api/etf/holdings/${holding.id}`, {
                    target_percentage: targetPct
                })
            }

            onSuccess?.()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update holding')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen || !holding) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 sm:mx-auto overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-indigo-600">
                    <div>
                        <h2 className="text-xl font-bold text-white">
                            Edit Target Percentage
                        </h2>
                        <p className="text-white/80 text-sm mt-1">{isBond ? holding.bond_name : holding.etf_name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Current Info */}
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-500 dark:text-gray-400">Type</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {isBond ? 'Government Bond' : 'ETF'}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-500 dark:text-gray-400">Region</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {holding.region}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Current Target</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {holding.target_percentage.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Target Percentage Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            New Target Percentage
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                inputMode="decimal"
                                step="0.1"
                                min="0"
                                max="100"
                                value={targetPercentage}
                                onChange={(e) => setTargetPercentage(e.target.value)}
                                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-medium"
                                autoFocus
                            />
                            <span className="text-xl font-medium text-gray-500 dark:text-gray-400">%</span>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Set to 0 if you plan to sell this holding completely
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

