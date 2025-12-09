import { useState } from 'react'
import { X, Plus, AlertCircle, Info } from 'lucide-react'
import axios from 'axios'

export default function AddBondModal({ isOpen, onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        bond_name: '',
        region: '',
        current_value: '',
        target_percentage: ''
    })
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const resetForm = () => {
        setFormData({
            bond_name: '',
            region: '',
            current_value: '',
            target_percentage: ''
        })
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
        if (!formData.bond_name.trim()) {
            setError('Bond name is required')
            return false
        }
        if (!formData.region.trim()) {
            setError('Region is required')
            return false
        }

        const value = parseFloat(formData.current_value)
        if (isNaN(value) || value < 0) {
            setError('Current value must be a non-negative number')
            return false
        }

        const targetPct = parseFloat(formData.target_percentage)
        if (isNaN(targetPct) || targetPct < 0 || targetPct > 100) {
            setError('Target percentage must be between 0 and 100')
            return false
        }

        return true
    }

    const handleSubmit = async () => {
        if (!validateForm()) return

        setSubmitting(true)
        setError('')

        try {
            await axios.post('/api/bond/holdings', {
                bond_name: formData.bond_name.trim(),
                region: formData.region.trim(),
                current_value: parseFloat(formData.current_value),
                target_percentage: parseFloat(formData.target_percentage)
            })

            onSuccess?.()
            handleClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to add bond holding')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen) return null

    const regions = ['South Africa', 'USA', 'Europe', 'Global', 'Emerging Markets', 'Asia', 'Other']

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Add Government Bond
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Manually track your government bond holdings
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
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Bond Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Bond Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.bond_name}
                            onChange={(e) => handleChange('bond_name', e.target.value)}
                            placeholder="SA Government Bond 2030"
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="">Select region...</option>
                            {regions.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    {/* Current Value and Target % in 2 columns */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Current Value <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center">
                                <span className="mr-2 text-gray-500 dark:text-gray-400">R</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formData.current_value}
                                    onChange={(e) => handleChange('current_value', e.target.value)}
                                    placeholder="0.00"
                                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Total value of bond holding
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
                                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <span className="ml-2 text-gray-500 dark:text-gray-400">%</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Portfolio allocation target
                            </p>
                        </div>
                    </div>

                    {/* Info box */}
                    <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm">
                        <Info className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        <p className="text-gray-600 dark:text-gray-400">
                            Government bonds are tracked manually. You can update the value and buy/sell more anytime without needing a ticker.
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
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Adding...
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4" />
                                Add Bond
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

