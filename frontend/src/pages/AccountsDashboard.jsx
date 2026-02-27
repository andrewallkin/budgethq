import { useState, useEffect } from 'react'
import axios from 'axios'
import { RefreshCw, MoreVertical, Star, Shield, AlertTriangle, Plus, Trash2, Wallet } from 'lucide-react'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import BlurredValue from '../components/BlurredValue'
import AddManualAccountModal from '../components/AddManualAccountModal'

export default function AccountsDashboard() {
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [accounts, setAccounts] = useState([])
    const [manualAccounts, setManualAccounts] = useState([])
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [activeDropdown, setActiveDropdown] = useState(null)
    const [manualDropdown, setManualDropdown] = useState(null)
    const [addModalOpen, setAddModalOpen] = useState(false)
    const [editingBalanceId, setEditingBalanceId] = useState(null)
    const [editingBalanceValue, setEditingBalanceValue] = useState('')

    useEffect(() => {
        fetchAllAccounts()
    }, [])

    useEffect(() => {
        if (!activeDropdown && !manualDropdown) return
        const handleClickOutside = (e) => {
            if (!e.target.closest('[data-dropdown]')) {
                setActiveDropdown(null)
                setManualDropdown(null)
            }
        }
        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [activeDropdown, manualDropdown])

    const fetchAllAccounts = async () => {
        try {
            setError('')
            const [investecRes, manualRes] = await Promise.all([
                axios.get('/api/investec/accounts'),
                axios.get('/api/manual-accounts')
            ])
            setAccounts(investecRes.data)
            setManualAccounts(manualRes.data)
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
            await fetchAllAccounts()
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
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update account')
        }
    }

    const handleSetEmergencyFund = async (accountId) => {
        try {
            await axios.post(`/api/investec/accounts/${accountId}/set-emergency-fund`)
            setSuccess('Emergency fund account updated')
            setActiveDropdown(null)
            await fetchAllAccounts()
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
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to deactivate account')
        }
    }

    const handleUpdateManualAccount = async (accountId, updates) => {
        try {
            await axios.patch(`/api/manual-accounts/${accountId}`, updates)
            setSuccess('Account updated')
            setManualDropdown(null)
            setEditingBalanceId(null)
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update account')
        }
    }

    const handleDeleteManualAccount = async (accountId) => {
        if (!confirm('Delete this manual account?')) return
        try {
            await axios.delete(`/api/manual-accounts/${accountId}`)
            setSuccess('Account deleted')
            setManualDropdown(null)
            await fetchAllAccounts()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete account')
        }
    }

    const handleBalanceBlur = (accountId) => {
        const num = parseFloat(editingBalanceValue)
        if (!isNaN(num) && num >= 0) {
            handleUpdateManualAccount(accountId, { balance: num })
        }
        setEditingBalanceId(null)
        setEditingBalanceValue('')
    }

    const investecTotal = accounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0)
    const manualTotal = manualAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0)
    const totalBalance = investecTotal + manualTotal
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
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={handleSyncAll}
                        disabled={syncing || accounts.length === 0}
                        className="px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing...' : 'Sync All Accounts'}
                    </button>
                    <button
                        onClick={() => setAddModalOpen(true)}
                        className="px-4 py-2.5 min-h-[44px] bg-gray-700 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Manual Account
                    </button>
                </div>
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

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Balance</p>
                    <BlurredValue><p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(totalBalance)}
                    </p></BlurredValue>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Accounts</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {accounts.filter(a => a.is_active).length + manualAccounts.length}
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

            {/* Investec Account Cards */}
            {accounts.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 p-8 sm:p-12 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        No Investec accounts connected. Go to Settings to connect your Investec account.
                    </p>
                    <a
                        href="/settings"
                        className="inline-block px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Go to Settings
                    </a>
                </div>
            ) : (
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
                                <div className="absolute top-4 right-4" data-dropdown>
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
                                        <BlurredValue><p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {formatCurrency(account.current_balance || 0)}
                                        </p></BlurredValue>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Available Balance</p>
                                        <BlurredValue><p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                                            {formatCurrency(account.available_balance || 0)}
                                        </p></BlurredValue>
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
            )}

            {/* Manual Accounts */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    Manual Accounts
                </h2>
                {manualAccounts.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            No manual accounts yet. Add accounts you track manually (e.g. other bank accounts).
                        </p>
                        <button
                            onClick={() => setAddModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-700 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-500 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Manual Account
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {manualAccounts.map((account) => (
                            <div
                                key={account.id}
                                className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 relative min-h-[180px] flex flex-col justify-between border-l-4 border-l-amber-500"
                            >
                                <div className="absolute top-4 right-4" data-dropdown>
                                    <button
                                        onClick={() => setManualDropdown(manualDropdown === account.id ? null : account.id)}
                                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    >
                                        <MoreVertical className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                    </button>
                                    {manualDropdown === account.id && (
                                        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-10">
                                            <button
                                                onClick={() => {
                                                    handleUpdateManualAccount(account.id, { is_emergency_savings: !account.is_emergency_savings })
                                                }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 flex items-center gap-2"
                                            >
                                                <Shield className="w-4 h-4" />
                                                {account.is_emergency_savings ? 'Remove from Emergency Fund' : 'Add to Emergency Fund'}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteManualAccount(account.id)}
                                                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-600 text-red-600 dark:text-red-400 flex items-center gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="mb-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                            {account.name}
                                        </h3>
                                        {account.is_emergency_savings && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                                                <Shield className="w-3 h-3 mr-1" />
                                                Emergency Fund
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-500">Manual</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Balance</p>
                                    {editingBalanceId === account.id ? (
                                        <BlurredValue as="div">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editingBalanceValue}
                                            onChange={(e) => setEditingBalanceValue(e.target.value)}
                                            onBlur={() => handleBalanceBlur(account.id)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleBalanceBlur(account.id)}
                                            className="w-full px-3 py-2 text-xl font-bold border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            autoFocus
                                        />
                                        </BlurredValue>
                                    ) : (
                                        <p
                                            className="text-2xl font-bold text-gray-900 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded px-1 -mx-1"
                                            onClick={() => {
                                                setEditingBalanceId(account.id)
                                                setEditingBalanceValue(String(account.balance ?? 0))
                                            }}
                                        >
                                            <BlurredValue>{formatCurrency(account.balance || 0)}</BlurredValue>
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <AddManualAccountModal
                isOpen={addModalOpen}
                onClose={() => setAddModalOpen(false)}
                onSuccess={fetchAllAccounts}
            />
        </div>
    )
}
