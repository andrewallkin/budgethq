import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export const CARD_BAND = {
    payslip: '#111111',
    budget: '#F4A261',
    investments: '#C6E63A',
    accounts: '#F4D35E',
}

export const BUDGET_COLORS = {
    Needs: '#F4A261',
    Wants: '#F4D35E',
    Savings: '#C6E63A',
    Unallocated: '#E5E7EB',
}

export const OVERVIEW_COLORS = ['#C6E63A', '#F4A261', '#F4D35E', '#111111', '#A3A3A3']

export function CardBand({ color }) {
    return (
        <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1"
            style={{ background: color }}
        />
    )
}

export function AppCard({ band, className = '', children, as: Tag = 'section', ...props }) {
    return (
        <Tag className={`ui-lab-card relative overflow-hidden ${className}`.trim()} {...props}>
            {band ? <CardBand color={band} /> : null}
            {children}
        </Tag>
    )
}

export function pageTitle(kicker, title, extra) {
    return (
        <div className="flex items-end justify-between gap-4">
            <div>
                {kicker && (
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">{kicker}</p>
                )}
                {title && (
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">{title}</h1>
                )}
            </div>
            {extra}
        </div>
    )
}

export const moneyTone = (value) => {
    if (value > 0) return 'text-emerald-700 dark:text-emerald-400'
    if (value < 0) return 'text-red-600 dark:text-red-400'
    return 'text-neutral-950 dark:text-white'
}

export function LedgerRow({ label, hint, swatch, value, tone = 'text-neutral-950 dark:text-white', grow = false }) {
    return (
        <div className={`flex items-center justify-between gap-4 ${grow ? 'min-h-0 flex-1' : 'py-3'}`}>
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    {swatch && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: swatch }} />}
                    <p className="truncate text-sm text-neutral-600 dark:text-neutral-300">{label}</p>
                </div>
                {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
            </div>
            <p className={`shrink-0 text-right text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
        </div>
    )
}

export const eyebrowClass = 'text-xs font-medium uppercase tracking-[0.16em] text-neutral-400'
export const heroMoneyClass = 'text-right text-4xl font-semibold tracking-tight tabular-nums text-neutral-950 dark:text-white'
export const compactMoneyClass = 'text-right text-3xl font-semibold tracking-tight tabular-nums text-neutral-950 dark:text-white'
export const dividerClass = 'divide-y divide-neutral-100 dark:divide-neutral-800'

export const PAPER_BUDGET_COLORS = {
    Needs: '#8B5E34',
    Wants: '#C4A06A',
    Savings: '#5F6F4E',
    Unallocated: '#C8BBA6',
}

export const PAPER_CHART = {
    umber: '#8B5E34',
    khaki: '#C4A06A',
    olive: '#5F6F4E',
}

export const paperEyebrow = 'text-[13px] text-[var(--paper-muted)]'
export const paperTitle = 'text-[1.75rem] font-semibold tracking-tight text-[var(--paper-ink)] sm:text-[2rem]'
export const paperMoney = 'font-semibold tracking-tight tabular-nums'
export const paperDivider = 'divide-y divide-[var(--paper-line)]'
export const paperBackLink =
    'inline-flex cursor-pointer items-center gap-1 rounded-md py-1 pr-2 text-sm font-medium text-[var(--paper-muted)] transition-colors duration-200 hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)]'
export const paperIconBtn =
    'inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors duration-200 hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50'
export const paperIconBtnDanger =
    'inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-md text-[var(--paper-brick)] transition-colors duration-200 hover:bg-[var(--paper-brick)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50'
export const paperTableHead =
    'border-b border-[var(--paper-line)] text-left text-xs font-medium uppercase tracking-wider text-[var(--paper-muted)]'
export const paperTableRow =
    'border-b border-[var(--paper-line)] last:border-0 transition-colors duration-200 hover:bg-[var(--paper-canvas)]/70'
export const paperSegment =
    'inline-flex flex-wrap gap-1 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-1'
export const paperMoneyTone = (value) => {
    if (value > 0) return 'text-[var(--paper-olive)]'
    if (value < 0) return 'text-[var(--paper-brick)]'
    return 'text-[var(--paper-ink)]'
}

export const paperBtnBase =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20'
export const paperBtnPrimary = `${paperBtnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
export const paperBtnGhost = `${paperBtnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
export const paperBtnDanger = `${paperBtnBase} bg-[var(--paper-brick)] text-[var(--paper-card)] hover:opacity-90`
export const paperField =
    'w-full min-h-[40px] rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'

export function ModalPortal({ children }) {
    return createPortal(children, document.body)
}

export function PaperDialog({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    maxWidth = 'max-w-md',
    zClass = 'z-50',
    closeOnEscape = true,
    disableClose = false,
    labelledBy,
}) {
    const uid = useId()
    const titleId = labelledBy || `${uid}-title`

    useEffect(() => {
        if (!open || !closeOnEscape || disableClose) return undefined
        const onKey = (e) => {
            if (e.key === 'Escape') onClose?.()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, closeOnEscape, disableClose, onClose])

    if (!open) return null

    return createPortal(
        <div className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/40 p-4`}>
            <div
                className="absolute inset-0"
                onClick={disableClose ? undefined : onClose}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`relative mx-4 flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] sm:mx-auto`}
            >
                <div className="flex items-start justify-between gap-3 border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                        {title ? (
                            <h2 id={titleId} className="break-words text-lg font-semibold text-[var(--paper-ink)]">
                                {title}
                            </h2>
                        ) : (
                            <span id={titleId} className="sr-only">
                                Dialog
                            </span>
                        )}
                        {description ? (
                            <p className="mt-1 text-sm text-[var(--paper-muted)]">{description}</p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={disableClose}
                        aria-label="Close"
                        className={paperIconBtn}
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
                {children != null && children !== false ? (
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
                ) : null}
                {footer ? (
                    <div className="flex flex-col-reverse gap-3 border-t border-[var(--paper-line)] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>,
        document.body
    )
}

export function PaperCard({ className = '', children, as: Tag = 'section', ...props }) {
    return (
        <Tag className={`paper-card ${className}`.trim()} {...props}>
            {children}
        </Tag>
    )
}

export function AllocationRow({ label, hint, amount = 0, display, total = 0, color }) {
    const numeric = Math.abs(Number(amount) || 0)
    const base = Number(total) || 0
    const pct = base > 0 ? Math.min(100, (numeric / base) * 100) : 0

    return (
        <div className="space-y-2 py-3">
            <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--paper-ink)]">{label}</p>
                    {hint ? <p className="mt-0.5 text-xs text-[var(--paper-muted)]">{hint}</p> : null}
                </div>
                <p className="shrink-0 text-right text-sm font-medium tabular-nums text-[var(--paper-ink)]">{display}</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-line)]" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    )
}
