import { useEffect, useState } from 'react'
import axios from 'axios'
import { X, Download, AlertTriangle, FileText } from 'lucide-react'

function accountLabel(account) {
    const name = account.reference_name || account.account_name
    return account.is_primary ? `${name} (Primary)` : name
}

export default function TransactionExportModal({
    isOpen,
    onClose,
    accounts,
    initialFromDate = '',
    initialToDate = '',
}) {
    const [fromDate, setFromDate] = useState(initialFromDate)
    const [toDate, setToDate] = useState(initialToDate)
    const [selectedAccountIds, setSelectedAccountIds] = useState([])
    const [includeTransfers, setIncludeTransfers] = useState(false)
    const [downloading, setDownloading] = useState(false)
    const [error, setError] = useState('')

    const activeAccounts = accounts.filter((account) => account.is_active)

    useEffect(() => {
        if (!isOpen) return
        setFromDate(initialFromDate)
        setToDate(initialToDate)
        setSelectedAccountIds(activeAccounts.map((account) => account.id))
        setIncludeTransfers(false)
        setError('')
    }, [isOpen, initialFromDate, initialToDate, accounts])

    const toggleAccount = (accountId) => {
        setSelectedAccountIds((prev) =>
            prev.includes(accountId)
                ? prev.filter((id) => id !== accountId)
                : [...prev, accountId]
        )
    }

    const handleDownload = async () => {
        setError('')

        if (!fromDate || !toDate) {
            setError('Please select a from and to date')
            return
        }

        if (fromDate > toDate) {
            setError('From date must be on or before to date')
            return
        }

        if (selectedAccountIds.length === 0) {
            setError('Please select at least one account')
            return
        }

        setDownloading(true)

        try {
            const params = new URLSearchParams()
            params.append('from_date', fromDate)
            params.append('to_date', toDate)
            params.append('include_transfers', String(includeTransfers))
            selectedAccountIds.forEach((id) => params.append('account_ids', String(id)))

            const response = await axios.get(
                `/api/investec/transactions/export/pdf?${params.toString()}`,
                { responseType: 'blob' }
            )

            const blob = new Blob([response.data], { type: 'application/pdf' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `transactions_${fromDate}_to_${toDate}.pdf`
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
            onClose()
        } catch (err) {
            if (err.response?.data instanceof Blob) {
                try {
                    const text = await err.response.data.text()
                    const parsed = JSON.parse(text)
                    setError(parsed.detail || 'Failed to download PDF')
                } catch {
                    setError('Failed to download PDF')
                }
            } else {
                setError(err.response?.data?.detail || 'Failed to download PDF')
            }
        } finally {
            setDownloading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={downloading ? undefined : onClose}
            />

            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 sm:mx-auto overflow-hidden">
                <button
                    onClick={onClose}
                    disabled={downloading}
                    className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Download Transaction PDF
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Export synced transactions from your database
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg flex items-center gap-2 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    From Date
                                </label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    To Date
                                </label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Accounts
                            </label>
                            <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                                {activeAccounts.length === 0 ? (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">No active accounts available</p>
                                ) : (
                                    activeAccounts.map((account) => (
                                        <label
                                            key={account.id}
                                            className="flex items-center gap-3 text-sm text-gray-900 dark:text-white cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedAccountIds.includes(account.id)}
                                                onChange={() => toggleAccount(account.id)}
                                                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span>{accountLabel(account)}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={includeTransfers}
                                onChange={(e) => setIncludeTransfers(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                Include transfers
                            </span>
                        </label>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
                        <button
                            onClick={onClose}
                            disabled={downloading}
                            className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={downloading || activeAccounts.length === 0}
                            className="flex-1 px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            {downloading ? 'Generating...' : 'Download PDF'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
