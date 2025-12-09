import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, History } from 'lucide-react'
import axios from 'axios'

export default function TransactionHistory({ refreshTrigger }) {
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState(false)

    useEffect(() => {
        fetchTransactions()
    }, [refreshTrigger])

    const fetchTransactions = async () => {
        try {
            // Fetch both ETF and bond transactions in parallel
            const [etfRes, bondRes] = await Promise.all([
                axios.get('/api/etf/transactions'),
                axios.get('/api/bond/transactions')
            ])
            
            // Add type indicator to each transaction
            const etfTransactions = (etfRes.data || []).map(tx => ({
                ...tx,
                type: 'ETF',
                // For ETFs, use etf_name field
                name: tx.etf_name
            }))
            
            const bondTransactions = (bondRes.data || []).map(tx => ({
                ...tx,
                type: 'BOND',
                // For bonds, use bond_name field
                name: tx.bond_name,
                // Bonds don't have jse_ticker or shares/price_per_share
                jse_ticker: null,
                shares: null,
                price_per_share: null,
                total_value: tx.amount  // Bonds use 'amount' instead of 'total_value'
            }))
            
            // Combine and sort by date (newest first)
            const allTransactions = [...etfTransactions, ...bondTransactions].sort(
                (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date)
            )
            
            setTransactions(allTransactions)
        } catch (err) {
            console.error('Failed to fetch transactions:', err)
        } finally {
            setLoading(false)
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
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-500" />
                    Transaction History
                </h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-3 px-2">Date</th>
                            <th className="text-left py-3 px-2">Type</th>
                            <th className="text-left py-3 px-2">Asset</th>
                            <th className="text-right py-3 px-2">Shares</th>
                            <th className="text-right py-3 px-2">Price</th>
                            <th className="text-right py-3 px-2">Amount</th>
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
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        tx.transaction_type === 'BUY'
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
                                        {tx.type === 'BOND' && (
                                            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                                                BOND
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-3 px-2 text-right font-medium text-gray-900 dark:text-white">
                                    {tx.type === 'BOND' ? '—' : tx.shares.toFixed(4)}
                                </td>
                                <td className="py-3 px-2 text-right text-gray-600 dark:text-gray-400">
                                    {tx.type === 'BOND' ? '—' : `R ${tx.price_per_share.toFixed(2)}`}
                                </td>
                                <td className={`py-3 px-2 text-right font-semibold ${
                                    tx.transaction_type === 'BUY'
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                }`}>
                                    {tx.transaction_type === 'BUY' ? '-' : '+'}R {tx.total_value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {transactions.length > 5 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
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
        </div>
    )
}

