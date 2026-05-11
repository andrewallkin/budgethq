import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, History, Trash2 } from 'lucide-react'
import axios from 'axios'
import ConfirmModal from './ConfirmModal'
import { formatCurrency, formatNumber } from '../utils/numberFormatting'
import BlurredValue from './BlurredValue'

export default function TransactionHistory({
    refreshTrigger,
    onTransactionDeleted,
    portfolioId = null,
    currencyFormatOpts = { currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 },
    transactionDeleteModalTitle = 'Delete ETF Transaction',
}) {
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [transactionToDelete, setTransactionToDelete] = useState(null)

    useEffect(() => {
        fetchTransactions()
    }, [refreshTrigger])

    const fetchTransactions = async () => {
        try {
            const etfRes = await axios.get(
                '/api/etf/transactions',
                portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            )
            const etfTransactions = (etfRes.data || []).map(tx => ({
                ...tx,
                type: 'Holding',
                name: tx.etf_name
            }))
            const allTransactions = etfTransactions.sort(
                (a, b) => {
                    const dateA = a.created_at ? new Date(a.created_at) : new Date(a.transaction_date)
                    const dateB = b.created_at ? new Date(b.created_at) : new Date(b.transaction_date)
                    return dateB - dateA
                }
            )

            setTransactions(allTransactions)
        } catch (err) {
            console.error('Failed to fetch transactions:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteClick = (transaction) => {
        setTransactionToDelete(transaction)
        setShowDeleteConfirm(true)
    }

    const handleDeleteConfirm = async () => {
        if (!transactionToDelete) return

        try {
            const endpoint = `/api/etf/transactions/${transactionToDelete.id}`
            await axios.delete(endpoint, portfolioId ? { params: { portfolio_id: portfolioId } } : undefined)

            // Refresh transactions list
            await fetchTransactions()

            // Trigger parent refresh if callback provided
            if (onTransactionDeleted) {
                onTransactionDeleted()
            }
        } catch (err) {
            console.error('Failed to delete transaction', err)
            alert(err.response?.data?.detail || 'Failed to delete transaction')
        } finally {
            setTransactionToDelete(null)
        }
    }

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
                    <div className="space-y-2">
                        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    </div>
                </div>
            </div>
        )
    }

    if (transactions.length === 0) {
        return null // Don't show if no transactions
    }

    const displayedTransactions = expanded ? transactions : transactions.slice(0, 5)

    return (
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-500" />
                    Transaction History
                </h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </span>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 sm:hidden">Swipe horizontally to see all columns</p>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[600px]">
                    <thead>
                        <tr className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-3 px-2">Date</th>
                            <th className="text-left py-3 px-2">Type</th>
                            <th className="text-left py-3 px-2">Asset</th>
                            <th className="text-right py-3 px-2">Shares</th>
                            <th className="text-right py-3 px-2">Price</th>
                            <th className="text-right py-3 px-2">Amount</th>
                            <th className="text-center py-3 px-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {displayedTransactions.map((tx) => (
                            <tr key={`${tx.type}-${tx.id}`} className="text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td className="py-3 px-2 text-gray-600 dark:text-gray-400">
                                    {new Date(tx.transaction_date).toLocaleDateString('en-ZA', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric'
                                    })}
                                </td>
                                <td className="py-3 px-2">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tx.transaction_type === 'BUY'
                                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                        }`}>
                                        {tx.transaction_type === 'BUY' ? (
                                            <TrendingUp className="w-3 h-3" />
                                        ) : (
                                            <TrendingDown className="w-3 h-3" />
                                        )}
                                        {tx.transaction_type}
                                    </span>
                                </td>
                                <td className="py-3 px-2">
                                    <div className="flex items-center gap-2">
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {tx.name}
                                            </div>
                                            {tx.jse_ticker && (
                                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                                    {tx.jse_ticker}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-2 text-right font-medium text-gray-900 dark:text-white">
                                    <BlurredValue>{formatNumber(tx.shares, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</BlurredValue>
                                </td>
                                <td className="py-3 px-2 text-right text-gray-600 dark:text-gray-400">
                                    <BlurredValue>{formatCurrency(tx.price_per_share, currencyFormatOpts)}</BlurredValue>
                                </td>
                                <td
                                    className={`py-3 px-2 text-right font-semibold ${
                                        tx.transaction_type === 'BUY'
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400'
                                    }`}
                                >
                                    {tx.transaction_type === 'BUY' ? '-' : '+'}
                                    <BlurredValue>{formatCurrency(tx.total_value, currencyFormatOpts)}</BlurredValue>
                                </td>
                                <td className="py-3 px-2">
                                    <button
                                        onClick={() => handleDeleteClick(tx)}
                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                        title="Delete transaction"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {transactions.length > 5 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                    {expanded ? (
                        <>
                            <ChevronUp className="w-4 h-4" />
                            Show less
                        </>
                    ) : (
                        <>
                            <ChevronDown className="w-4 h-4" />
                            Show all {transactions.length} transactions
                        </>
                    )}
                </button>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => {
                    setShowDeleteConfirm(false)
                    setTransactionToDelete(null)
                }}
                onConfirm={handleDeleteConfirm}
                title={transactionDeleteModalTitle}
                message={transactionToDelete ? `Are you sure you want to delete this ${transactionToDelete.transaction_type} transaction?` : ''}
                details={
                    transactionToDelete
                        ? [
                            `This will reverse the ${
                                  transactionToDelete.transaction_type === 'BUY' ? 'purchase' : 'sale'
                              } of ${
                                `${formatNumber(transactionToDelete.shares, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 4,
                                })} shares`
                              }`,
                            `Holding shares will be ${
                                transactionToDelete.transaction_type === 'BUY' ? 'reduced' : 'increased'
                            }`,
                            'Cost basis will be recalculated',
                        ]
                        : []
                }
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />
        </div>
    )
}

