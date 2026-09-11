import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import axios from 'axios'
import { paperIconBtn } from './appUi'

export default function PriceRefreshIndicator({ onRefresh, portfolioId = null }) {
    const [lastSync, setLastSync] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [error, setError] = useState(null)
    const intervalRef = useRef(null)

    useEffect(() => {
        fetchLastSync()

        intervalRef.current = setInterval(fetchLastSync, 60000)

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [])

    const fetchLastSync = async () => {
        try {
            const res = await axios.get(
                '/api/etf/last-sync',
                portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            )
            setLastSync(res.data.last_sync)
            setError(null)
        } catch (err) {
            console.error('Failed to fetch last sync time:', err)
        }
    }

    const handleManualSync = async () => {
        setSyncing(true)
        setError(null)

        try {
            await axios.post(
                '/api/etf/sync-prices',
                {},
                portfolioId ? { params: { portfolio_id: portfolioId } } : undefined
            )
            await fetchLastSync()
            onRefresh?.()
        } catch (err) {
            setError(err.response?.data?.detail || 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }

    const getTimeAgo = (isoString) => {
        if (!isoString) return 'Never'

        const date = new Date(isoString)
        const now = new Date()
        const diffMs = now - date
        const diffSeconds = Math.floor(diffMs / 1000)
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffSeconds < 60) return `${diffSeconds}s ago`
        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        return `${diffDays}d ago`
    }

    const getSyncStatus = () => {
        if (!lastSync) return 'unknown'

        const date = new Date(lastSync)
        const now = new Date()
        const diffMs = now - date
        const diffMins = Math.floor(diffMs / 60000)

        if (diffMins < 10) return 'fresh'
        if (diffMins < 30) return 'stale'
        return 'old'
    }

    const status = getSyncStatus()

    const statusIcon =
        status === 'fresh' ? (
            <CheckCircle className="h-3.5 w-3.5 text-[var(--paper-olive)]" aria-hidden="true" />
        ) : status === 'stale' ? (
            <Clock className="h-3.5 w-3.5 text-[var(--paper-accent)]" aria-hidden="true" />
        ) : (
            <AlertCircle className="h-3.5 w-3.5 text-[var(--paper-muted)]" aria-hidden="true" />
        )

    const statusTextClass =
        status === 'fresh'
            ? 'text-[var(--paper-olive)]'
            : status === 'stale'
              ? 'text-[var(--paper-accent)]'
              : 'text-[var(--paper-muted)]'

    return (
        <div className="flex items-center gap-2">
            <div
                className={`hidden items-center gap-1.5 text-xs sm:flex ${statusTextClass}`}
                title={lastSync ? `Last sync: ${new Date(lastSync).toLocaleString()}` : undefined}
            >
                {statusIcon}
                <span className="whitespace-nowrap">
                    {lastSync ? getTimeAgo(lastSync) : 'Not synced'}
                </span>
            </div>

            <button
                type="button"
                onClick={handleManualSync}
                disabled={syncing}
                className={paperIconBtn}
                title="Refresh prices from Google Sheets"
                aria-label={syncing ? 'Syncing prices' : 'Refresh prices from Google Sheets'}
            >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>

            {error && (
                <span role="alert" className="max-w-[8rem] truncate text-xs text-[var(--paper-brick)] sm:max-w-none">
                    {error}
                </span>
            )}
        </div>
    )
}
