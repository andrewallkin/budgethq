import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import ConfirmModal from '../ConfirmModal'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'

export default function DeleteSygniaAccountButton({
    accountId,
    accountName,
    compact = false,
    onDeleted,
}) {
    const { deleteAccount } = useInvestmentsV2()
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState(null)

    const handleOpen = (e) => {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        setDeleteError(null)
        setConfirmOpen(true)
    }

    const handleClose = () => {
        if (deleting) return
        setConfirmOpen(false)
        setDeleteError(null)
    }

    const handleConfirm = async () => {
        if (deleting) return
        setDeleteError(null)
        setDeleting(true)
        try {
            await deleteAccount(accountId)
            setConfirmOpen(false)
            onDeleted?.()
        } catch (err) {
            const message =
                err.response?.data?.detail || err.message || 'Failed to disconnect account'
            setDeleteError(typeof message === 'string' ? message : 'Failed to disconnect account')
        } finally {
            setDeleting(false)
        }
    }

    const buttonClass = compact
        ? 'relative z-10 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--paper-muted)] transition-colors duration-200 hover:bg-[var(--paper-brick)]/8 hover:text-[var(--paper-brick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50'
        : 'inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--paper-muted)] transition-colors duration-200 hover:bg-[var(--paper-brick)]/8 hover:text-[var(--paper-brick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50'

    const modalMessage = (
        <>
            Remove &ldquo;{accountName}&rdquo; from BudgetHQ? Synced holdings, history, and contributions
            for this account will be deleted. This does not close the account at Sygnia.
            {deleteError && (
                <span className="mt-3 block text-sm text-[var(--paper-brick)]">{deleteError}</span>
            )}
        </>
    )

    return (
        <>
            <button
                type="button"
                onClick={handleOpen}
                disabled={deleting}
                className={buttonClass}
                aria-label={`Disconnect ${accountName}`}
            >
                <Trash2 className="w-4 h-4 shrink-0" aria-hidden />
                {!compact && 'Disconnect'}
            </button>

            <ConfirmModal
                isOpen={confirmOpen}
                onClose={handleClose}
                onConfirm={handleConfirm}
                closeOnConfirm={false}
                title="Disconnect account"
                message={modalMessage}
                confirmText={deleting ? 'Disconnecting…' : 'Disconnect'}
                cancelText="Cancel"
                variant="danger"
            />
        </>
    )
}
