import { useState } from 'react'
import axios from 'axios'
import { X, Trash2, Link2, Unlink } from 'lucide-react'
import BlurredValue from './BlurredValue'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import CategoryBadge from './CategoryBadge'
import TransactionLinkPicker from './TransactionLinkPicker'
import { OFFSET_CATEGORIES } from '../utils/transactionCategories'

export default function TransactionDetailsModal({
    isOpen,
    onClose,
    transaction,
    account,
    onDelete,
    deletingId,
    onTransactionUpdated,
}) {
    const [showLinkPicker, setShowLinkPicker] = useState(false)
    const [unlinkingId, setUnlinkingId] = useState(null)
    const [linkError, setLinkError] = useState('')

    if (!isOpen || !transaction) return null

    const isCredit = transaction.transaction_type === 'CREDIT'
    const isDebit = transaction.transaction_type === 'DEBIT'
    const confidence = transaction.ai_category_confidence
    const canLink = (isDebit) || (isCredit && OFFSET_CATEGORIES.includes(transaction.category) && !transaction.linked_debit)

    const confidenceColor = confidence == null
        ? 'text-gray-400 dark:text-gray-500'
        : confidence >= 0.8
        ? 'text-green-600 dark:text-green-400'
        : confidence >= 0.5
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400'

    const handleUnlink = async (linkId) => {
        setUnlinkingId(linkId)
        setLinkError('')
        try {
            await axios.delete(`/api/investec/transaction-links/${linkId}`)
            await onTransactionUpdated?.()
        } catch (err) {
            setLinkError(err.response?.data?.detail || 'Failed to remove link')
        } finally {
            setUnlinkingId(null)
        }
    }

    const handleLinked = async () => {
        setShowLinkPicker(false)
        await onTransactionUpdated?.()
    }

    const displayAmount = isDebit && transaction.effective_amount != null
        ? transaction.effective_amount
        : Math.abs(transaction.amount)

    return (
        <>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 sm:mx-auto max-h-[90vh] overflow-y-auto">
                    <div className="flex items-start justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white whitespace-normal break-words">
                                {transaction.description}
                            </h2>
                            <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${
                                isCredit
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}>
                                {transaction.transaction_type}
                            </span>
                            {transaction.has_links && (
                                <Link2 className="w-4 h-4 text-blue-500 flex-shrink-0" title="Has linked transactions" />
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="flex-shrink-0 ml-3 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                    {isDebit && transaction.linked_credits?.length ? 'Effective Amount' : 'Amount'}
                                </p>
                                <BlurredValue>
                                    <p className={`text-2xl font-bold ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {isCredit ? '+' : '-'}{formatCurrency(displayAmount)}
                                    </p>
                                </BlurredValue>
                                {isDebit && transaction.linked_credits?.length > 0 && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Raw: <BlurredValue>{formatCurrency(Math.abs(transaction.amount))}</BlurredValue>
                                    </p>
                                )}
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Category</p>
                                {transaction.category
                                    ? <CategoryBadge category={transaction.category} />
                                    : <span className="text-sm text-gray-400 dark:text-gray-500">Uncategorized</span>
                                }
                            </div>
                        </div>

                        {(transaction.linked_credits?.length > 0 || transaction.linked_debit) && (
                            <div>
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
                                    Linked Transactions
                                </h3>
                                {linkError && (
                                    <p className="text-sm text-red-600 dark:text-red-400 mb-3">{linkError}</p>
                                )}
                                <div className="space-y-2">
                                    {transaction.linked_credits?.map(link => (
                                        <div
                                            key={link.link_id}
                                            className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {link.description}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Credit offset: <BlurredValue>{formatCurrency(link.link_amount)}</BlurredValue>
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleUnlink(link.link_id)}
                                                disabled={unlinkingId === link.link_id}
                                                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                                                title="Remove link"
                                            >
                                                <Unlink className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {transaction.linked_debit && (
                                        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {transaction.linked_debit.description}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Linked expense: <BlurredValue>{formatCurrency(transaction.linked_debit.link_amount)}</BlurredValue>
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleUnlink(transaction.linked_debit.link_id)}
                                                disabled={unlinkingId === transaction.linked_debit.link_id}
                                                className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                                                title="Remove link"
                                            >
                                                <Unlink className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {canLink && (
                            <button
                                onClick={() => setShowLinkPicker(true)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            >
                                <Link2 className="w-4 h-4" />
                                {isDebit ? 'Link credit' : 'Link to expense'}
                            </button>
                        )}

                        <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
                                Transaction Details
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Date</span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {formatDateSafe(transaction.transaction_date, {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric'
                                        })}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Account</span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {account?.reference_name || account?.account_name || '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Type</span>
                                    <span className={`text-sm font-medium ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {transaction.transaction_type}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
                                    <span className={`text-sm font-medium ${
                                        transaction.status === 'POSTED'
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-amber-600 dark:text-amber-400'
                                    }`}>
                                        {transaction.status}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">AI Confidence</span>
                                    <span className={`text-sm font-medium ${confidenceColor}`}>
                                        {confidence != null ? `${Math.round(confidence * 100)}%` : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">User Corrected</span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {transaction.user_corrected ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => onDelete(transaction)}
                            disabled={deletingId === transaction.id}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            {deletingId === transaction.id ? 'Deleting...' : 'Delete Transaction'}
                        </button>
                    </div>
                </div>
            </div>

            <TransactionLinkPicker
                isOpen={showLinkPicker}
                onClose={() => setShowLinkPicker(false)}
                sourceTransaction={transaction}
                onLinked={handleLinked}
            />
        </>
    )
}
