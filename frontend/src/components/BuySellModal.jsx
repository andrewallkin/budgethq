import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import axios from 'axios'
import BlurredValue from './BlurredValue'
import { formatCurrency, formatNumber } from '../utils/numberFormatting'
import { ModalPortal, paperEyebrow, paperMoneyTone } from './appUi'

const btnBase =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const btnBrick = `${btnBase} bg-[var(--paper-brick)] text-[var(--paper-card)] hover:opacity-90`
const fieldInput =
    'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const fieldLabel = 'mb-1 block text-sm font-medium text-[var(--paper-ink)]'

export default function BuySellModal({
    isOpen,
    onClose,
    holding,
    onSuccess,
    portfolioId = null,
    etfOnlyMode = true,
    portfolioCurrencyCode = 'ZAR',
}) {
    const [transactionType, setTransactionType] = useState('BUY')
    const [shares, setShares] = useState('')
    const [pricePerShare, setPricePerShare] = useState('')
    const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const cc = portfolioCurrencyCode || 'ZAR'
    const currencyOpts = useMemo(
        () => ({
            currency: cc,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }),
        [cc]
    )

    const money = useCallback(
        (value, overrides = {}) => formatCurrency(value, { ...currencyOpts, ...overrides }),
        [currencyOpts]
    )

    useEffect(() => {
        if (isOpen && holding) {
            setTransactionType('BUY')
            setShares('')
            setPricePerShare(holding.current_price ? holding.current_price.toString() : '')
            setTransactionDate(new Date().toISOString().split('T')[0])
            setError('')
        }
    }, [isOpen, holding])

    const handleSubmit = async () => {
        if (!holding) return

        setSubmitting(true)
        setError('')

        try {
            const sharesNum = parseFloat(shares)

            if (isNaN(sharesNum) || sharesNum <= 0) {
                setError('Please enter a valid number of shares')
                setSubmitting(false)
                return
            }

            let effectivePrice = null
            if (transactionType === 'BUY') {
                if (pricePerShare.trim() !== '') {
                    const customPrice = parseFloat(pricePerShare)
                    if (isNaN(customPrice) || customPrice <= 0) {
                        setError('Price per share must be a positive number')
                        setSubmitting(false)
                        return
                    }
                    effectivePrice = customPrice
                } else if (!holding.current_price || holding.current_price <= 0) {
                    setError('No price available. Please enter a price or sync prices first.')
                    setSubmitting(false)
                    return
                } else {
                    effectivePrice = holding.current_price
                }
            } else if (!holding.current_price || holding.current_price <= 0) {
                setError('No price available. Please sync prices first.')
                setSubmitting(false)
                return
            } else {
                effectivePrice = holding.current_price
            }

            if (transactionType === 'SELL' && sharesNum > holding.shares) {
                setError(
                    `You only have ${formatNumber(holding.shares, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 4,
                    })} shares available to sell`
                )
                setSubmitting(false)
                return
            }

            const payload = {
                holding_id: holding.id,
                transaction_type: transactionType,
                shares: sharesNum,
                price_per_share: effectivePrice,
                transaction_date: transactionDate,
            }
            if (transactionType === 'BUY') {
                payload.total_cost_basis = sharesNum * effectivePrice
            }

            await axios.post(
                '/api/etf/transactions',
                payload,
                portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            )

            onSuccess?.()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to record transaction')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen || !holding) return null

    const effectivePriceForDisplay =
        transactionType === 'BUY' && pricePerShare.trim() !== ''
            ? parseFloat(pricePerShare) || holding?.current_price || 0
            : holding?.current_price || 0

    const totalValue = (parseFloat(shares) || 0) * effectivePriceForDisplay
    const newShareCount =
        transactionType === 'BUY'
            ? holding.shares + (parseFloat(shares) || 0)
            : holding.shares - (parseFloat(shares) || 0)

    const titleId = 'buy-sell-modal-title'
    const isBuy = transactionType === 'BUY'

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="mx-4 flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] sm:mx-auto"
            >
                <div className="flex items-center justify-between border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        {isBuy ? (
                            <TrendingUp className="h-6 w-6 text-[var(--paper-olive)]" aria-hidden="true" />
                        ) : (
                            <TrendingDown className="h-6 w-6 text-[var(--paper-brick)]" aria-hidden="true" />
                        )}
                        <div>
                            <h2 id={titleId} className="text-lg font-semibold text-[var(--paper-ink)]">
                                {isBuy ? 'Buy' : 'Sell'} {etfOnlyMode ? 'ETF' : 'holding'}
                            </h2>
                            <p className={paperEyebrow}>{holding.etf_name}</p>
                        </div>
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

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
                    <div
                        className="flex overflow-hidden rounded-md border border-[var(--paper-line)]"
                        role="group"
                        aria-label="Transaction type"
                    >
                        <button
                            type="button"
                            onClick={() => setTransactionType('BUY')}
                            className={`flex-1 cursor-pointer py-2.5 text-sm font-medium transition-colors focus:ring-2 focus:ring-inset focus:ring-[var(--paper-accent)]/20 ${
                                isBuy
                                    ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                    : 'bg-[var(--paper-card)] text-[var(--paper-muted)] hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)]'
                            }`}
                        >
                            Buy
                        </button>
                        <button
                            type="button"
                            onClick={() => setTransactionType('SELL')}
                            className={`flex-1 cursor-pointer border-l border-[var(--paper-line)] py-2.5 text-sm font-medium transition-colors focus:ring-2 focus:ring-inset focus:ring-[var(--paper-accent)]/20 ${
                                !isBuy
                                    ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                    : 'bg-[var(--paper-card)] text-[var(--paper-muted)] hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)]'
                            }`}
                        >
                            Sell
                        </button>
                    </div>

                    <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-[var(--paper-muted)]">Ticker</span>
                            <span className="font-mono font-medium text-[var(--paper-ink)]">
                                {holding.jse_ticker}
                            </span>
                        </div>
                        <div className="mt-1 flex justify-between text-sm">
                            <span className="text-[var(--paper-muted)]">Current Holdings</span>
                            <BlurredValue>
                                <span className="font-medium text-[var(--paper-ink)]">
                                    {`${formatNumber(holding.shares, {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 4,
                                    })} shares`}
                                </span>
                            </BlurredValue>
                        </div>
                        {holding.current_price && (
                            <div className="mt-1 flex justify-between text-sm">
                                <span className="text-[var(--paper-muted)]">Latest Price</span>
                                <BlurredValue>
                                    <span className="font-medium text-[var(--paper-ink)]">
                                        {money(holding.current_price)}
                                    </span>
                                </BlurredValue>
                            </div>
                        )}
                    </div>

                    <div>
                        <label htmlFor="buy-sell-shares" className={fieldLabel}>
                            Number of Shares
                        </label>
                        <input
                            id="buy-sell-shares"
                            type="number"
                            step="0.0001"
                            value={shares}
                            onChange={(e) => setShares(e.target.value)}
                            placeholder="0.0000"
                            className={fieldInput}
                        />
                        {!isBuy && holding.shares > 0 && (
                            <button
                                type="button"
                                onClick={() => setShares(holding.shares.toString())}
                                className="mt-1 cursor-pointer text-xs text-[var(--paper-accent)] hover:underline focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                            >
                                Sell all ({holding.shares.toFixed(4)} shares)
                            </button>
                        )}
                    </div>

                    {isBuy ? (
                        <div>
                            <label htmlFor="buy-sell-price" className={fieldLabel}>
                                Price Per Share{' '}
                                {!etfOnlyMode && (
                                    <span className="font-normal text-[var(--paper-muted)]">({cc})</span>
                                )}
                            </label>
                            <input
                                id="buy-sell-price"
                                type="number"
                                step="0.0001"
                                min="0"
                                value={pricePerShare}
                                onChange={(e) => setPricePerShare(e.target.value)}
                                placeholder={
                                    holding.current_price
                                        ? holding.current_price.toFixed(2)
                                        : 'Leave blank to use Google Sheets price'
                                }
                                className={fieldInput}
                            />
                            <p className="mt-1 text-xs text-[var(--paper-muted)]">
                                Editable. Leave blank to use current Google Sheets price.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <span className={fieldLabel}>
                                Price Per Share
                                <span className="ml-2 text-xs font-normal text-[var(--paper-muted)]">
                                    (from Google Sheets)
                                </span>
                            </span>
                            <div className="flex items-center rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] px-3 py-2.5">
                                <span className="font-medium text-[var(--paper-ink)]">
                                    <BlurredValue>
                                        {holding.current_price != null ? money(holding.current_price) : '—'}
                                    </BlurredValue>
                                </span>
                            </div>
                        </div>
                    )}

                    <div>
                        <label htmlFor="buy-sell-date" className={fieldLabel}>
                            Transaction Date
                        </label>
                        <input
                            id="buy-sell-date"
                            type="date"
                            value={transactionDate}
                            onChange={(e) => setTransactionDate(e.target.value)}
                            className={fieldInput}
                        />
                    </div>

                    {shares &&
                        (transactionType === 'SELL'
                            ? holding?.current_price
                            : pricePerShare.trim() || holding?.current_price) && (
                            <div
                                className={`rounded-md border p-4 ${
                                    isBuy
                                        ? 'border-[var(--paper-olive)]/30 bg-[var(--paper-olive)]/10'
                                        : 'border-[var(--paper-brick)]/30 bg-[var(--paper-brick)]/10'
                                }`}
                            >
                                <div className="mb-2 flex justify-between text-sm">
                                    <span className="text-[var(--paper-muted)]">Total Value</span>
                                    <span className={`font-bold ${paperMoneyTone(isBuy ? -1 : 1)}`}>
                                        <BlurredValue>{money(totalValue)}</BlurredValue>
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--paper-muted)]">New Share Count</span>
                                    <BlurredValue>
                                        <span className="font-medium text-[var(--paper-ink)]">
                                            {`${formatNumber(newShareCount, {
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 4,
                                            })} shares`}
                                        </span>
                                    </BlurredValue>
                                </div>
                            </div>
                        )}

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
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={
                            submitting ||
                            !shares ||
                            (transactionType === 'SELL'
                                ? !holding?.current_price
                                : !pricePerShare.trim() && !holding?.current_price)
                        }
                        className={isBuy ? btnPrimary : btnBrick}
                    >
                        {submitting ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--paper-card)]/30 border-t-[var(--paper-card)]" />
                                Processing...
                            </>
                        ) : (
                            <>
                                {isBuy ? (
                                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                    <TrendingDown className="h-4 w-4" aria-hidden="true" />
                                )}
                                Confirm {isBuy ? 'Buy' : 'Sell'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
        </ModalPortal>
    )
}
