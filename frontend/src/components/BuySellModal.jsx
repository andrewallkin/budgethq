import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import axios from 'axios'
import BlurredValue from './BlurredValue'
import { formatCurrency, formatNumber } from '../utils/numberFormatting'

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

    const money = useCallback((value, overrides = {}) => formatCurrency(value, { ...currencyOpts, ...overrides }), [currencyOpts])

    // Reset form when modal opens or holding changes
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
                transaction_date: transactionDate
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

    const effectivePriceForDisplay = transactionType === 'BUY' && pricePerShare.trim() !== ''
        ? parseFloat(pricePerShare) || holding?.current_price || 0
        : (holding?.current_price || 0)

    const totalValue = (parseFloat(shares) || 0) * effectivePriceForDisplay
    const newShareCount = transactionType === 'BUY'
        ? holding.shares + (parseFloat(shares) || 0)
        : holding.shares - (parseFloat(shares) || 0)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 sm:mx-auto max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className={`p-6 ${
                    transactionType === 'BUY'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                        : 'bg-gradient-to-r from-red-500 to-rose-600'
                }`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {transactionType === 'BUY' ? (
                                <TrendingUp className="w-6 h-6 text-white" />
                            ) : (
                                <TrendingDown className="w-6 h-6 text-white" />
                            )}
                            <div>
                                <h2 className="text-xl font-bold text-white">
                                    {transactionType === 'BUY' ? 'Buy' : 'Sell'} {etfOnlyMode ? 'ETF' : 'holding'}
                                </h2>
                                <p className="text-white/80 text-sm">{holding.etf_name}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Transaction Type Toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setTransactionType('BUY')}
                            className={`flex-1 py-2.5 font-medium transition-colors ${
                                transactionType === 'BUY'
                                    ? 'bg-green-500 text-white'
                                    : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                        >
                            Buy
                        </button>
                        <button
                            onClick={() => setTransactionType('SELL')}
                            className={`flex-1 py-2.5 font-medium transition-colors ${
                                transactionType === 'SELL'
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                        >
                            Sell
                        </button>
                    </div>

                    {/* Current Holdings Info */}
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Ticker</span>
                            <span className="font-mono font-medium text-gray-900 dark:text-white">
                                {holding.jse_ticker}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-gray-500 dark:text-gray-400">
                                Current Holdings
                            </span>
                            <BlurredValue><span className="font-medium text-gray-900 dark:text-white">
                                {`${formatNumber(holding.shares, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 4,
                                })} shares`}
                            </span></BlurredValue>
                        </div>
                        {holding.current_price && (
                            <div className="flex justify-between text-sm mt-1">
                                <span className="text-gray-500 dark:text-gray-400">Latest Price</span>
                                <BlurredValue><span className="font-medium text-gray-900 dark:text-white">
                                    {money(holding.current_price)}
                                </span></BlurredValue>
                            </div>
                        )}
                    </div>

                    {/* Number of Shares */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Number of Shares
                        </label>
                        <input
                            type="number"
                            step="0.0001"
                            value={shares}
                            onChange={(e) => setShares(e.target.value)}
                            placeholder="0.0000"
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        {transactionType === 'SELL' && holding.shares > 0 && (
                            <button
                                onClick={() => setShares(holding.shares.toString())}
                                className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Sell all ({holding.shares.toFixed(4)} shares)
                            </button>
                        )}
                    </div>

                    {/* Price Per Share - Editable for BUY, Read-only for SELL */}
                    {transactionType === 'BUY' ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Price Per Share {!etfOnlyMode && <span className="font-normal text-gray-500">({cc})</span>}
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    step="0.0001"
                                    min="0"
                                    value={pricePerShare}
                                    onChange={(e) => setPricePerShare(e.target.value)}
                                    placeholder={holding.current_price ? holding.current_price.toFixed(2) : 'Leave blank to use Google Sheets price'}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Editable. Leave blank to use current Google Sheets price.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Price Per Share
                                <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                                    (from Google Sheets)
                                </span>
                            </label>
                            <div className="flex items-center px-4 py-2.5 bg-gray-100 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 rounded-lg">
                                <span className="font-medium text-gray-900 dark:text-white">
                                    <BlurredValue>
                                        {holding.current_price != null
                                            ? money(holding.current_price)
                                            : '—'}
                                    </BlurredValue>
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Transaction Date */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Transaction Date
                        </label>
                        <input
                            type="date"
                            value={transactionDate}
                            onChange={(e) => setTransactionDate(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>

                    {/* Transaction Summary */}
                    {shares && (transactionType === 'SELL' ? holding?.current_price : (pricePerShare.trim() || holding?.current_price)) && (
                        <div className={`p-4 rounded-lg ${
                            transactionType === 'BUY'
                                ? 'bg-green-50 dark:bg-green-900/20'
                                : 'bg-red-50 dark:bg-red-900/20'
                        }`}>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-600 dark:text-gray-400">
                                    Total Value
                                </span>
                                <span
                                    className={`font-bold ${
                                        transactionType === 'BUY'
                                            ? 'text-green-700 dark:text-green-400'
                                            : 'text-red-700 dark:text-red-400'
                                    }`}
                                >
                                    <BlurredValue>{money(totalValue)}</BlurredValue>
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-400">
                                    New Share Count
                                </span>
                                <BlurredValue><span className="font-medium text-gray-900 dark:text-white">
                                    {`${formatNumber(newShareCount, {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 4,
                                    })} shares`}
                                </span></BlurredValue>
                            </div>
                        </div>
                    )}

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
                        disabled={submitting || (!shares || (transactionType === 'SELL' ? !holding?.current_price : (!pricePerShare.trim() && !holding?.current_price)))}
                        className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                            transactionType === 'BUY'
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-red-600 hover:bg-red-700'
                        }`}
                    >
                        {submitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                {transactionType === 'BUY' ? (
                                    <TrendingUp className="w-4 h-4" />
                                ) : (
                                    <TrendingDown className="w-4 h-4" />
                                )}
                                Confirm {transactionType === 'BUY' ? 'Buy' : 'Sell'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

