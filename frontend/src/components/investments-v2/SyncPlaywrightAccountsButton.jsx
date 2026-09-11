import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'
import { paperBackLink, paperBtnGhost, paperBtnPrimary } from '../appUi'

function accountLabel(getAccount, accountId) {
    const account = getAccount(accountId)
    return account?.accountCode || account?.name || `Account ${accountId}`
}

export default function SyncPlaywrightAccountsButton({
    accountIds,
    onSynced,
    className = '',
    variant = 'ghost',
}) {
    const { syncPlaywrightAccounts, getAccount } = useInvestmentsV2()
    const [syncing, setSyncing] = useState(false)
    const [feedback, setFeedback] = useState(null)

    const ids = (accountIds || []).filter((id) => id != null)
    const isMulti = ids.length > 1
    const idleLabel = isMulti ? 'Sync Sygnia' : 'Sync now'

    useEffect(() => {
        if (!feedback || feedback.tone !== 'ok') return undefined
        const timer = window.setTimeout(() => setFeedback(null), 5000)
        return () => window.clearTimeout(timer)
    }, [feedback])

    const handleClick = async () => {
        if (syncing || ids.length === 0) return
        setFeedback(null)
        setSyncing(true)
        try {
            const results = await syncPlaywrightAccounts(ids)
            const failed = results.filter((result) => !result.ok)
            if (results.length === 1) {
                onSynced?.(results[0].detail || null)
            }
            if (failed.length === 0) {
                setFeedback({
                    tone: 'ok',
                    text: isMulti
                        ? `Synced ${results.length} Sygnia accounts.`
                        : results[0].message || 'Synced.',
                })
                return
            }
            if (failed.length === results.length && results.length === 1) {
                setFeedback({
                    tone: 'error',
                    text: failed[0].message || 'Sync failed.',
                })
                return
            }
            const failedLabels = failed
                .map((result) => `${accountLabel(getAccount, result.id)}: ${result.message}`)
                .join(' ')
            setFeedback({
                tone: 'error',
                text:
                    failed.length === results.length
                        ? `Could not sync Sygnia accounts. ${failedLabels}`
                        : `Synced ${results.length - failed.length} of ${results.length}. ${failedLabels}`,
            })
        } catch (err) {
            const message =
                err.response?.data?.detail || err.message || 'Failed to sync Sygnia accounts'
            setFeedback({
                tone: 'error',
                text: typeof message === 'string' ? message : 'Failed to sync Sygnia accounts',
            })
        } finally {
            setSyncing(false)
        }
    }

    const buttonClass =
        variant === 'primary'
            ? paperBtnPrimary
            : variant === 'inline'
              ? `${paperBackLink} min-h-[40px] gap-1.5 px-2 text-[var(--paper-accent)] hover:text-[var(--paper-ink)] disabled:cursor-not-allowed disabled:opacity-50`
              : paperBtnGhost

    const status = syncing
        ? { tone: 'muted', text: 'This can take a minute.' }
        : feedback

    return (
        <span className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 ${className}`.trim()}>
            <button
                type="button"
                onClick={handleClick}
                disabled={syncing || ids.length === 0}
                aria-busy={syncing}
                title={syncing ? 'This can take a minute while the broker portal is scraped.' : idleLabel}
                className={buttonClass}
            >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
                {syncing ? 'Syncing…' : idleLabel}
            </button>
            {status && (
                <span
                    role={status.tone === 'error' ? 'alert' : 'status'}
                    className={`text-xs leading-snug ${
                        status.tone === 'error'
                            ? 'text-[var(--paper-brick)]'
                            : status.tone === 'ok'
                              ? 'text-[var(--paper-olive)]'
                              : 'text-[var(--paper-muted)]'
                    }`}
                >
                    {status.text}
                </span>
            )}
        </span>
    )
}
