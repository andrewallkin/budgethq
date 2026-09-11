import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Trash2, AlertCircle } from 'lucide-react'
import axios from 'axios'
import ConfirmModal from './ConfirmModal'
import { formatCurrency, formatNumber, formatDateSafe } from '../utils/numberFormatting'
import BlurredValue from './BlurredValue'
import {
    PaperCard,
    paperDivider,
    paperEyebrow,
    paperIconBtnDanger,
    paperMoneyTone,
    paperTableHead,
    paperTableRow,
} from './appUi'

const btnGhost =
    'inline-flex min-h-[36px] w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-1.5 text-sm font-medium text-[var(--paper-muted)] transition-colors duration-200 hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20'

export default function TransactionHistory({
    refreshTrigger,
    onTransactionDeleted,
    portfolioId = null,
    currencyFormatOpts = { currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 },
    transactionDeleteModalTitle = 'Delete ETF Transaction',
}) {
    const [transactions, setTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [transactionToDelete, setTransactionToDelete] = useState(null)
    const [deleteError, setDeleteError] = useState('')

    useEffect(() => {
        fetchTransactions()
    }, [refreshTrigger])

    const fetchTransactions = async () => {
        try {
            const etfRes = await axios.get(
                '/api/etf/transactions',
                portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            )
            const etfTransactions = (etfRes.data || []).map((tx) => ({
                ...tx,
                type: 'Holding',
                name: tx.etf_name,
            }))
            const allTransactions = etfTransactions.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at) : new Date(a.transaction_date)
                const dateB = b.created_at ? new Date(b.created_at) : new Date(b.transaction_date)
                return dateB - dateA
            })

            setTransactions(allTransactions)
        } catch (err) {
            console.error('Failed to fetch transactions:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteClick = (transaction) => {
        setDeleteError('')
        setTransactionToDelete(transaction)
        setShowDeleteConfirm(true)
    }

    const handleDeleteConfirm = async () => {
        if (!transactionToDelete) return

        try {
            const endpoint = `/api/etf/transactions/${transactionToDelete.id}`
            await axios.delete(endpoint, portfolioId ? { params: { portfolio_id: portfolioId } } : undefined)

            await fetchTransactions()

            if (onTransactionDeleted) {
                onTransactionDeleted()
            }
            setDeleteError('')
        } catch (err) {
            console.error('Failed to delete transaction', err)
            setDeleteError(err.response?.data?.detail || 'Failed to delete transaction')
        } finally {
            setTransactionToDelete(null)
        }
    }

    if (loading) {
        return (
            <PaperCard className="p-5">
                <div className="animate-pulse">
                    <div className="mb-3 h-4 w-1/4 rounded bg-[var(--paper-line)]" />
                    <div className="space-y-2">
                        <div className="h-9 rounded bg-[var(--paper-line)]" />
                        <div className="h-9 rounded bg-[var(--paper-line)]" />
                    </div>
                </div>
            </PaperCard>
        )
    }

    if (transactions.length === 0) {
        return null
    }

    const displayedTransactions = expanded ? transactions : transactions.slice(0, 5)

    return (
        <PaperCard className="p-5 sm:p-6">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className={paperEyebrow}>Transactions</p>
                <span className="text-xs text-[var(--paper-muted)]">
                    {transactions.length} total
                </span>
            </div>

            {deleteError && (
                <div
                    role="alert"
                    className="mb-3 flex items-center gap-2 rounded-md border border-[var(--paper-brick)]/30 bg-[var(--paper-brick)]/10 px-3 py-2 text-sm text-[var(--paper-brick)]"
                >
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{deleteError}</span>
                </div>
            )}

            <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[540px] text-sm">
                    <thead>
                        <tr>
                            <th className={`${paperTableHead} px-2 py-2`}>Date</th>
                            <th className={`${paperTableHead} px-2 py-2`}>Type</th>
                            <th className={`${paperTableHead} px-2 py-2`}>Asset</th>
                            <th className={`${paperTableHead} px-2 py-2 text-right`}>Shares</th>
                            <th className={`${paperTableHead} px-2 py-2 text-right`}>Price</th>
                            <th className={`${paperTableHead} px-2 py-2 text-right`}>Amount</th>
                            <th className={`${paperTableHead} relative px-2 py-2 text-center`} aria-label="Actions">
                                <span className="sr-only">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className={paperDivider}>
                        {displayedTransactions.map((tx) => {
                            const isBuy = tx.transaction_type === 'BUY'
                            const typeTone = isBuy ? 'text-[var(--paper-olive)]' : 'text-[var(--paper-brick)]'

                            return (
                                <tr key={`${tx.type}-${tx.id}`} className={paperTableRow}>
                                    <td className="whitespace-nowrap px-2 py-2 text-[var(--paper-muted)]">
                                        {formatDateSafe(tx.transaction_date, {
                                            day: 'numeric',
                                            month: 'short',
                                            year: '2-digit',
                                        })}
                                    </td>
                                    <td className="px-2 py-2">
                                        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${typeTone}`}>
                                            {isBuy ? (
                                                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                                            ) : (
                                                <TrendingDown className="h-3 w-3" aria-hidden="true" />
                                            )}
                                            {tx.transaction_type}
                                        </span>
                                    </td>
                                    <td className="max-w-[140px] px-2 py-2">
                                        <div className="truncate font-medium text-[var(--paper-ink)]">{tx.name}</div>
                                        {tx.jse_ticker && (
                                            <div className="truncate font-mono text-xs text-[var(--paper-muted)]">
                                                {tx.jse_ticker}
                                            </div>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-[var(--paper-ink)]">
                                        <BlurredValue>
                                            {formatNumber(tx.shares, {
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 4,
                                            })}
                                        </BlurredValue>
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-[var(--paper-muted)]">
                                        <BlurredValue>{formatCurrency(tx.price_per_share, currencyFormatOpts)}</BlurredValue>
                                    </td>
                                    <td
                                        className={`whitespace-nowrap px-2 py-2 text-right tabular-nums font-medium ${paperMoneyTone(isBuy ? -1 : 1)}`}
                                    >
                                        {isBuy ? '−' : '+'}
                                        <BlurredValue>{formatCurrency(tx.total_value, currencyFormatOpts)}</BlurredValue>
                                    </td>
                                    <td className="px-1 py-1 text-center">
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteClick(tx)}
                                            className={paperIconBtnDanger}
                                            title="Delete transaction"
                                            aria-label="Delete transaction"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {transactions.length > 5 && (
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                    className={`mt-3 ${btnGhost}`}
                >
                    {expanded ? (
                        <>
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                            Show less
                        </>
                    ) : (
                        <>
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                            Show all {transactions.length}
                        </>
                    )}
                </button>
            )}

            <ConfirmModal
                isOpen={showDeleteConfirm}
                onClose={() => {
                    setShowDeleteConfirm(false)
                    setTransactionToDelete(null)
                    setDeleteError('')
                }}
                onConfirm={handleDeleteConfirm}
                title={transactionDeleteModalTitle}
                message={
                    transactionToDelete
                        ? `Are you sure you want to delete this ${transactionToDelete.transaction_type} transaction?`
                        : ''
                }
                details={
                    transactionToDelete
                        ? [
                              `This will reverse the ${
                                  transactionToDelete.transaction_type === 'BUY' ? 'purchase' : 'sale'
                              } of ${formatNumber(transactionToDelete.shares, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 4,
                              })} shares`,
                              `Holding shares will be ${
                                  transactionToDelete.transaction_type === 'BUY' ? 'reduced' : 'increased'
                              }`,
                              'Cost basis will be recalculated',
                          ]
                        : []
                }
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />
        </PaperCard>
    )
}
