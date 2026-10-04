import { useState } from 'react'
import axios from 'axios'
import { Trash2, Link2, Unlink } from 'lucide-react'
import BlurredValue from './BlurredValue'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import TransactionLinkPicker from './TransactionLinkPicker'
import { CATEGORY_LABELS, OFFSET_CATEGORIES } from '../utils/transactionCategories'
import {
    PaperDialog,
    paperBtnDanger,
    paperBtnGhost,
    paperDivider,
    paperEyebrow,
    paperMoney,
    paperMoneyTone,
} from './appUi'

function DetailRow({ label, children }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3">
            <span className="text-sm text-[var(--paper-muted)]">{label}</span>
            <span className="max-w-[60%] text-right text-sm text-[var(--paper-ink)]">{children}</span>
        </div>
    )
}

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

    if (!transaction) return null

    const isCredit = transaction.transaction_type === 'CREDIT'
    const isDebit = transaction.transaction_type === 'DEBIT'
    const confidence = transaction.ai_category_confidence
    const openAmount =
        transaction.effective_amount != null
            ? Math.abs(transaction.effective_amount)
            : Math.abs(transaction.amount)
    const canLink =
        (isDebit && openAmount > 0.009) ||
        (isCredit && OFFSET_CATEGORIES.includes(transaction.category) && openAmount > 0.009)

    const confidenceTone =
        confidence == null
            ? 'text-[var(--paper-muted)]'
            : confidence >= 0.8
              ? 'text-[var(--paper-olive)]'
              : confidence >= 0.5
                ? 'text-[var(--paper-accent)]'
                : 'text-[var(--paper-brick)]'

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

    const displayAmount =
        isDebit && transaction.effective_amount != null
            ? transaction.effective_amount
            : Math.abs(transaction.amount)

    const signedAmount = isCredit ? Math.abs(Number(displayAmount) || 0) : -Math.abs(Number(displayAmount) || 0)
    const categoryLabel = transaction.category
        ? CATEGORY_LABELS[transaction.category] || transaction.category
        : 'Uncategorized'

    return (
        <>
            <PaperDialog
                open={isOpen}
                onClose={onClose}
                title={transaction.description}
                description={account?.reference_name || account?.account_name || undefined}
                maxWidth="max-w-lg"
                closeOnEscape={!showLinkPicker}
                disableClose={showLinkPicker}
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => onDelete(transaction)}
                            disabled={deletingId === transaction.id}
                            className={paperBtnDanger}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            {deletingId === transaction.id ? 'Deleting…' : 'Delete'}
                        </button>
                        <button type="button" onClick={onClose} className={`${paperBtnGhost} sm:ml-auto`}>
                            Close
                        </button>
                    </>
                }
            >
                <div className="space-y-6">
                    <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4">
                        <p className={paperEyebrow}>
                            {isDebit && transaction.linked_credits?.length ? 'Effective amount' : 'Amount'}
                        </p>
                        <BlurredValue>
                            <p className={`mt-1 text-2xl ${paperMoney} ${paperMoneyTone(signedAmount)}`}>
                                {isCredit ? '+' : '-'}
                                {formatCurrency(displayAmount)}
                            </p>
                        </BlurredValue>
                        {isDebit && transaction.linked_credits?.length > 0 && (
                            <p className="mt-1 text-xs text-[var(--paper-muted)]">
                                Posted:{' '}
                                <BlurredValue>{formatCurrency(Math.abs(transaction.amount))}</BlurredValue>
                            </p>
                        )}
                        {isCredit && transaction.linked_debits?.length > 0 && openAmount > 0.009 && (
                            <p className="mt-1 text-xs text-[var(--paper-muted)]">
                                {transaction.category === 'reimbursements' ? 'Still unlinked' : 'Unlinked refund'}
                                : <BlurredValue>{formatCurrency(openAmount)}</BlurredValue>
                            </p>
                        )}
                    </div>

                    {(transaction.linked_credits?.length > 0 || transaction.linked_debits?.length > 0) && (
                        <div>
                            <h3 className={`${paperEyebrow} mb-2`}>Linked transactions</h3>
                            {linkError && (
                                <p className="mb-3 text-sm text-[var(--paper-brick)]">{linkError}</p>
                            )}
                            <div className="space-y-2">
                                {transaction.linked_credits?.map((link) => (
                                    <div
                                        key={link.link_id}
                                        className="flex items-center justify-between gap-3 rounded-md border border-[var(--paper-line)] px-3 py-2.5"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm text-[var(--paper-ink)]">
                                                {link.description}
                                            </p>
                                            <p className="text-xs text-[var(--paper-muted)]">
                                                Credit offset:{' '}
                                                <BlurredValue>{formatCurrency(link.link_amount)}</BlurredValue>
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleUnlink(link.link_id)}
                                            disabled={unlinkingId === link.link_id}
                                            className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-brick)] disabled:opacity-50"
                                            title="Remove link"
                                            aria-label="Remove link"
                                        >
                                            <Unlink className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </div>
                                ))}
                                {transaction.linked_debits?.map((link) => (
                                    <div
                                        key={link.link_id}
                                        className="flex items-center justify-between gap-3 rounded-md border border-[var(--paper-line)] px-3 py-2.5"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm text-[var(--paper-ink)]">
                                                {link.description}
                                            </p>
                                            <p className="text-xs text-[var(--paper-muted)]">
                                                Linked expense:{' '}
                                                <BlurredValue>{formatCurrency(link.link_amount)}</BlurredValue>
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleUnlink(link.link_id)}
                                            disabled={unlinkingId === link.link_id}
                                            className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-brick)] disabled:opacity-50"
                                            title="Remove link"
                                            aria-label="Remove link"
                                        >
                                            <Unlink className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {canLink && (
                        <button
                            type="button"
                            onClick={() => setShowLinkPicker(true)}
                            className={`${paperBtnGhost} w-full`}
                        >
                            <Link2 className="h-4 w-4" aria-hidden="true" />
                            {isDebit ? 'Link credit' : 'Link to expense'}
                        </button>
                    )}

                    <div className={paperDivider}>
                        <DetailRow label="Category">{categoryLabel}</DetailRow>
                        <DetailRow label="Date">
                            {formatDateSafe(transaction.transaction_date, {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                            })}
                        </DetailRow>
                        <DetailRow label="Type">{isCredit ? 'Credit' : 'Debit'}</DetailRow>
                        <DetailRow label="Status">
                            <span
                                className={
                                    transaction.status === 'PENDING'
                                        ? 'text-[var(--paper-accent)]'
                                        : 'text-[var(--paper-ink)]'
                                }
                            >
                                {transaction.status === 'PENDING' ? 'Pending' : 'Posted'}
                            </span>
                        </DetailRow>
                        <DetailRow label="AI confidence">
                            <span className={confidenceTone}>
                                {confidence != null ? `${Math.round(confidence * 100)}%` : '—'}
                            </span>
                        </DetailRow>
                        <DetailRow label="Manually set">{transaction.user_corrected ? 'Yes' : 'No'}</DetailRow>
                    </div>
                </div>
            </PaperDialog>

            <TransactionLinkPicker
                isOpen={showLinkPicker}
                onClose={() => setShowLinkPicker(false)}
                sourceTransaction={transaction}
                onLinked={handleLinked}
            />
        </>
    )
}
