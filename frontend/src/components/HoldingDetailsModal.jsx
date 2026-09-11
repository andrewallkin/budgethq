import { X, TrendingUp, TrendingDown, Calendar, Edit2, Check, X as XIcon, Trash2, AlertCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import axios from 'axios'
import BlurredValue from './BlurredValue'
import { formatCurrency as formatMoney } from '../utils/numberFormatting'
import { ModalPortal, paperEyebrow, paperMoney, paperMoneyTone } from './appUi'

const btnBase =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const btnBrick = `${btnBase} bg-[var(--paper-brick)] text-[var(--paper-card)] hover:opacity-90`
const fieldInput =
    'w-24 rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-2 py-1 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'

export default function HoldingDetailsModal({
    isOpen,
    onClose,
    holding,
    onHoldingUpdate,
    totalPortfolioValue,
    onEdit,
    onBuySell,
    onDelete,
    portfolioId = null,
    currencyCode = 'ZAR',
    showTargetAllocation = true,
}) {
    const [isEditingCostBasis, setIsEditingCostBasis] = useState(false)
    const [editedCostBasis, setEditedCostBasis] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    useEffect(() => {
        if (!isOpen || !holding) return
        setSaveError('')
    }, [isOpen, holding?.id])

    if (!isOpen || !holding) return null

    const isPositive = holding.gain_loss_percentage >= 0
    const titleId = 'holding-details-title'

    const formatCurrency = (value) => {
        if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
        return formatMoney(value, {
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    }

    const costBasisAffix = currencyCode === 'ZAR' ? 'R' : currencyCode

    const handleEditCostBasis = () => {
        setSaveError('')
        setEditedCostBasis(holding.cost_basis.toString())
        setIsEditingCostBasis(true)
    }

    const handleSaveCostBasis = async () => {
        const newCostBasis = parseFloat(editedCostBasis)
        if (isNaN(newCostBasis) || newCostBasis < 0) {
            setSaveError('Please enter a valid positive number')
            return
        }

        setSaveError('')
        setIsSaving(true)
        try {
            const response = await axios.put(
                `/api/etf/holdings/${holding.id}/cost-basis`,
                { cost_basis: newCostBasis },
                portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            )

            if (onHoldingUpdate) {
                onHoldingUpdate(holding.id, {
                    cost_basis: response.data.cost_basis,
                    gain_loss_percentage: response.data.gain_loss_percentage,
                    gain_loss_amount: response.data.gain_loss_amount,
                })
            }

            setIsEditingCostBasis(false)
            setEditedCostBasis('')
        } catch (error) {
            console.error('Failed to update cost basis:', error)
            setSaveError('Failed to update cost basis. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancelEdit = () => {
        setSaveError('')
        setIsEditingCostBasis(false)
        setEditedCostBasis('')
    }

    const formatPercentage = (value) => {
        if (value === null || value === undefined) return '—'
        return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
    }

    const gainTone = paperMoneyTone(holding.gain_loss_percentage)

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] sm:mx-auto"
            >
                <div className="flex items-center justify-between border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <h2 id={titleId} className="text-lg font-semibold text-[var(--paper-ink)]">
                        {holding.etf_name}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)] focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
                    {saveError && (
                        <div
                            role="alert"
                            className="flex items-center gap-2 rounded-md border border-[var(--paper-brick)]/30 bg-[var(--paper-brick)]/10 p-3 text-[var(--paper-brick)]"
                        >
                            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                            <span>{saveError}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-6 text-left">
                            <p className={`mb-3 ${paperEyebrow}`}>Current Value</p>
                            <BlurredValue>
                                <div className={`text-3xl ${paperMoney} text-[var(--paper-ink)]`}>
                                    {formatCurrency(holding.total_value)}
                                </div>
                            </BlurredValue>
                        </div>

                        <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-6 text-left">
                            <div className="mb-3 flex items-center gap-2">
                                {isPositive ? (
                                    <TrendingUp className="h-5 w-5 text-[var(--paper-olive)]" aria-hidden="true" />
                                ) : (
                                    <TrendingDown className="h-5 w-5 text-[var(--paper-brick)]" aria-hidden="true" />
                                )}
                                <span className={paperEyebrow}>Gain/Loss</span>
                            </div>
                            <BlurredValue>
                                <div className="space-y-1">
                                    <div className={`text-2xl font-bold ${gainTone}`}>
                                        {formatPercentage(holding.gain_loss_percentage)}
                                    </div>
                                    <div className={`text-lg font-semibold ${gainTone}`}>
                                        {formatCurrency(holding.gain_loss_amount)}
                                    </div>
                                </div>
                            </BlurredValue>
                        </div>
                    </div>

                    {(onEdit || onBuySell || onDelete) && (
                        <div className="flex flex-wrap gap-2 sm:hidden">
                            {onEdit && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose()
                                        onEdit(holding)
                                    }}
                                    className={btnPrimary}
                                >
                                    <Edit2 className="h-4 w-4" aria-hidden="true" />
                                    Edit Target
                                </button>
                            )}
                            {onBuySell && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose()
                                        onBuySell(holding)
                                    }}
                                    className={btnGhost}
                                >
                                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                                    Buy/Sell
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClose()
                                        onDelete(holding)
                                    }}
                                    className={btnBrick}
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    Delete
                                </button>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                            <h3 className="border-b border-[var(--paper-line)] pb-2 text-base font-medium text-[var(--paper-ink)]">
                                Holding Details
                            </h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Type:</span>
                                    <span className="font-medium text-[var(--paper-ink)]">
                                        {(holding.instrument_type || 'etf') === 'stock' ? 'Stock' : 'ETF'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Name:</span>
                                    <span className="font-medium text-[var(--paper-ink)]">{holding.etf_name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Ticker:</span>
                                    <span className="font-mono font-medium text-[var(--paper-ink)]">
                                        {holding.jse_ticker || '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Shares:</span>
                                    <BlurredValue>
                                        <span className="font-medium text-[var(--paper-ink)]">
                                            {holding.shares?.toFixed(4) || '—'}
                                        </span>
                                    </BlurredValue>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Price:</span>
                                    <BlurredValue>
                                        <span className="font-medium text-[var(--paper-ink)]">
                                            {holding.current_price ? formatCurrency(holding.current_price) : '—'}
                                        </span>
                                    </BlurredValue>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Region:</span>
                                    <span className="font-medium text-[var(--paper-ink)]">{holding.region}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="border-b border-[var(--paper-line)] pb-2 text-base font-medium text-[var(--paper-ink)]">
                                Financial Summary
                            </h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--paper-muted)]">Cost Basis:</span>
                                    {isEditingCostBasis ? (
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center">
                                                <span className="mr-1 text-sm text-[var(--paper-muted)]">
                                                    {costBasisAffix}
                                                </span>
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={editedCostBasis}
                                                    onChange={(e) => setEditedCostBasis(e.target.value)}
                                                    className={fieldInput}
                                                    disabled={isSaving}
                                                    step="0.01"
                                                    min="0"
                                                    autoFocus
                                                    aria-label="Cost basis"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleSaveCostBasis}
                                                disabled={isSaving}
                                                className="cursor-pointer rounded-md p-1 text-[var(--paper-olive)] transition-colors hover:bg-[var(--paper-olive)]/10 focus:ring-2 focus:ring-[var(--paper-accent)]/20 disabled:opacity-50"
                                                title="Save"
                                                aria-label="Save cost basis"
                                            >
                                                <Check className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleCancelEdit}
                                                disabled={isSaving}
                                                className="cursor-pointer rounded-md p-1 text-[var(--paper-brick)] transition-colors hover:bg-[var(--paper-brick)]/10 focus:ring-2 focus:ring-[var(--paper-accent)]/20 disabled:opacity-50"
                                                title="Cancel"
                                                aria-label="Cancel editing cost basis"
                                            >
                                                <XIcon className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        </div>
                                    ) : (
                                        <BlurredValue>
                                            <button
                                                type="button"
                                                className="cursor-pointer rounded-md px-2 py-1 font-medium text-[var(--paper-ink)] transition-colors hover:bg-[var(--paper-canvas)] focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                                                onClick={handleEditCostBasis}
                                                title="Click to edit cost basis"
                                            >
                                                {formatCurrency(holding.cost_basis)}
                                            </button>
                                        </BlurredValue>
                                    )}
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Actual %:</span>
                                    <BlurredValue>
                                        <span className="font-medium text-[var(--paper-ink)]">
                                            {totalPortfolioValue > 0
                                                ? (((holding.total_value || 0) / totalPortfolioValue) * 100).toFixed(1)
                                                : '0.0'}
                                            %
                                        </span>
                                    </BlurredValue>
                                </div>
                                {showTargetAllocation && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--paper-muted)]">Target %:</span>
                                        <BlurredValue>
                                            <span className="font-medium text-[var(--paper-ink)]">
                                                {(Number(holding.target_percentage) || 0).toFixed(1)}%
                                            </span>
                                        </BlurredValue>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Gain/Loss %:</span>
                                    <BlurredValue>
                                        <span className={`font-medium ${gainTone}`}>
                                            {formatPercentage(holding.gain_loss_percentage)}
                                        </span>
                                    </BlurredValue>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--paper-muted)]">Gain/Loss Amount:</span>
                                    <BlurredValue>
                                        <span className={`font-medium ${gainTone}`}>
                                            {formatCurrency(holding.gain_loss_amount)}
                                        </span>
                                    </BlurredValue>
                                </div>
                            </div>
                        </div>
                    </div>

                    {holding.price_updated_at && (
                        <div className="border-t border-[var(--paper-line)] pt-4">
                            <div className="flex items-center gap-2 text-sm text-[var(--paper-muted)]">
                                <Calendar className="h-4 w-4" aria-hidden="true" />
                                <span>
                                    Last price update:{' '}
                                    {new Date(holding.price_updated_at).toLocaleString('en-ZA')}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </ModalPortal>
    )
}
