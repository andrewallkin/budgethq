import { useState, useEffect } from 'react'
import axios from 'axios'
import { RefreshCw, MoreVertical, Star, Shield, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'

export default function AccountsDashboard() {
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [accounts, setAccounts] = useState([])
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [activeDropdown, setActiveDropdown] = useState(null)

    useEffect(() => {
        fetchAccounts()
    }, [])

    const fetchAccounts = async () => {
        try {
            const response = await axios.get('/api/investec/accounts')
            setAccounts(response.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load accounts')
        } finally {
            setLoading(false)
        }
    }

    const handleSyncAll = async () => {
        setError('')
        setSuccess('')
        setSyncing(true)

        try {
            await axios.post('/api/investec/accounts/sync')
            setSuccess('All accounts synced successfully')
            await fetchAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to sync accounts')
        } finally {
            setSyncing(false)
        }
    }

    const handleSetPrimary = async (accountId) => {
        try {
            await axios.patch(`/api/investec/accounts/${accountId}`, { is_primary: true })
            setSuccess('Primary account updated')
            setActiveDropdown(null)
            await fetchAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update account')
        }
    }

    const handleSetEmergencyFund = async (accountId) => {
        try {
            await axios.post(`/api/investec/accounts/${accountId}/set-emergency-fund`)
            setSuccess('Emergency fund account updated')
            setActiveDropdown(null)
            await fetchAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update account')
        }
    }

    const handleDeactivate = async (accountId) => {
        if (!confirm('Deactivate this account? Transaction history will be preserved.')) return

        try {
            await axios.patch(`/api/investec/accounts/${accountId}`, { is_active: false })
            setSuccess('Account deactivated')
            setActiveDropdown(null)
            await fetchAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to deactivate account')
        }
    }

    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0)
    const lastSynced = accounts.length > 0
        ? accounts.reduce((latest, acc) => {
            if (!acc.last_synced) return latest
            const accDate = new Date(acc.last_synced)
            return accDate > latest ? accDate : latest
        }, new Date(0))
        : null

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600 dark:text-gray-400">Loading accounts...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                    Bank Accounts
                </h1>
                <button
                    onClick={handleSyncAll}
                    disabled={syncing || accounts.length === 0}
                    className="px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync All Accounts'}
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg">
                    {success}
                </div>
            )}

            {accounts.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 p-8 sm:p-12 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        No accounts connected. Go to Settings to connect your Investec account.
                    </p>
                    <a
                        href="/settings"
                        className="inline-block px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Go to Settings
                    </a>
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Balance</p>
                            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                                {formatCurrency(totalBalance)}
                            </p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active Accounts</p>
                            <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                                {accounts.filter(a => a.is_active).length}
                            </p>
                        </div>

                        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Last Synced</p>
                            <p className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                                {lastSynced && lastSynced > new Date(0)
                                    ? formatDateSafe(lastSynced.toISOString(), {
                                        day: 'numeric',
                                        month: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })
                                    : '—'}
                            </p>
                        </div>
                    </div>

                    {/* Account Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...accounts.filter(a => a.is_active)].sort((a, b) => {
                            if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
                            if (a.is_emergency_fund_account !== b.is_emergency_fund_account) return a.is_emergency_fund_account ? -1 : 1
                            return a.id - b.id
                        }).map((account) => (
                            <div
                                key={account.id}
                                className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 relative min-h-[220px] flex flex-col justify-between"
                            >
                                {/* Dropdown Menu */}
                                <div className="absolute top-4 right-4">
                                    <button
                                        onClick={() => setActiveDropdown(activeDropdown === account.id ? null : account.id)}
                                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    >
                                        <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                    </button>

                                    {activeDropdown === account.id && (
                                        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-10">
                                            {!account.is_primary && (
                                                <button
                                                    onClick={() => handleSetPrimary(account.id)}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 flex items-center gap-2"
                                                >
                                                    <Star className="w-4 h-4" />
                                                    Set as Primary
                                                </button>
                                            )}
                                            {!account.is_emergency_fund_account && (
                                                <button
                                                    onClick={() => handleSetEmergencyFund(account.id)}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 flex items-center gap-2"
                                                >
                                                    <Shield className="w-4 h-4" />
                                                    Set as Emergency Fund
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeactivate(account.id)}
                                                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-600 text-red-600 dark:text-red-400"
                                            >
                                                Deactivate
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Account Info */}
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {account.account_name}
                                        </h3>
                                        {account.is_primary && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                                                <Star className="w-3 h-3 mr-1" />
                                                Primary
                                            </span>
                                        )}
                                        {account.is_emergency_fund_account && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                                                <Shield className="w-3 h-3 mr-1" />
                                                Emergency Fund
                                            </span>
                                        )}
                                    </div>
                                    {account.reference_name && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {account.reference_name}
                                        </p>
                                    )}
                                    <p className="text-sm text-gray-500 dark:text-gray-500">
                                        {account.product_name}
                                    </p>
                                </div>

                                {/* Balances */}
                                <div className="space-y-2">
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Current Balance</p>
                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {formatCurrency(account.current_balance || 0)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Available Balance</p>
                                        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                                            {formatCurrency(account.available_balance || 0)}
                                        </p>
                                    </div>
                                </div>

                                {account.balance_updated_at && (
                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                                        Updated: {formatDateSafe(account.balance_updated_at, {
                                            day: 'numeric',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
