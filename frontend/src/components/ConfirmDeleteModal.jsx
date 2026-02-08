import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmDeleteModal({ isOpen, onClose, onConfirm, title, message, monthYear }) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            {title}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {monthYear && (
                        <p className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            {monthYear}
                        </p>
                    )}
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                        {message}
                    </p>
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <p className="text-sm font-medium text-red-900 dark:text-red-200 mb-2">
                            This will permanently delete:
                        </p>
                        <ul className="text-sm text-red-800 dark:text-red-300 space-y-1 list-disc list-inside">
                            <li>Gross salary and company details</li>
                            <li>All company contributions</li>
                            <li>All personal deductions</li>
                            <li>Additional income items</li>
                            <li>Uploaded PDF file from cloud storage</li>
                        </ul>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 font-semibold">
                        This action cannot be undone.
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <AlertTriangle className="w-4 h-4" />
                        Delete Payslip
                    </button>
                </div>
            </div>
        </div>
    )
}
