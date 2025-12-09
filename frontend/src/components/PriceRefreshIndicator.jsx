import { useState, useEffect } from 'react'
import { RefreshCw, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import axios from 'axios'

export default function PriceRefreshIndicator({ onRefresh }) {
    const [lastSync, setLastSync] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetchLastSync()
        // Poll for updates every minute
        const interval = setInterval(fetchLastSync, 60000)
        return () => clearInterval(interval)
    }, [])

    const fetchLastSync = async () => {
        try {
            const res = await axios.get('/api/etf/last-sync')
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
            await axios.post('/api/etf/sync-prices')
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
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffMins < 1) return 'Just now'
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

    return (
        <div className="flex items-center gap-3">
            {/* Status Indicator */}
            <div className="flex items-center gap-2 text-sm">
                {status === 'fresh' ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                ) : status === 'stale' ? (
                    <Clock className="w-4 h-4 text-yellow-500" />
                ) : (
                    <AlertCircle className="w-4 h-4 text-gray-400" />
                )}
                <span className={`${
                    status === 'fresh'
                        ? 'text-green-600 dark:text-green-400'
                        : status === 'stale'
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-gray-500 dark:text-gray-400'
                }`}>
                    {lastSync ? (
                        <>Prices updated {getTimeAgo(lastSync)}</>
                    ) : (
                        'Prices not synced'
                    )}
                </span>
            </div>

            {/* Manual Refresh Button */}
            <button
                onClick={handleManualSync}
                disabled={syncing}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    syncing
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                }`}
                title="Refresh prices from Google Sheets"
            >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Refresh'}
            </button>

            {/* Error Toast */}
            {error && (
                <span className="text-xs text-red-500 dark:text-red-400">
                    {error}
                </span>
            )}
        </div>
    )
}

