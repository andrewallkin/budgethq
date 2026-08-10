import { AlertCircle, CheckCircle2, Clock } from 'lucide-react'

const STATUS_CONFIG = {
    ok: {
        label: 'Synced',
        className: 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        Icon: CheckCircle2,
    },
    error: {
        label: 'Sync error',
        className: 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        Icon: AlertCircle,
    },
    pending: {
        label: 'Sync pending',
        className: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        Icon: Clock,
    },
}

export default function SygniaSyncStatusBadge({ status, error, compact = false }) {
    const key = (status || 'pending').toLowerCase()
    const config = STATUS_CONFIG[key] || STATUS_CONFIG.pending
    const { label, className, Icon } = config

    return (
        <div className={compact ? 'inline-flex flex-col items-end gap-0.5' : 'space-y-1'}>
            <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
            >
                <Icon className="w-3 h-3 shrink-0" aria-hidden />
                {label}
            </span>
            {!compact && key === 'error' && error && (
                <p className="text-xs text-red-600 dark:text-red-400 max-w-md">{error}</p>
            )}
        </div>
    )
}
