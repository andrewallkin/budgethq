import { AlertTriangle, X } from 'lucide-react'
import { ModalPortal } from './appUi'

const btnBase =
    'inline-flex min-h-[40px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors duration-200 focus:ring-2 focus:ring-[var(--paper-accent)]/20 focus:ring-offset-2 focus:ring-offset-[var(--paper-card)]'
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const btnDanger = `${btnBase} bg-[var(--paper-brick)] text-[var(--paper-card)] hover:opacity-90`
const btnWarning = `${btnBase} bg-[var(--paper-accent)] text-[var(--paper-card)] hover:opacity-90`
const btnInfo = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirm Action',
    message = 'Are you sure?',
    details = [],
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger',
    closeOnConfirm = true,
}) {
    if (!isOpen) return null

    const titleId = 'confirm-modal-title'

    const variants = {
        danger: {
            icon: 'bg-[var(--paper-brick)]/10 text-[var(--paper-brick)]',
            button: btnDanger,
        },
        warning: {
            icon: 'bg-[var(--paper-accent)]/10 text-[var(--paper-accent)]',
            button: btnWarning,
        },
        info: {
            icon: 'bg-[var(--paper-line)] text-[var(--paper-ink)]',
            button: btnInfo,
        },
    }

    const style = variants[variant] || variants.danger

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative mx-4 w-full max-w-md overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] sm:mx-auto"
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute right-4 top-4 inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)] focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                >
                    <X className="h-5 w-5" aria-hidden="true" />
                </button>

                <div className="p-6">
                    <div
                        className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${style.icon}`}
                    >
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </div>

                    <h3
                        id={titleId}
                        className="mb-2 text-center text-lg font-semibold text-[var(--paper-ink)]"
                    >
                        {title}
                    </h3>

                    <div className="mb-4 text-center text-[var(--paper-muted)]">{message}</div>

                    {details.length > 0 && (
                        <div className="mb-6 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4">
                            <p className="mb-2 text-sm font-medium text-[var(--paper-ink)]">This will:</p>
                            <ul className="space-y-1">
                                {details.map((detail, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-2 text-sm text-[var(--paper-muted)]"
                                    >
                                        <span className="text-[var(--paper-line)]">•</span>
                                        {detail}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex flex-col-reverse gap-3 sm:flex-row">
                        <button type="button" onClick={onClose} className={btnGhost}>
                            {cancelText}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                onConfirm()
                                if (closeOnConfirm) onClose()
                            }}
                            className={style.button}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </ModalPortal>
    )
}
