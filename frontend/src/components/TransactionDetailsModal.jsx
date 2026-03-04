import { X, Trash2 } from 'lucide-react'
import BlurredValue from './BlurredValue'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import CategoryBadge from './CategoryBadge'

export default function TransactionDetailsModal({ isOpen, onClose, transaction, account, onDelete, deletingId }) {
    if (!isOpen || !transaction) return null

    const isCredit = transaction.transaction_type === 'CREDIT'
    const confidence = transaction.ai_category_confidence

    const confidenceColor = confidence == null
        ? 'text-gray-400 dark:text-gray-500'
        : confidence >= 0.8
        ? 'text-green-600 dark:text-green-400'
        : confidence >= 0.5
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400'

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 sm:mx-auto max-h-[90vh] overflow-y-auto">
                {/* Header */}
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
                    </div>
                    <button
                        onClick={onClose}
                        className="flex-shrink-0 ml-3 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Amount</p>
                            <BlurredValue><p className={`text-2xl font-bold ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {isCredit ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
                            </p></BlurredValue>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Category</p>
                            {transaction.category
                                ? <CategoryBadge category={transaction.category} />
                                : <span className="text-sm text-gray-400 dark:text-gray-500">Uncategorized</span>
                            }
                        </div>
                    </div>

                    {/* Details */}
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

                    {/* Delete */}
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
    )
}
