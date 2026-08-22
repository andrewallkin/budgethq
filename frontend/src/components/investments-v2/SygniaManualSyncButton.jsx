import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { syncSygniaAccount } from '../../investments-v2/api'

export default function SygniaManualSyncButton({ accountId, onSynced, compact = false }) {
    const [syncing, setSyncing] = useState(false)
    const [error, setError] = useState(null)

    const handleClick = async (e) => {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (syncing) return

        setError(null)
        setSyncing(true)
        try {
            const data = await syncSygniaAccount(accountId)
            onSynced?.(data)
        } catch (err) {
            const message = err.response?.data?.detail || err.message || 'Sync failed'
            setError(typeof message === 'string' ? message : 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }

    const buttonClass = compact
        ? 'relative z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed'
        : 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 font-medium disabled:opacity-50 disabled:cursor-not-allowed'

    return (
        <div className={compact ? 'inline-flex flex-col items-end gap-0.5' : 'space-y-1'}>
            <button
                type="button"
                onClick={handleClick}
                disabled={syncing}
                title={syncing ? 'This can take up to a minute.' : undefined}
                className={buttonClass}
            >
                {syncing ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                        Syncing…
                    </>
                ) : (
                    <>
                        <RefreshCw className="w-4 h-4 shrink-0" aria-hidden />
                        Sync now
                    </>
                )}
            </button>
            {syncing && !compact && (
                <p className="text-xs text-teal-700 dark:text-teal-300 max-w-xs text-right">
                    This can take up to a minute.
                </p>
            )}
            {error && (
                <p className="text-xs text-red-600 dark:text-red-400 max-w-xs text-right">{error}</p>
            )}
        </div>
    )
}
