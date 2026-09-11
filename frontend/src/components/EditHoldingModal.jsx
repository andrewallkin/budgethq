import { useState, useEffect } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import axios from 'axios'
import { ModalPortal, paperEyebrow } from './appUi'

const btnBase =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const fieldInput =
    'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const fieldLabel = 'block text-sm font-medium text-[var(--paper-ink)] mb-2'

export default function EditHoldingModal({
    isOpen,
    onClose,
    holding,
    onSuccess,
    portfolioId = null,
}) {
    const [targetPercentage, setTargetPercentage] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (isOpen && holding) {
            const tp = Number(holding.target_percentage)
            setTargetPercentage(Number.isFinite(tp) ? String(tp) : '0')
            setError('')
        }
    }, [isOpen, holding])

    const handleSubmit = async () => {
        if (!holding) return

        const targetPct = parseFloat(targetPercentage)

        if (isNaN(targetPct) || targetPct < 0 || targetPct > 100) {
            setError('Target percentage must be between 0 and 100')
            return
        }

        setSubmitting(true)
        setError('')

        try {
            await axios.put(
                `/api/etf/holdings/${holding.id}`,
                { target_percentage: targetPct },
                portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            )

            onSuccess?.()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update holding')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen || !holding) return null

    const titleId = 'edit-holding-title'

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="mx-4 flex w-full max-w-md flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] sm:mx-auto"
            >
                <div className="flex items-center justify-between border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <div>
                        <h2 id={titleId} className="text-lg font-semibold text-[var(--paper-ink)]">
                            Edit Target Percentage
                        </h2>
                        <p className={`mt-1 ${paperEyebrow}`}>{holding.etf_name}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)] focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="space-y-4 p-5 sm:p-6">
                    <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-3">
                        <div className="mb-1 flex justify-between text-sm">
                            <span className="text-[var(--paper-muted)]">Type</span>
                            <span className="font-medium text-[var(--paper-ink)]">
                                {(holding.instrument_type || 'etf') === 'stock' ? 'Stock' : 'ETF'}
                            </span>
                        </div>
                        <div className="mb-1 flex justify-between text-sm">
                            <span className="text-[var(--paper-muted)]">Region</span>
                            <span className="font-medium text-[var(--paper-ink)]">{holding.region}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-[var(--paper-muted)]">Current Target</span>
                            <span className="font-medium text-[var(--paper-ink)]">
                                {holding.target_percentage.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="edit-target-pct" className={fieldLabel}>
                            New Target Percentage
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                id="edit-target-pct"
                                type="number"
                                inputMode="decimal"
                                step="0.1"
                                min="0"
                                max="100"
                                value={targetPercentage}
                                onChange={(e) => setTargetPercentage(e.target.value)}
                                className={`${fieldInput} flex-1 text-lg font-medium`}
                                autoFocus
                            />
                            <span className="text-xl font-medium text-[var(--paper-muted)]">%</span>
                        </div>
                        <p className="mt-2 text-xs text-[var(--paper-muted)]">
                            Set to 0 if you plan to sell this holding completely
                        </p>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="flex items-center gap-2 rounded-md border border-[var(--paper-brick)]/30 bg-[var(--paper-brick)]/10 p-3 text-sm text-[var(--paper-brick)]"
                        >
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <button type="button" onClick={onClose} className={btnGhost}>
                        Cancel
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={submitting} className={btnPrimary}>
                        {submitting ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--paper-card)]/30 border-t-[var(--paper-card)]" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4" aria-hidden="true" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
        </ModalPortal>
    )
}
