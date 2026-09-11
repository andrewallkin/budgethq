import { useEffect, useState } from 'react'
import axios from 'axios'
import { Download, AlertTriangle } from 'lucide-react'
import {
    PaperDialog,
    paperBtnGhost,
    paperBtnPrimary,
    paperEyebrow,
    paperField,
} from './appUi'

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
            prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
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

            const response = await axios.get(`/api/investec/transactions/export/pdf?${params.toString()}`, {
                responseType: 'blob',
            })

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

    return (
        <PaperDialog
            open={isOpen}
            onClose={onClose}
            title="Export PDF"
            description="Download synced transactions for a date range"
            maxWidth="max-w-lg"
            disableClose={downloading}
            footer={
                <>
                    <button type="button" onClick={onClose} disabled={downloading} className={paperBtnGhost}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={downloading || activeAccounts.length === 0}
                        className={paperBtnPrimary}
                    >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        {downloading ? 'Generating…' : 'Download'}
                    </button>
                </>
            }
        >
            {error && (
                <div
                    role="alert"
                    className="mb-5 flex items-start gap-2 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-3 text-sm text-[var(--paper-brick)]"
                >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </div>
            )}

            <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className={`${paperEyebrow} mb-1.5 block`} htmlFor="export-from">
                            From date
                        </label>
                        <input
                            id="export-from"
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className={paperField}
                        />
                    </div>
                    <div>
                        <label className={`${paperEyebrow} mb-1.5 block`} htmlFor="export-to">
                            To date
                        </label>
                        <input
                            id="export-to"
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className={paperField}
                        />
                    </div>
                </div>

                <div>
                    <p className={`${paperEyebrow} mb-1.5`}>Accounts</p>
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[var(--paper-line)] p-2">
                        {activeAccounts.length === 0 ? (
                            <p className="px-2 py-2 text-sm text-[var(--paper-muted)]">No active accounts</p>
                        ) : (
                            activeAccounts.map((account) => (
                                <label
                                    key={account.id}
                                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedAccountIds.includes(account.id)}
                                        onChange={() => toggleAccount(account.id)}
                                        className="h-4 w-4 rounded border-[var(--paper-line)] text-[var(--paper-ink)] focus:ring-[var(--paper-accent)]/20"
                                    />
                                    <span>{accountLabel(account)}</span>
                                </label>
                            ))
                        )}
                    </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--paper-ink)]">
                    <input
                        type="checkbox"
                        checked={includeTransfers}
                        onChange={(e) => setIncludeTransfers(e.target.checked)}
                        className="h-4 w-4 rounded border-[var(--paper-line)] text-[var(--paper-ink)] focus:ring-[var(--paper-accent)]/20"
                    />
                    Include transfers
                </label>
            </div>
        </PaperDialog>
    )
}
