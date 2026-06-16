import { useState, useEffect } from 'react'
import axios from 'axios'
import { Search, X } from 'lucide-react'
import BlurredValue from './BlurredValue'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import CategoryBadge from './CategoryBadge'

export default function TransactionLinkPicker({
    isOpen,
    onClose,
    sourceTransaction,
    onLinked,
}) {
    const [candidates, setCandidates] = useState([])
    const [loading, setLoading] = useState(false)
    const [linkingId, setLinkingId] = useState(null)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')

    const isDebit = sourceTransaction?.transaction_type === 'DEBIT'

    useEffect(() => {
        if (!isOpen || !sourceTransaction) return
        setSearch('')
        setError('')
        fetchCandidates()
    }, [isOpen, sourceTransaction?.id])

    const fetchCandidates = async () => {
        setLoading(true)
        setError('')
        try {
            const txnDate = new Date(sourceTransaction.transaction_date)
            const from = new Date(txnDate)
            from.setDate(from.getDate() - 90)
            const to = new Date(txnDate)
            to.setDate(to.getDate() + 90)

            const params = new URLSearchParams({
                from_date: from.toISOString().slice(0, 10),
                to_date: to.toISOString().slice(0, 10),
                limit: '200',
            })
            params.append('transaction_type', isDebit ? 'CREDIT' : 'DEBIT')

            const response = await axios.get(`/api/investec/transactions?${params.toString()}`)
            const filtered = response.data.filter(txn => {
                if (txn.id === sourceTransaction.id) return false
                if (isDebit) {
                    return ['refund', 'reimbursements'].includes(txn.category) && !txn.linked_debit
                }
                return txn.transaction_type === 'DEBIT'
            })
            setCandidates(filtered)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load transactions')
        } finally {
            setLoading(false)
        }
    }

    const handleLink = async (targetTxn) => {
        setLinkingId(targetTxn.id)
        setError('')
        try {
            const body = isDebit
                ? { credit_transaction_id: targetTxn.id }
                : { debit_transaction_id: targetTxn.id }
            await axios.post(`/api/investec/transactions/${sourceTransaction.id}/links`, body)
            onLinked?.()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create link')
        } finally {
            setLinkingId(null)
        }
    }

    const filteredCandidates = candidates.filter(txn => {
        if (!search.trim()) return true
        return txn.description.toLowerCase().includes(search.trim().toLowerCase())
    })

    if (!isOpen || !sourceTransaction) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {isDebit ? 'Link credit' : 'Link to expense'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search description..."
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        {isDebit
                            ? 'Select an unlinked refund or reimbursement credit to offset this expense.'
                            : 'Select the original debit expense this credit offsets.'}
                    </p>
                </div>

                {error && (
                    <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {loading ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Loading...</p>
                    ) : filteredCandidates.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                            No matching transactions found in the last 90 days.
                        </p>
                    ) : (
                        filteredCandidates.map(txn => (
                            <button
                                key={txn.id}
                                onClick={() => handleLink(txn)}
                                disabled={linkingId === txn.id}
                                className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white break-words">
                                            {txn.description}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {formatDateSafe(txn.transaction_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>
                                        {txn.category && (
                                            <div className="mt-1">
                                                <CategoryBadge category={txn.category} />
                                            </div>
                                        )}
                                    </div>
                                    <p className={`text-sm font-semibold whitespace-nowrap ${
                                        txn.transaction_type === 'CREDIT'
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400'
                                    }`}>
                                        {txn.transaction_type === 'CREDIT' ? '+' : '-'}
                                        <BlurredValue>{formatCurrency(Math.abs(txn.amount))}</BlurredValue>
                                    </p>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
