import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import axios from 'axios'

export default function AddManualAccountModal({ isOpen, onClose, onSuccess }) {
    const [name, setName] = useState('')
    const [balance, setBalance] = useState('')
    const [isEmergencySavings, setIsEmergencySavings] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const resetForm = () => {
        setName('')
        setBalance('')
        setIsEmergencySavings(false)
        setError('')
    }

    const handleClose = () => {
        resetForm()
        onClose()
    }

    const validateForm = () => {
        if (!name.trim()) {
            setError('Account name is required')
            return false
        }
        const balanceNum = parseFloat(balance)
        if (isNaN(balanceNum) || balanceNum < 0) {
            setError('Balance must be a non-negative number')
            return false
        }
        return true
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (!validateForm()) return

        setSubmitting(true)
        try {
            await axios.post('/api/manual-accounts', {
                name: name.trim(),
                balance: parseFloat(balance) || 0,
                is_emergency_savings: isEmergencySavings
            })
            resetForm()
            onSuccess?.()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create account')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Add Manual Account
                    </h2>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Account Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Savings Account"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Balance *
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={balance}
                            onChange={(e) => setBalance(e.target.value)}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="is_emergency_savings"
                            checked={isEmergencySavings}
                            onChange={(e) => setIsEmergencySavings(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="is_emergency_savings" className="text-sm text-gray-700 dark:text-gray-300">
                            Include in Emergency Savings total
                        </label>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {submitting ? 'Adding...' : 'Add Account'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
