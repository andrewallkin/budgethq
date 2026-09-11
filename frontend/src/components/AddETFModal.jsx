import { useState } from 'react'
import { X, Plus, AlertCircle, Info } from 'lucide-react'
import axios from 'axios'
import { ModalPortal, paperEyebrow } from './appUi'

const TICKER_RE_NON_JSE = /^[A-Z0-9:.\-^]+$/

const btnBase =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const fieldInput =
    'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const fieldLabel = 'mb-1 block text-sm font-medium text-[var(--paper-ink)]'
const fieldHint = 'mt-1 text-xs text-[var(--paper-muted)]'
const requiredMark = 'text-[var(--paper-brick)]'

export default function AddETFModal({
    isOpen,
    onClose,
    onSuccess,
    portfolioId = null,
    requireJsePrefix = true,
    etfOnlyMode = true,
    portfolioCurrencyCode = 'ZAR',
    allocationOptional = false,
}) {
    const [formData, setFormData] = useState({
        jse_ticker: '',
        etf_name: '',
        region: '',
        shares: '',
        target_percentage: '',
        cost_basis: '',
        instrument_type: 'etf',
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
            cost_basis: '',
            instrument_type: 'etf',
        })
        setAddToSheet(true)
        setError('')
    }

    const handleClose = () => {
        resetForm()
        onClose()
    }

    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
        setError('')
    }

    const validateForm = () => {
        const tickerTrim = formData.jse_ticker.trim()
        if (!tickerTrim) {
            setError(requireJsePrefix ? 'JSE Ticker is required' : 'Ticker is required')
            return false
        }
        if (requireJsePrefix) {
            if (!formData.jse_ticker.startsWith('JSE:')) {
                setError('Ticker must start with "JSE:" (e.g., JSE:STX40)')
                return false
            }
        } else if (!TICKER_RE_NON_JSE.test(tickerTrim.toUpperCase()) || tickerTrim.length > 64) {
            setError('Ticker may only contain letters, numbers, colon, dot, hyphen, or caret')
            return false
        }

        const nameEmptyMsg = etfOnlyMode ? 'ETF Name is required' : 'Instrument name is required'
        if (!formData.etf_name.trim()) {
            setError(nameEmptyMsg)
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

        const targetPctRaw = formData.target_percentage.trim()
        const targetPct =
            allocationOptional && targetPctRaw === '' ? 0 : parseFloat(formData.target_percentage)
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
            const requestConfig = portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            if (addToSheet) {
                try {
                    await axios.post(
                        '/api/etf/add-to-sheet',
                        {
                            jse_ticker: formData.jse_ticker.trim(),
                            etf_name: formData.etf_name.trim(),
                        },
                        requestConfig
                    )
                } catch (sheetErr) {
                    if (!sheetErr.response?.data?.detail?.includes('already exists')) {
                        console.warn('Could not add to sheet:', sheetErr.response?.data?.detail)
                    }
                }
            }

            const payload = {
                jse_ticker: formData.jse_ticker.trim(),
                etf_name: formData.etf_name.trim(),
                region: formData.region.trim(),
                shares: parseFloat(formData.shares),
                target_percentage:
                    allocationOptional && formData.target_percentage.trim() === ''
                        ? 0
                        : parseFloat(formData.target_percentage),
                instrument_type: etfOnlyMode ? 'etf' : formData.instrument_type,
            }

            if (formData.cost_basis.trim() !== '') {
                payload.cost_basis = parseFloat(formData.cost_basis)
            }

            await axios.post('/api/etf/holdings', payload, requestConfig)

            onSuccess?.()
            handleClose()
        } catch (err) {
            setError(err.response?.data?.detail || `Failed to add ${etfOnlyMode ? 'ETF' : 'holding'}`)
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen) return null

    const tickerLabel = requireJsePrefix ? 'JSE Ticker' : 'Ticker symbol'
    const nameLabel = etfOnlyMode ? 'ETF Name' : 'Instrument name'
    const title = etfOnlyMode ? 'Add New ETF' : 'Add holding'
    const subtitle = etfOnlyMode
        ? 'Add a new ETF to your portfolio'
        : 'Add a stock, ETF, or other listed instrument'
    const titleId = 'add-etf-modal-title'
    const regions = ['South Africa', 'USA', 'Europe', 'Global', 'Emerging Markets', 'Asia', 'Other']

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] sm:mx-auto"
            >
                <div className="flex items-center justify-between border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <div>
                        <h2 id={titleId} className="text-lg font-semibold text-[var(--paper-ink)]">
                            {title}
                        </h2>
                        <p className={`mt-1 ${paperEyebrow}`}>{subtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close"
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)] focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                    <div>
                        <label htmlFor="add-etf-ticker" className={fieldLabel}>
                            {tickerLabel} <span className={requiredMark}>*</span>
                        </label>
                        <input
                            id="add-etf-ticker"
                            type="text"
                            value={formData.jse_ticker}
                            onChange={(e) => handleChange('jse_ticker', e.target.value.toUpperCase())}
                            placeholder={requireJsePrefix ? 'JSE:STX40' : 'NASDAQ:AAPL, MSFT, …'}
                            className={`${fieldInput} font-mono`}
                        />
                        <p className={fieldHint}>
                            {requireJsePrefix
                                ? 'Format: JSE:TICKER (e.g., JSE:STX40, JSE:STXNDQ)'
                                : 'Use a Google Finance ticker (e.g. JSE:NPN, NASDAQ:AAPL, NYSE:BRK.B)'}
                        </p>
                    </div>

                    <div>
                        <label htmlFor="add-etf-name" className={fieldLabel}>
                            {nameLabel} <span className={requiredMark}>*</span>
                        </label>
                        <input
                            id="add-etf-name"
                            type="text"
                            value={formData.etf_name}
                            onChange={(e) => handleChange('etf_name', e.target.value)}
                            placeholder="Satrix Top 40"
                            className={fieldInput}
                        />
                    </div>

                    <div>
                        <label htmlFor="add-etf-region" className={fieldLabel}>
                            Region <span className={requiredMark}>*</span>
                        </label>
                        <select
                            id="add-etf-region"
                            value={formData.region}
                            onChange={(e) => handleChange('region', e.target.value)}
                            className={fieldInput}
                        >
                            <option value="">Select region...</option>
                            {regions.map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!etfOnlyMode && (
                        <div>
                            <label htmlFor="add-etf-instrument-type" className={fieldLabel}>
                                Instrument type
                            </label>
                            <select
                                id="add-etf-instrument-type"
                                value={formData.instrument_type}
                                onChange={(e) => handleChange('instrument_type', e.target.value)}
                                className={fieldInput}
                            >
                                <option value="etf">ETF</option>
                                <option value="stock">Stock</option>
                            </select>
                        </div>
                    )}

                    <div className={`grid grid-cols-1 gap-4 ${allocationOptional ? '' : 'sm:grid-cols-2'}`}>
                        <div>
                            <label htmlFor="add-etf-shares" className={fieldLabel}>
                                Number of Shares <span className={requiredMark}>*</span>
                            </label>
                            <input
                                id="add-etf-shares"
                                type="number"
                                step="0.0001"
                                value={formData.shares}
                                onChange={(e) => handleChange('shares', e.target.value)}
                                placeholder="0"
                                className={fieldInput}
                            />
                            <p className={fieldHint}>Can be 0 if planning to buy</p>
                        </div>
                        {!allocationOptional && (
                            <div>
                                <label htmlFor="add-etf-target" className={fieldLabel}>
                                    Target % <span className={requiredMark}>*</span>
                                </label>
                                <div className="flex items-center">
                                    <input
                                        id="add-etf-target"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        value={formData.target_percentage}
                                        onChange={(e) => handleChange('target_percentage', e.target.value)}
                                        placeholder="0"
                                        className={`${fieldInput} flex-1`}
                                    />
                                    <span className="ml-2 text-[var(--paper-muted)]">%</span>
                                </div>
                                <p className={fieldHint}>Can be 0 if planning to sell</p>
                            </div>
                        )}
                    </div>

                    <div>
                        <label htmlFor="add-etf-cost-basis" className={fieldLabel}>
                            Cost Basis (optional)
                            {!etfOnlyMode && (
                                <span className="font-normal text-[var(--paper-muted)]">
                                    {' '}
                                    — {portfolioCurrencyCode}
                                </span>
                            )}
                        </label>
                        <div className="flex items-center">
                            {etfOnlyMode && (
                                <span className="mr-2 text-[var(--paper-muted)]">R</span>
                            )}
                            <input
                                id="add-etf-cost-basis"
                                type="number"
                                step="0.01"
                                min="0"
                                value={formData.cost_basis}
                                onChange={(e) => handleChange('cost_basis', e.target.value)}
                                placeholder="Leave blank to use current market value"
                                className={`${fieldInput} flex-1`}
                            />
                        </div>
                        <p className={fieldHint}>
                            Total amount you&apos;ve paid for this position. If left blank, it will be
                            initialized from the current market value.
                        </p>
                    </div>

                    <div className="flex items-start gap-3 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-3">
                        <input
                            type="checkbox"
                            id="addToSheet"
                            checked={addToSheet}
                            onChange={(e) => setAddToSheet(e.target.checked)}
                            className="mt-1 h-4 w-4 cursor-pointer rounded border-[var(--paper-line)] text-[var(--paper-accent)] focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                        />
                        <div>
                            <label
                                htmlFor="addToSheet"
                                className="cursor-pointer text-sm font-medium text-[var(--paper-ink)]"
                            >
                                Also add to Google Sheet
                            </label>
                            <p className={`mt-0.5 ${fieldHint}`}>
                                Creates a row with the GOOGLEFINANCE formula for live pricing
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-3 text-sm">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--paper-accent)]" aria-hidden="true" />
                        <p className="text-[var(--paper-muted)]">
                            The current price will be fetched automatically from Google Sheets once{' '}
                            {etfOnlyMode ? 'the ETF is added' : 'the holding is added'}.
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
                    <button type="button" onClick={handleClose} className={btnGhost}>
                        Cancel
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={submitting} className={btnPrimary}>
                        {submitting ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--paper-card)]/30 border-t-[var(--paper-card)]" />
                                Adding...
                            </>
                        ) : (
                            <>
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Add {etfOnlyMode ? 'ETF' : 'holding'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
        </ModalPortal>
    )
}
