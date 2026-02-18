import { useState } from 'react'
import { X, Plus, AlertCircle, Info } from 'lucide-react'
import axios from 'axios'

export default function AddETFModal({ isOpen, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        jse_ticker: '',
        etf_name: '',
        region: '',
        shares: '',
        target_percentage: '',
        cost_basis: ''
    })
    const [addToSheet, setAddToSheet] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const resetForm = () => {
        setFormData({
            jse_ticker: '',
            etf_name: '',
            region: '',
            shares: '',
            target_percentage: '',
            cost_basis: ''
        })
        setAddToSheet(true)
        setError('')
    }

    const handleClose = () => {
        resetForm()
        onClose()
    }

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }))
        setError('')
    }

    const validateForm = () => {
        if (!formData.jse_ticker.trim()) {
            setError('JSE Ticker is required')
            return false
        }
        if (!formData.jse_ticker.startsWith('JSE:')) {
            setError('Ticker must start with "JSE:" (e.g., JSE:STX40)')
            return false
        }
        if (!formData.etf_name.trim()) {
            setError('ETF Name is required')
            return false
        }
        if (!formData.region.trim()) {
            setError('Region is required')
            return false
        }

        const shares = parseFloat(formData.shares)
        if (isNaN(shares) || shares < 0) {
            setError('Shares must be a non-negative number')
            return false
        }

        const targetPct = parseFloat(formData.target_percentage)
        if (isNaN(targetPct) || targetPct < 0 || targetPct > 100) {
            setError('Target percentage must be between 0 and 100')
            return false
        }

        if (formData.cost_basis.trim() !== '') {
            const costBasis = parseFloat(formData.cost_basis)
            if (isNaN(costBasis) || costBasis < 0) {
                setError('Cost basis must be a non-negative number')
                return false
            }
        }

        return true
    }

    const handleSubmit = async () => {
        if (!validateForm()) return

        setSubmitting(true)
        setError('')

        try {
            // If user wants to add to Google Sheet first
            if (addToSheet) {
                try {
                    await axios.post('/api/etf/add-to-sheet', {
                        jse_ticker: formData.jse_ticker.trim(),
                        etf_name: formData.etf_name.trim()
                    })
                } catch (sheetErr) {
                    // If it already exists in the sheet, that's fine - continue
                    if (!sheetErr.response?.data?.detail?.includes('already exists')) {
                        console.warn('Could not add to sheet:', sheetErr.response?.data?.detail)
                    }
                }
            }

            // Add the holding to the database
            const payload = {
                jse_ticker: formData.jse_ticker.trim(),
                etf_name: formData.etf_name.trim(),
                region: formData.region.trim(),
                shares: parseFloat(formData.shares),
                target_percentage: parseFloat(formData.target_percentage)
            }

            if (formData.cost_basis.trim() !== '') {
                payload.cost_basis = parseFloat(formData.cost_basis)
            }

            await axios.post('/api/etf/holdings', payload)

            onSuccess?.()
            handleClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add ETF holding')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen) return null

    const regions = ['South Africa', 'USA', 'Europe', 'Global', 'Emerging Markets', 'Asia', 'Other']

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 sm:mx-auto max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Add New ETF
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Add a new ETF to your portfolio
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                    {/* JSE Ticker */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            JSE Ticker <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.jse_ticker}
                            onChange={(e) => handleChange('jse_ticker', e.target.value.toUpperCase())}
                            placeholder="JSE:STX40"
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Format: JSE:TICKER (e.g., JSE:STX40, JSE:STXNDQ)
                        </p>
                    </div>

                    {/* ETF Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ETF Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.etf_name}
                            onChange={(e) => handleChange('etf_name', e.target.value)}
                            placeholder="Satrix Top 40"
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>

                    {/* Region */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Region <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.region}
                            onChange={(e) => handleChange('region', e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="">Select region...</option>
                            {regions.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    {/* Shares and Target % in 2 columns */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Number of Shares <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="0.0001"
                                value={formData.shares}
                                onChange={(e) => handleChange('shares', e.target.value)}
                                placeholder="0"
                                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Can be 0 if planning to buy
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Target % <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center">
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="100"
                                    value={formData.target_percentage}
                                    onChange={(e) => handleChange('target_percentage', e.target.value)}
                                    placeholder="0"
                                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <span className="ml-2 text-gray-500 dark:text-gray-400">%</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Can be 0 if planning to sell
                            </p>
                        </div>
                    </div>

                    {/* Optional Cost Basis */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Cost Basis (optional)
                        </label>
                        <div className="flex items-center">
                            <span className="mr-2 text-gray-500 dark:text-gray-400">R</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={formData.cost_basis}
                                onChange={(e) => handleChange('cost_basis', e.target.value)}
                                placeholder="Leave blank to use current market value"
                                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Total amount you&apos;ve paid for this position. If left blank, it will be initialized from the current market value.
                        </p>
                    </div>

                    {/* Add to Google Sheet checkbox */}
                    <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <input
                            type="checkbox"
                            id="addToSheet"
                            checked={addToSheet}
                            onChange={(e) => setAddToSheet(e.target.checked)}
                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div>
                            <label htmlFor="addToSheet" className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                                Also add to Google Sheet
                            </label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Creates a row with the GOOGLEFINANCE formula for live pricing
                            </p>
                        </div>
                    </div>

                    {/* Info box */}
                    <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
                        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        <p className="text-gray-600 dark:text-gray-400">
                            The current price will be fetched automatically from Google Sheets once the ETF is added.
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
                        onClick={handleClose}
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
                                Adding...
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4" />
                                Add ETF
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

