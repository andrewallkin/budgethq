import { X, TrendingUp, TrendingDown, Target, Calendar, Edit2, Check, X as XIcon, Trash2 } from 'lucide-react'
import GainLossIndicator from './GainLossIndicator'
import { useState } from 'react'
import axios from 'axios'

export default function HoldingDetailsModal({ isOpen, onClose, holding, onHoldingUpdate, totalPortfolioValue, onEdit, onBuySell, onDelete }) {
    const [isEditingCostBasis, setIsEditingCostBasis] = useState(false)
    const [editedCostBasis, setEditedCostBasis] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    if (!isOpen || !holding) return null

    const isETF = holding.type === 'ETF'
    const isPositive = holding.gain_loss_percentage >= 0

    const formatCurrency = (value) => {
        if (value === null || value === undefined) return '—'
        return new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: 'ZAR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value)
    }

    const handleEditCostBasis = () => {
        setEditedCostBasis(holding.cost_basis.toString())
        setIsEditingCostBasis(true)
    }

    const handleSaveCostBasis = async () => {
        const newCostBasis = parseFloat(editedCostBasis)
        if (isNaN(newCostBasis) || newCostBasis < 0) {
            alert('Please enter a valid positive number')
            return
        }

        setIsSaving(true)
        try {
            const endpoint = holding.type === 'ETF' ? `/api/etf/holdings/${holding.id}/cost-basis` : `/api/bond/holdings/${holding.id}/cost-basis`
            const response = await axios.put(endpoint, { cost_basis: newCostBasis })

            // Update the holding with new values
            if (onHoldingUpdate) {
                onHoldingUpdate(holding.id, {
                    cost_basis: response.data.cost_basis,
                    gain_loss_percentage: response.data.gain_loss_percentage,
                    gain_loss_amount: response.data.gain_loss_amount
                })
            }

            // Close edit mode
            setIsEditingCostBasis(false)
            setEditedCostBasis('')
        } catch (error) {
            console.error('Failed to update cost basis:', error)
            alert('Failed to update cost basis. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancelEdit = () => {
        setIsEditingCostBasis(false)
        setEditedCostBasis('')
    }

    const formatPercentage = (value) => {
        if (value === null || value === undefined) return '—'
        return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full mx-4 sm:mx-auto max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            {isETF ? holding.etf_name : holding.bond_name}
                        </h2>
                        {holding.type === 'BOND' && (
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                                BOND
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Current Value & Performance */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg text-left">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-lg">💰</span>
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Current Value</span>
                            </div>
                            <div className="text-3xl font-bold text-gray-900 dark:text-white">
                                {formatCurrency(isETF ? holding.total_value : holding.current_value)}
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg text-left">
                            <div className="flex items-center gap-2 mb-3">
                                {isPositive ? (
                                    <TrendingUp className="w-5 h-5 text-green-500" />
                                ) : (
                                    <TrendingDown className="w-5 h-5 text-red-500" />
                                )}
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Gain/Loss</span>
                            </div>
                            <div className="space-y-1">
                                <div className={`text-2xl font-bold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {formatPercentage(holding.gain_loss_percentage)}
                                </div>
                                <div className={`text-lg font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {formatCurrency(holding.gain_loss_amount)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons - visible on mobile when table actions are hidden */}
                    {(onEdit || onBuySell || onDelete) && (
                        <div className="flex flex-wrap gap-2 sm:hidden">
                            {onEdit && (
                                <button
                                    onClick={() => { onClose(); onEdit(holding); }}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                >
                                    <Edit2 className="w-4 h-4" />
                                    Edit Target
                                </button>
                            )}
                            {onBuySell && (
                                <button
                                    onClick={() => { onClose(); onBuySell(holding); }}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                >
                                    <TrendingUp className="w-4 h-4" />
                                    Buy/Sell
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    onClick={() => { onClose(); onDelete(holding); }}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                </button>
                            )}
                        </div>
                    )}

                    {/* Detailed Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                                Holding Details
                            </h3>

                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Name:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {isETF ? holding.etf_name : holding.bond_name}
                                    </span>
                                </div>

                                {isETF && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600 dark:text-gray-400">Ticker:</span>
                                            <span className="font-medium text-gray-900 dark:text-white font-mono">
                                                {holding.jse_ticker || '—'}
                                            </span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span className="text-gray-600 dark:text-gray-400">Shares:</span>
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                {holding.shares?.toFixed(4) || '—'}
                                            </span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span className="text-gray-600 dark:text-gray-400">Price:</span>
                                            <span className="font-medium text-gray-900 dark:text-white">
                                                {holding.current_price ? formatCurrency(holding.current_price) : '—'}
                                            </span>
                                        </div>
                                    </>
                                )}

                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Region:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {holding.region}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                                Financial Summary
                            </h3>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 dark:text-gray-400">Cost Basis:</span>
                                    {isEditingCostBasis ? (
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center">
                                                <span className="mr-1 text-gray-500 dark:text-gray-400 text-sm">R</span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={editedCostBasis}
                                                    onChange={(e) => setEditedCostBasis(e.target.value)}
                                                    className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                    disabled={isSaving}
                                                    step="0.01"
                                                    min="0"
                                                    autoFocus
                                                />
                                            </div>
                                            <button
                                                onClick={handleSaveCostBasis}
                                                disabled={isSaving}
                                                className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors disabled:opacity-50"
                                                title="Save"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={handleCancelEdit}
                                                disabled={isSaving}
                                                className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                                                title="Cancel"
                                            >
                                                <XIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <span
                                            className="font-medium text-gray-900 dark:text-white cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded transition-colors"
                                            onClick={handleEditCostBasis}
                                            title="Click to edit cost basis"
                                        >
                                            {formatCurrency(holding.cost_basis)}
                                        </span>
                                    )}
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Actual %:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {totalPortfolioValue > 0
                                            ? ((isETF ? holding.total_value : holding.current_value || 0) / totalPortfolioValue * 100).toFixed(1)
                                            : '0.0'}%
                                    </span>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Target %:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {holding.target_percentage.toFixed(1)}%
                                    </span>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Gain/Loss %:</span>
                                    <span className={`font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {formatPercentage(holding.gain_loss_percentage)}
                                    </span>
                                </div>

                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">Gain/Loss Amount:</span>
                                    <span className={`font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {formatCurrency(holding.gain_loss_amount)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Additional Info */}
                    {isETF && holding.price_updated_at && (
                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                <Calendar className="w-4 h-4" />
                                <span>Last price update: {new Date(holding.price_updated_at).toLocaleString('en-ZA')}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
