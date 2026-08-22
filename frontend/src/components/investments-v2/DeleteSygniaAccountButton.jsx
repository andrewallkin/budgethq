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
        ? 'relative z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed'
        : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 font-medium disabled:opacity-50 disabled:cursor-not-allowed'

    const modalMessage = (
        <>
            Remove &ldquo;{accountName}&rdquo; from BudgetHQ? Synced holdings, history, and contributions
            for this account will be deleted. This does not close the account at Sygnia.
            {deleteError && (
                <span className="block mt-3 text-sm text-red-600 dark:text-red-400">{deleteError}</span>
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
