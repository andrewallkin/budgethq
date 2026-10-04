import { useState, useEffect } from 'react'
import axios from 'axios'
import { Search } from 'lucide-react'
import BlurredValue from './BlurredValue'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import { CATEGORY_LABELS } from '../utils/transactionCategories'
import { PaperDialog, paperEyebrow, paperField, paperMoney, paperMoneyTone } from './appUi'

export default function TransactionLinkPicker({ isOpen, onClose, sourceTransaction, onLinked }) {
    const [candidates, setCandidates] = useState([])
    const [loading, setLoading] = useState(false)
    const [linkingId, setLinkingId] = useState(null)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')

    const isDebit = sourceTransaction?.transaction_type === 'DEBIT'

    const openAmount = (txn) => {
        if (!txn) return 0
        if (txn.effective_amount != null) return Math.abs(Number(txn.effective_amount) || 0)
        return Math.abs(Number(txn.amount) || 0)
    }

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
            const filtered = response.data.filter((txn) => {
                if (txn.id === sourceTransaction.id) return false
                if (openAmount(txn) <= 0.009) return false
                if (isDebit) {
                    return ['refund', 'reimbursements'].includes(txn.category)
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
            const linkable = Math.min(openAmount(sourceTransaction), openAmount(targetTxn))
            const body = isDebit
                ? { credit_transaction_id: targetTxn.id, amount: linkable }
                : { debit_transaction_id: targetTxn.id, amount: linkable }
            await axios.post(`/api/investec/transactions/${sourceTransaction.id}/links`, body)
            onLinked?.()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create link')
        } finally {
            setLinkingId(null)
        }
    }

    const filteredCandidates = candidates.filter((txn) => {
        if (!search.trim()) return true
        return txn.description.toLowerCase().includes(search.trim().toLowerCase())
    })

    return (
        <PaperDialog
            open={isOpen && Boolean(sourceTransaction)}
            onClose={onClose}
            title={isDebit ? 'Link credit' : 'Link to expense'}
            description={
                isDebit
                    ? 'Choose a refund or reimbursement. Only the amount that fits this expense is linked.'
                    : 'Choose an expense. Only the amount that fits is linked. The rest stays unlinked.'
            }
            maxWidth="max-w-lg"
            zClass="z-[60]"
            disableClose={Boolean(linkingId)}
        >
            <div className="relative mb-4">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-muted)]"
                    aria-hidden="true"
                />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search descriptions…"
                    className={`${paperField} pl-9`}
                />
            </div>

            {error && (
                <p role="alert" className="mb-4 text-sm text-[var(--paper-brick)]">
                    {error}
                </p>
            )}

            <div className="max-h-[48vh] space-y-2 overflow-y-auto">
                {loading ? (
                    <p className="py-10 text-center text-sm text-[var(--paper-muted)]">Loading…</p>
                ) : filteredCandidates.length === 0 ? (
                    <p className="py-10 text-center text-sm text-[var(--paper-muted)]">
                        No matching transactions in the last 90 days.
                    </p>
                ) : (
                    filteredCandidates.map((txn) => {
                        const signed =
                            txn.transaction_type === 'CREDIT'
                                ? Math.abs(Number(txn.amount) || 0)
                                : -Math.abs(Number(txn.amount) || 0)
                        const linkable = Math.min(openAmount(sourceTransaction), openAmount(txn))
                        const creditTxn = txn.transaction_type === 'CREDIT' ? txn : sourceTransaction
                        const staysUnlinked = openAmount(creditTxn) - linkable
                        const postedCandidate = Math.abs(Number(txn.amount) || 0)
                        const postedCredit = Math.abs(Number(creditTxn.amount) || 0)
                        const showLinkCaption =
                            postedCandidate - linkable > 0.009 ||
                            postedCredit - linkable > 0.009 ||
                            staysUnlinked > 0.009
                        return (
                            <button
                                key={txn.id}
                                type="button"
                                onClick={() => handleLink(txn)}
                                disabled={linkingId === txn.id}
                                className="w-full cursor-pointer rounded-md border border-[var(--paper-line)] p-3 text-left transition-colors hover:bg-[var(--paper-canvas)] disabled:opacity-50"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="break-words text-sm text-[var(--paper-ink)]">
                                            {txn.description}
                                        </p>
                                        <p className={`${paperEyebrow} mt-1`}>
                                            {formatDateSafe(txn.transaction_date, {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                            {txn.category
                                                ? ` · ${CATEGORY_LABELS[txn.category] || txn.category}`
                                                : ''}
                                        </p>
                                        {showLinkCaption && (
                                            <p className="mt-1 text-xs text-[var(--paper-muted)]">
                                                Links{' '}
                                                <BlurredValue>{formatCurrency(linkable)}</BlurredValue>
                                                .
                                                {staysUnlinked > 0.009 && (
                                                    <>
                                                        {' '}
                                                        <BlurredValue>
                                                            {formatCurrency(staysUnlinked)}
                                                        </BlurredValue>
                                                        {' '}stays unlinked.
                                                    </>
                                                )}
                                            </p>
                                        )}
                                    </div>
                                    <p className={`shrink-0 text-sm ${paperMoney} ${paperMoneyTone(signed)}`}>
                                        {signed > 0 ? '+' : ''}
                                        <BlurredValue>{formatCurrency(Math.abs(txn.amount))}</BlurredValue>
                                    </p>
                                </div>
                            </button>
                        )
                    })
                )}
            </div>
        </PaperDialog>
    )
}
