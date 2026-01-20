import { useState, useEffect } from 'react'
import { X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import axios from 'axios'

export default function BuySellModal({ isOpen, onClose, holding, onSuccess }) {
    const [transactionType, setTransactionType] = useState('BUY')
    const [shares, setShares] = useState('')
    const [amount, setAmount] = useState('') // For bonds
    const [etfCostBasis, setEtfCostBasis] = useState('') // For ETF BUY transactions
    const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    const isBond = holding?.type === 'BOND'

    // Reset form when modal opens or holding changes
    useEffect(() => {
        if (isOpen && holding) {
            setTransactionType('BUY')
            setShares('')
            setAmount('')
            setEtfCostBasis('')
            setTransactionDate(new Date().toISOString().split('T')[0])
            setError('')
        }
    }, [isOpen, holding])

    const handleSubmit = async () => {
        if (!holding) return

        setSubmitting(true)
        setError('')

        try {
            if (isBond) {
                // Bond transaction logic
                const amountNum = parseFloat(amount)

                if (isNaN(amountNum) || amountNum <= 0) {
                    setError('Please enter a valid amount')
                    setSubmitting(false)
                    return
                }

                if (transactionType === 'SELL' && amountNum > holding.current_value) {
                    setError(`You only have R${holding.current_value.toFixed(2)} available to sell`)
                    setSubmitting(false)
                    return
                }

                await axios.post('/api/bond/transactions', {
                    holding_id: holding.id,
                    transaction_type: transactionType,
                    amount: amountNum,
                    transaction_date: transactionDate
                })
            } else {
                // ETF transaction logic
                const sharesNum = parseFloat(shares)
                const priceNum = holding.current_price

                if (isNaN(sharesNum) || sharesNum <= 0) {
                    setError('Please enter a valid number of shares')
                    setSubmitting(false)
                    return
                }

                if (!priceNum || priceNum <= 0) {
                    setError('No price available. Please sync prices first.')
                    setSubmitting(false)
                    return
                }

                if (transactionType === 'SELL' && sharesNum > holding.shares) {
                    setError(`You only have ${holding.shares} shares available to sell`)
                    setSubmitting(false)
                    return
                }

                const payload = {
                    holding_id: holding.id,
                    transaction_type: transactionType,
                    shares: sharesNum,
                    price_per_share: priceNum,
                    transaction_date: transactionDate
                }

                // For BUY transactions, include optional transaction-level cost basis
                if (transactionType === 'BUY') {
                    const inferredCostBasis = sharesNum * priceNum

                    if (etfCostBasis.trim() === '') {
                        payload.total_cost_basis = inferredCostBasis
                    } else {
                        const override = parseFloat(etfCostBasis)
                        if (isNaN(override) || override < 0) {
                            setError('Cost basis must be a non-negative number')
                            setSubmitting(false)
                            return
                        }
                        payload.total_cost_basis = override
                    }
                }

                await axios.post('/api/etf/transactions', payload)
            }

            onSuccess?.()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to record transaction')
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen || !holding) return null

    // Calculate values based on type
    const totalValue = isBond 
        ? (parseFloat(amount) || 0)
        : (parseFloat(shares) || 0) * (holding?.current_price || 0)
    
    const newShareCount = !isBond && transactionType === 'BUY'
        ? holding.shares + (parseFloat(shares) || 0)
        : !isBond && holding.shares - (parseFloat(shares) || 0)
    
    const newBondValue = isBond && transactionType === 'BUY'
        ? holding.current_value + (parseFloat(amount) || 0)
        : isBond && holding.current_value - (parseFloat(amount) || 0)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
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
                                    {transactionType === 'BUY' ? 'Buy' : 'Sell'} {isBond ? 'Bond' : 'ETF'}
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
                        {!isBond && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">Ticker</span>
                                <span className="font-mono font-medium text-gray-900 dark:text-white">
                                    {holding.jse_ticker}
                                </span>
                            </div>
                        )}
                        <div className={`flex justify-between text-sm ${!isBond ? 'mt-1' : ''}`}>
                            <span className="text-gray-500 dark:text-gray-400">
                                {isBond ? 'Current Value' : 'Current Holdings'}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white">
                                {isBond 
                                    ? `R ${holding.current_value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : `${holding.shares.toFixed(4)} shares`
                                }
                            </span>
                        </div>
                        {!isBond && holding.current_price && (
                            <div className="flex justify-between text-sm mt-1">
                                <span className="text-gray-500 dark:text-gray-400">Latest Price</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                    R {holding.current_price.toFixed(2)}
                                </span>
                            </div>
                        )}
                    </div>

                    {isBond ? (
                        /* Amount for Bonds */
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Amount
                            </label>
                            <div className="flex items-center">
                                <span className="mr-2 text-gray-500 dark:text-gray-400">R</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            {transactionType === 'SELL' && holding.current_value > 0 && (
                                <button
                                    onClick={() => setAmount(holding.current_value.toString())}
                                    className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    Sell all (R {holding.current_value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
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

                            {/* Optional Cost Basis for ETF BUY */}
                            {transactionType === 'BUY' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Cost Basis for This Buy (optional)
                                    </label>
                                    <div className="flex items-center">
                                        <span className="mr-2 text-gray-500 dark:text-gray-400">R</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={etfCostBasis}
                                            onChange={(e) => setEtfCostBasis(e.target.value)}
                                            placeholder={
                                                shares && holding?.current_price
                                                    ? (parseFloat(shares) * holding.current_price).toFixed(2)
                                                    : 'Prepopulated from price × shares'
                                            }
                                            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Total amount you are paying for this buy transaction. Defaults to current price × shares.
                                    </p>
                                </div>
                            )}

                            {/* Price Per Share (Read-only, from Google Sheets) */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Price Per Share
                                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                                        (from Google Sheets)
                                    </span>
                                </label>
                                <div className="flex items-center px-4 py-2.5 bg-gray-100 dark:bg-gray-700/70 border border-gray-200 dark:border-gray-600 rounded-lg">
                                    <span className="text-gray-500 dark:text-gray-400">R</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {holding.current_price?.toFixed(2) || '—'}
                                    </span>
                                </div>
                            </div>
                        </>
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
                    {((isBond && amount) || (!isBond && shares && holding?.current_price)) && (
                        <div className={`p-4 rounded-lg ${
                            transactionType === 'BUY'
                                ? 'bg-green-50 dark:bg-green-900/20'
                                : 'bg-red-50 dark:bg-red-900/20'
                        }`}>
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-gray-600 dark:text-gray-400">
                                    {isBond ? 'Transaction Amount' : 'Total Value'}
                                </span>
                                <span className={`font-bold ${
                                    transactionType === 'BUY'
                                        ? 'text-green-700 dark:text-green-400'
                                        : 'text-red-700 dark:text-red-400'
                                }`}>
                                    R {totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-400">
                                    {isBond ? 'New Bond Value' : 'New Share Count'}
                                </span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                    {isBond 
                                        ? `R ${newBondValue.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : `${newShareCount.toFixed(4)} shares`
                                    }
                                </span>
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
                        disabled={submitting || (isBond ? !amount : (!shares || !holding?.current_price))}
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

