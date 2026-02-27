import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Search, Filter, AlertTriangle, Sparkles, Zap, RefreshCw, Trash2 } from 'lucide-react'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import BlurredValue from '../components/BlurredValue'
import TransactionDetailsModal from '../components/TransactionDetailsModal'

const INCOME_CATEGORIES = ['salary', 'side_income', 'investment_income', 'refund', 'other_income']
const EXPENSE_CATEGORIES = ['groceries_household', 'bills', 'subscriptions', 'transport', 'lifestyle_misc', 'savings', 'loan_repayment']

const CATEGORY_LABELS = {
    salary: 'Salary',
    side_income: 'Side Income',
    investment_income: 'Investment Income',
    refund: 'Refund',
    other_income: 'Other Income',
    groceries_household: 'Groceries & Household',
    bills: 'Bills',
    subscriptions: 'Subscriptions',
    transport: 'Transport',
    lifestyle_misc: 'Lifestyle & Misc',
    savings: 'Savings',
    loan_repayment: 'Loan Repayment',
    transfers: 'Transfers'
}
const TRANSACTION_TYPES = ['All', 'CREDIT', 'DEBIT']

export default function BankTransactions() {
    const [loading, setLoading] = useState(true)
    const [transactions, setTransactions] = useState([])
    const [accounts, setAccounts] = useState([])
    const [error, setError] = useState('')
    const [hasMore, setHasMore] = useState(false)
    const [categorizingId, setCategorizingId] = useState(null)
    const [showBulkCategorizeModal, setShowBulkCategorizeModal] = useState(false)
    const [bulkCategorizing, setBulkCategorizing] = useState(false)
    const [bulkResults, setBulkResults] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [transactionToDelete, setTransactionToDelete] = useState(null)
    const [deletingId, setDeletingId] = useState(null)
    const [showDetailsModal, setShowDetailsModal] = useState(false)
    const [selectedTransaction, setSelectedTransaction] = useState(null)

    // Filters
    const [filters, setFilters] = useState({
        from_date: '',
        to_date: '',
        account_id: '',
        category: '',
        transaction_type: 'All',
        search: '',
        limit: 50,
        offset: 0
    })

    const [showFilters, setShowFilters] = useState(false)
    const [accountsLoaded, setAccountsLoaded] = useState(false)
    const initialLoadDoneRef = useRef(false)

    useEffect(() => {
        fetchAccounts()
    }, [])

    useEffect(() => {
        if (!accountsLoaded || initialLoadDoneRef.current) return
        initialLoadDoneRef.current = true
        const primary = accounts.find(a => a.is_primary)
        const initialAccountId = primary ? String(primary.id) : ''
        setFilters(prev => ({ ...prev, account_id: initialAccountId }))
        fetchTransactionsWithOverrides({ account_id: initialAccountId })
    }, [accountsLoaded, accounts])

    const fetchAccounts = async () => {
        try {
            const response = await axios.get('/api/investec/accounts')
            setAccounts(response.data)
        } catch (err) {
            console.error('Failed to load accounts:', err)
        } finally {
            setAccountsLoaded(true)
        }
    }

    const buildParams = (overrides = {}) => {
        const merged = { ...filters, ...overrides }
        const params = new URLSearchParams()
        if (merged.from_date) params.append('from_date', merged.from_date)
        if (merged.to_date) params.append('to_date', merged.to_date)
        if (merged.account_id) params.append('account_id', merged.account_id)
        if (merged.transaction_type !== 'All') params.append('transaction_type', merged.transaction_type)
        if (merged.search) params.append('search', merged.search)
        if (merged.category) params.append('category', merged.category)
        params.append('limit', merged.limit)
        return params
    }

    const fetchTransactions = async (append = false, overrides = {}) => {
        try {
            const params = buildParams(overrides)
            params.set('offset', append ? String(transactions.length) : '0')

            const response = await axios.get(`/api/investec/transactions?${params.toString()}`)

            if (append) {
                setTransactions(prev => [...prev, ...response.data])
            } else {
                setTransactions(response.data)
            }

            setHasMore(response.data.length === (overrides.limit ?? filters.limit))
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load transactions')
        } finally {
            setLoading(false)
        }
    }

    const fetchTransactionsWithOverrides = (overrides = {}) => {
        setLoading(true)
        fetchTransactions(false, overrides)
    }

    const handleApplyFilters = () => {
        setLoading(true)
        fetchTransactions()
    }

    const handleLoadMore = () => {
        fetchTransactions(true)
    }

    const handleCategoryChange = async (transactionId, newCategory) => {
        setError('') // Clear any previous errors

        try {
            const response = await axios.patch(`/api/investec/transactions/${transactionId}`, {
                category: newCategory || null  // Send null instead of empty string
            })

            // Update local state with the response data to ensure consistency
            setTransactions(transactions.map(txn =>
                txn.id === transactionId ? {
                    ...txn,
                    category: response.data.category,
                    user_corrected: response.data.user_corrected
                } : txn
            ))
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update category')
            // Refresh transactions to revert any optimistic UI updates
            fetchTransactions()
        }
    }

    const handleCategorizeWithAI = async (transactionId) => {
        setCategorizingId(transactionId)
        setError('')

        try {
            const response = await axios.post(`/api/investec/transactions/${transactionId}/categorize-ai`)

            // Update local state with confirmed data from server (including all fields returned)
            setTransactions(transactions.map(txn =>
                txn.id === transactionId
                    ? {
                        ...txn,
                        category: response.data.category,
                        ai_category_confidence: response.data.confidence,
                        user_corrected: response.data.user_corrected
                    }
                    : txn
            ))

            // Verify the update worked by logging
            console.log(`Transaction ${transactionId} categorized as: ${response.data.category}`)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to categorize transaction')
            // Refresh transactions on error to ensure consistency
            fetchTransactions()
        } finally {
            setCategorizingId(null)
        }
    }

    const handleSyncTransactions = async () => {
        setSyncing(true)
        setError('')
        try {
            await axios.post('/api/investec/transactions/sync')
            await fetchTransactions()
        } catch (err) {
            setError(err.response?.data?.detail || 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }

    const handleDeleteTransaction = async () => {
        if (!transactionToDelete) return
        setDeletingId(transactionToDelete.id)
        setError('')

        try {
            await axios.delete(`/api/investec/transactions/${transactionToDelete.id}`)
            setTransactions(transactions.filter(txn => txn.id !== transactionToDelete.id))
            setTransactionToDelete(null)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete transaction')
        } finally {
            setDeletingId(null)
        }
    }

    const handleBulkCategorize = async () => {
        setBulkCategorizing(true)
        setError('')

        try {
            const response = await axios.post('/api/investec/transactions/categorize-all-ai')
            setShowBulkCategorizeModal(false)
            setBulkResults(response.data)

            // Refresh transactions to show updated categories
            await fetchTransactions()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to categorize transactions')
            setShowBulkCategorizeModal(false)
        } finally {
            setBulkCategorizing(false)
        }
    }

    if (loading && transactions.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600 dark:text-gray-400">Loading transactions...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                    Bank Transactions
                </h1>
                <div className="flex flex-col sm:flex-row gap-3">
                    <button
                        onClick={handleSyncTransactions}
                        disabled={syncing}
                        className="px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing...' : 'Sync Transactions'}
                    </button>
                    <button
                        onClick={() => setShowBulkCategorizeModal(true)}
                        className="px-4 py-2.5 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <Sparkles className="w-4 h-4" />
                        Categorize All with AI
                    </button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="px-4 py-2.5 min-h-[44px] bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <Filter className="w-4 h-4" />
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Filter Panel */}
            {showFilters && (
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Filters</h2>

                    <div className="space-y-6">
                        {/* Row 1: Date range */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    From Date
                                </label>
                                <input
                                    type="date"
                                    value={filters.from_date}
                                    onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    To Date
                                </label>
                                <input
                                    type="date"
                                    value={filters.to_date}
                                    onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>

                        {/* Row 2: Account, Type, Category, Search */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Account
                                </label>
                                <select
                                    value={filters.account_id}
                                    onChange={(e) => setFilters({ ...filters, account_id: e.target.value })}
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="">All Accounts</option>
                                {accounts.filter(a => a.is_active).map(acc => (
                                    <option key={acc.id} value={String(acc.id)}>
                                            {acc.reference_name || acc.account_name}
                                            {acc.is_primary ? ' (Primary)' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Type
                                </label>
                                <select
                                    value={filters.transaction_type}
                                    onChange={(e) => setFilters({ ...filters, transaction_type: e.target.value })}
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    {TRANSACTION_TYPES.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Category
                                </label>
                                <select
                                    value={filters.category}
                                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="">All Categories</option>
                                    <option value="uncategorized">Uncategorized</option>
                                    <optgroup label="Income">
                                        {INCOME_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Expenses">
                                        {EXPENSE_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Neutral">
                                        <option value="transfers">{CATEGORY_LABELS.transfers}</option>
                                    </optgroup>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Search Description
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={filters.search}
                                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                        placeholder="Search transactions..."
                                        className="w-full pl-10 pr-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button
                            onClick={handleApplyFilters}
                            className="px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Apply Filters
                        </button>
                        <button
                            onClick={() => {
                                const primary = accounts.find(a => a.is_primary)
                                const defaultAccountId = primary ? String(primary.id) : ''
                                setFilters({
                                    from_date: '',
                                    to_date: '',
                                    account_id: defaultAccountId,
                                    category: '',
                                    transaction_type: 'All',
                                    search: '',
                                    limit: 50,
                                    offset: 0
                                })
                                setLoading(true)
                                fetchTransactions(false, { account_id: defaultAccountId, from_date: '', to_date: '', category: '', transaction_type: 'All', search: '' })
                            }}
                            className="px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Clear Filters
                        </button>
                    </div>
                </div>
            )}

            {/* Transactions Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Date
                                </th>
                                <th className="w-4 px-1 py-3" />
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Description
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Amount
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Category
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    AI
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {transactions.map((txn) => {
                                return (
                                    <tr
                                        key={txn.id}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                                        onClick={(e) => {
                                            if (e.target.closest('button, select')) return
                                            setSelectedTransaction(txn)
                                            setShowDetailsModal(true)
                                        }}
                                    >
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            {formatDateSafe(txn.transaction_date, {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </td>
                                        <td className="w-4 px-1 py-3 text-center">
                                            {txn.status === 'PENDING' && (
                                                <span
                                                    className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500/70 dark:bg-amber-400/60"
                                                    title="Pending"
                                                />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                            <div className="max-w-xs truncate" title={txn.description}>
                                                {txn.description}
                                            </div>
                                        </td>
                                        <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-semibold ${
                                            txn.transaction_type === 'CREDIT'
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-red-600 dark:text-red-400'
                                        }`}>
                                            {txn.transaction_type === 'CREDIT' ? '+' : '-'}
                                            <BlurredValue>{formatCurrency(Math.abs(txn.amount))}</BlurredValue>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <select
                                                value={txn.category || ''}
                                                onChange={(e) => handleCategoryChange(txn.id, e.target.value)}
                                                className="text-sm border-0 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                                            >
                                                <option value="">Uncategorized</option>
                                                <optgroup label="Income">
                                                    {INCOME_CATEGORIES.map(cat => (
                                                        <option key={cat} value={cat} style={{ color: '#16a34a' }}>
                                                            {CATEGORY_LABELS[cat]}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="Expenses">
                                                    {EXPENSE_CATEGORIES.map(cat => (
                                                        <option key={cat} value={cat} style={{ color: '#dc2626' }}>
                                                            {CATEGORY_LABELS[cat]}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="Neutral">
                                                    <option value="transfers" style={{ color: '#6b7280' }}>Transfers</option>
                                                </optgroup>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center">
                                            {!txn.category && !txn.user_corrected && (
                                                <button
                                                    onClick={() => handleCategorizeWithAI(txn.id)}
                                                    disabled={categorizingId === txn.id}
                                                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm flex items-center gap-1.5"
                                                    title="Categorize with AI"
                                                >
                                                    <Zap className="w-3.5 h-3.5" />
                                                    {categorizingId === txn.id ? '...' : 'AI'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {transactions.length === 0 && (
                    <div className="text-center py-12 text-gray-600 dark:text-gray-400">
                        No transactions found
                    </div>
                )}

                {hasMore && (
                    <div className="p-4 text-center border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={handleLoadMore}
                            className="px-4 py-2.5 min-h-[44px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            Load More
                        </button>
                    </div>
                )}
            </div>

            {/* Transaction Details Modal */}
            <TransactionDetailsModal
                isOpen={showDetailsModal}
                onClose={() => { setShowDetailsModal(false); setSelectedTransaction(null) }}
                transaction={selectedTransaction}
                account={accounts.find(a => a.id === selectedTransaction?.account_id)}
                onDelete={(txn) => {
                    setShowDetailsModal(false)
                    setSelectedTransaction(null)
                    setTransactionToDelete(txn)
                }}
                deletingId={deletingId}
            />

            {/* Bulk Categorize Confirmation Modal */}
            {showBulkCategorizeModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-purple-600" />
                            Categorize All with AI?
                        </h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-6">
                            This will use AI to categorize all uncategorized transactions. This action uses your OpenAI API key and may incur costs based on the number of transactions.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleBulkCategorize}
                                disabled={bulkCategorizing}
                                className="flex-1 px-4 py-2.5 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {bulkCategorizing ? 'Categorizing...' : 'Categorize All'}
                            </button>
                            <button
                                onClick={() => setShowBulkCategorizeModal(false)}
                                disabled={bulkCategorizing}
                                className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {transactionToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <Trash2 className="w-5 h-5 text-red-500" />
                            Delete Transaction?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                            {transactionToDelete.description}
                        </p>
                        <p className={`text-lg font-semibold mb-6 ${transactionToDelete.transaction_type === 'CREDIT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {transactionToDelete.transaction_type === 'CREDIT' ? '+' : '-'}
                            <BlurredValue>{formatCurrency(Math.abs(transactionToDelete.amount))}</BlurredValue>
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleDeleteTransaction}
                                disabled={deletingId === transactionToDelete.id}
                                className="flex-1 px-4 py-2.5 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {deletingId === transactionToDelete.id ? 'Deleting...' : 'Delete'}
                            </button>
                            <button
                                onClick={() => setTransactionToDelete(null)}
                                disabled={deletingId === transactionToDelete.id}
                                className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Results Modal */}
            {bulkResults && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Categorization Complete
                        </h3>
                        <div className="space-y-2 mb-6">
                            <p className="text-gray-700 dark:text-gray-300">
                                <strong>Total transactions:</strong> {bulkResults.total}
                            </p>
                            <p className="text-green-600 dark:text-green-400">
                                <strong>Categorized:</strong> {bulkResults.categorized}
                            </p>
                            {bulkResults.failed > 0 && (
                                <p className="text-red-600 dark:text-red-400">
                                    <strong>Failed:</strong> {bulkResults.failed}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => setBulkResults(null)}
                            className="w-full px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
