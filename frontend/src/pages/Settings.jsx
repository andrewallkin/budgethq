import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, LayoutDashboard, HelpCircle } from 'lucide-react'
import { formatDateSafe } from '../utils/numberFormatting'
import { fetchAuthConfig } from '../utils/authConfig'
import ConfirmModal from '../components/ConfirmModal'
import { useAutoClearingMessage } from '../hooks/useAutoClearingMessage'

export default function Settings() {
    const {
        user,
        showInvestecNav,
        updateInvestecNavPreference,
        showRaUnderInvestments,
        updateRaUnderInvestmentsPreference,
        blurSensitiveValues,
        setBlurSensitiveValues,
    } = useAuth()
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useAutoClearingMessage(8000)
    const [loading, setLoading] = useState(false)

    // Username change state
    const [username, setUsername] = useState('')
    const [usernameError, setUsernameError] = useState('')
    const [usernameSuccess, setUsernameSuccess] = useAutoClearingMessage(8000)
    const [usernameLoading, setUsernameLoading] = useState(false)
    const [restrictAuthorizedUsers, setRestrictAuthorizedUsers] = useState(true)

    // OpenAI API Key state
    const [openaiApiKey, setOpenaiApiKey] = useState('')
    const [hasApiKey, setHasApiKey] = useState(false)
    const [apiKeyError, setApiKeyError] = useState('')
    const [apiKeySuccess, setApiKeySuccess] = useAutoClearingMessage(8000)
    const [apiKeyLoading, setApiKeyLoading] = useState(false)

    // Investec settings state
    const [connectionStatus, setConnectionStatus] = useState(null)
    const [credentials, setCredentials] = useState({
        client_id: '',
        client_secret: '',
        api_key: ''
    })
    const [investecSaving, setInvestecSaving] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [investecError, setInvestecError] = useState('')
    const [investecSuccess, setInvestecSuccess] = useAutoClearingMessage(8000)
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
    const [showDeleteApiKeyConfirm, setShowDeleteApiKeyConfirm] = useState(false)
    const [showChangePasswordConfirm, setShowChangePasswordConfirm] = useState(false)
    const [syncingHistorical, setSyncingHistorical] = useState(null)
    const [syncSuccess, setSyncSuccess] = useAutoClearingMessage(8000)

    // Budget period settings
    const [budgetPeriodStartDay, setBudgetPeriodStartDay] = useState(1)
    const [budgetPeriodLoading, setBudgetPeriodLoading] = useState(false)
    const [budgetPeriodSaving, setBudgetPeriodSaving] = useState(false)
    const [budgetPeriodError, setBudgetPeriodError] = useState('')
    const [budgetPeriodSuccess, setBudgetPeriodSuccess] = useAutoClearingMessage(8000)

    // Initialize username from user
    useEffect(() => {
        if (user?.username) {
            setUsername(user.username)
        }
    }, [user])

    useEffect(() => {
        fetchAuthConfig().then((config) => {
            setRestrictAuthorizedUsers(config.restrict_authorized_users)
        })
    }, [])

    // Check if user has API key on mount
    useEffect(() => {
        const checkApiKey = async () => {
            try {
                const response = await axios.get('/api/auth/user/settings/openai-key')
                setHasApiKey(response.data.has_key)
            } catch (err) {
                console.error('Failed to check API key status', err)
            }
        }
        checkApiKey()
    }, [])

    const fetchConnectionStatus = async () => {
        try {
            const response = await axios.get('/api/investec/credentials/status')
            setConnectionStatus(response.data)
        } catch (err) {
            setConnectionStatus({ is_connected: false })
        }
    }

    useEffect(() => {
        fetchConnectionStatus()
    }, [])

    // Fetch budget period on mount
    useEffect(() => {
        const fetchBudgetPeriod = async () => {
            setBudgetPeriodLoading(true)
            try {
                const response = await axios.get('/api/budget/default_user')
                setBudgetPeriodStartDay(response.data.budget_period_start_day ?? 1)
            } catch (err) {
                // No budget yet - use default
                setBudgetPeriodStartDay(1)
            } finally {
                setBudgetPeriodLoading(false)
            }
        }
        fetchBudgetPeriod()
    }, [])

    const handleBudgetPeriodSave = async (e) => {
        e.preventDefault()
        setBudgetPeriodError('')
        setBudgetPeriodSuccess('')
        setBudgetPeriodSaving(true)
        try {
            await axios.patch('/api/budget/default_user', {
                budget_period_start_day: Math.max(1, Math.min(31, budgetPeriodStartDay)) || 1
            })
            setBudgetPeriodSuccess('Budget period saved')
        } catch (err) {
            setBudgetPeriodError(err.response?.data?.detail || 'Failed to save budget period')
        } finally {
            setBudgetPeriodSaving(false)
        }
    }

    const handleInvestecConnect = async (e) => {
        e.preventDefault()
        setInvestecError('')
        setInvestecSuccess('')
        setInvestecSaving(true)

        try {
            await axios.post('/api/investec/credentials', credentials)
            setInvestecSuccess('Successfully connected to Investec! Syncing accounts...')
            setCredentials({ client_id: '', client_secret: '', api_key: '' })

            await axios.post('/api/investec/accounts/sync')
            await fetchConnectionStatus()
            // Backend auto-sets has_investec_account=true on connect; refresh nav preference
            await updateInvestecNavPreference(true)
        } catch (err) {
            setInvestecError(err.response?.data?.detail || 'Failed to connect. Please check your credentials.')
        } finally {
            setInvestecSaving(false)
        }
    }

    const handleInvestecDisconnect = async () => {
        setInvestecError('')
        setInvestecSuccess('')
        setInvestecSaving(true)

        try {
            await axios.delete('/api/investec/credentials')
            setInvestecSuccess('Successfully disconnected from Investec')
            await fetchConnectionStatus()
        } catch (err) {
            setInvestecError(err.response?.data?.detail || 'Failed to disconnect')
        } finally {
            setInvestecSaving(false)
        }
    }

    const handleSyncNow = async () => {
        setInvestecError('')
        setInvestecSuccess('')
        setSyncing(true)

        try {
            await axios.post('/api/investec/accounts/sync')
            setInvestecSuccess('Accounts synced successfully')
            await fetchConnectionStatus()
        } catch (err) {
            setInvestecError(err.response?.data?.detail || 'Failed to sync accounts')
        } finally {
            setSyncing(false)
        }
    }

    const handleHistoricalSync = async (months) => {
        setInvestecError('')
        setSyncSuccess('')
        setSyncingHistorical(months)

        try {
            const response = await axios.post('/api/investec/transactions/sync-historical', { months })
            setSyncSuccess(
                `Synced ${response.data.new_transactions} transactions from the last ${months} month(s) ` +
                `(${response.data.categorized} categorized by rules)`
            )
        } catch (err) {
            setInvestecError(err.response?.data?.detail || 'Failed to sync historical transactions')
        } finally {
            setSyncingHistorical(null)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match')
            return
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }

        setShowChangePasswordConfirm(true)
    }

    const doChangePassword = async () => {
        setLoading(true)

        try {
            await axios.post('/api/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword
            })
            setSuccess('Password changed successfully!')
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to change password')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveApiKey = async (e) => {
        e.preventDefault()
        setApiKeyError('')
        setApiKeySuccess('')

        if (!openaiApiKey.trim()) {
            setApiKeyError('API key cannot be empty')
            return
        }

        setApiKeyLoading(true)

        try {
            await axios.put('/api/auth/user/settings/openai-key', {
                api_key: openaiApiKey
            })
            setApiKeySuccess('OpenAI API key saved successfully!')
            setHasApiKey(true)
            setOpenaiApiKey('')
        } catch (err) {
            setApiKeyError(err.response?.data?.detail || 'Failed to save API key')
        } finally {
            setApiKeyLoading(false)
        }
    }

    const handleDeleteApiKey = () => {
        setShowDeleteApiKeyConfirm(true)
    }

    const doDeleteApiKey = async () => {
        setApiKeyError('')
        setApiKeySuccess('')
        setApiKeyLoading(true)

        try {
            await axios.delete('/api/auth/user/settings/openai-key')
            setApiKeySuccess('OpenAI API key deleted successfully')
            setHasApiKey(false)
            setOpenaiApiKey('')
        } catch (err) {
            setApiKeyError(err.response?.data?.detail || 'Failed to delete API key')
        } finally {
            setApiKeyLoading(false)
        }
    }

    const handleUsernameChange = async (e) => {
        e.preventDefault()
        setUsernameError('')
        setUsernameSuccess('')

        if (!username.trim()) {
            setUsernameError('Username cannot be empty')
            return
        }

        if (username === user?.username) {
            setUsernameError('New username is the same as current username')
            return
        }

        setUsernameLoading(true)

        try {
            await axios.put('/api/auth/user/username', {
                username: username.trim()
            })
            setUsernameSuccess('Username updated successfully! Please log in again for changes to take effect.')
        } catch (err) {
            setUsernameError(err.response?.data?.detail || 'Failed to update username')
        } finally {
            setUsernameLoading(false)
        }
    }

    return (
        <div className="w-full">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-5">⚙️ Settings</h1>

            {/* Top row: 3-column on xl, 2-column on lg, 1-column on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">

                {/* Account Information */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                    <div className="p-5">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Account Information</h2>
                        {usernameError && (
                            <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{usernameError}</div>
                        )}
                        {usernameSuccess && (
                            <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm">{usernameSuccess}</div>
                        )}
                        <form onSubmit={handleUsernameChange}>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Username</label>
                            <div className="flex gap-2">
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <button
                                    type="submit"
                                    disabled={usernameLoading || username === user?.username}
                                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {usernameLoading ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                            {restrictAuthorizedUsers && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Must be in the authorized users list</p>
                            )}
                        </form>
                    </div>

                    <div className="p-5">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Change Password</h3>
                        {error && (
                            <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>
                        )}
                        {success && (
                            <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm">{success}</div>
                        )}
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label htmlFor="current-password" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Current Password</label>
                                <input
                                    id="current-password"
                                    type="password"
                                    required
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label htmlFor="new-password" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">New Password</label>
                                <input
                                    id="new-password"
                                    type="password"
                                    required
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Confirm New Password</label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {loading ? 'Changing...' : 'Change Password'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* OpenAI API Key */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">OpenAI API Key</h2>
                        {hasApiKey && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
                                <CheckCircle className="w-3 h-3" /> Active
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Encrypted key used for payslip data extraction. Get one at{' '}
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                            OpenAI Platform
                        </a>.
                    </p>
                    {apiKeyError && (
                        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">{apiKeyError}</div>
                    )}
                    {apiKeySuccess && (
                        <div className="mb-3 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm">{apiKeySuccess}</div>
                    )}
                    <form onSubmit={handleSaveApiKey} className="space-y-3">
                        <div>
                            <label htmlFor="openai-api-key" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                {hasApiKey ? 'Replace API Key' : 'API Key'}
                            </label>
                            <input
                                id="openai-api-key"
                                type="password"
                                required
                                value={openaiApiKey}
                                onChange={(e) => setOpenaiApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={apiKeyLoading}
                                className="flex-1 py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {apiKeyLoading ? 'Saving...' : hasApiKey ? 'Update Key' : 'Save Key'}
                            </button>
                            {hasApiKey && (
                                <button
                                    type="button"
                                    onClick={handleDeleteApiKey}
                                    disabled={apiKeyLoading}
                                    className="py-2 px-4 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* RA under Investments */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">RA tools under Investments</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                Shows RA Performance and the RA tax calculator on the Investments page and home
                            </p>
                        </div>
                        <button
                            role="switch"
                            aria-checked={showRaUnderInvestments}
                            onClick={() => updateRaUnderInvestmentsPreference(!showRaUnderInvestments)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                showRaUnderInvestments ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    showRaUnderInvestments ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>

                {/* Investec Integration */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                    <div className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Investec Integration</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Shows Investec Banking in the navigation</p>
                            </div>
                            <button
                                role="switch"
                                aria-checked={showInvestecNav}
                                onClick={() => updateInvestecNavPreference(!showInvestecNav)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                    showInvestecNav ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        showInvestecNav ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    {showInvestecNav && (
                        <div className="p-5 space-y-4">
                            {investecError && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                    <span>{investecError}</span>
                                </div>
                            )}
                            {investecSuccess && (
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg text-sm flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>{investecSuccess}</span>
                                </div>
                            )}

                            {connectionStatus === null ? (
                                <p className="text-sm text-gray-400">Checking connection...</p>
                            ) : connectionStatus?.is_connected ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400 shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">Connected</p>
                                                {connectionStatus.last_synced && (
                                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                                        Last synced {formatDateSafe(connectionStatus.last_synced, {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleSyncNow}
                                                disabled={syncing}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors"
                                            >
                                                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                                                {syncing ? 'Syncing' : 'Sync'}
                                            </button>
                                            <button
                                                onClick={() => setShowDisconnectConfirm(true)}
                                                className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pt-1">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sync Historical Transactions</p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Import past transactions for the selected time period</p>
                                        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                                            {[1, 3, 6].map((months, idx) => (
                                                <button
                                                    key={months}
                                                    onClick={() => handleHistoricalSync(months)}
                                                    disabled={!!syncingHistorical}
                                                    className={`flex-1 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                                                        syncingHistorical === months
                                                            ? 'bg-purple-600 text-white'
                                                            : 'text-purple-700 dark:text-purple-300 bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                                                    } ${idx < 2 ? 'border-r border-gray-200 dark:border-gray-600' : ''}`}
                                                >
                                                    {syncingHistorical === months ? 'Syncing...' : `${months} month${months > 1 ? 's' : ''}`}
                                                </button>
                                            ))}
                                        </div>
                                        {syncSuccess && (
                                            <p className="mt-2 text-xs text-green-600 dark:text-green-400">{syncSuccess}</p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2">
                                        <XCircle className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Not Connected</p>
                                    </div>
                                    <form onSubmit={handleInvestecConnect} className="space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Client ID</label>
                                            <input
                                                type="password"
                                                value={credentials.client_id}
                                                onChange={(e) => setCredentials({ ...credentials, client_id: e.target.value })}
                                                required
                                                placeholder="Enter your Client ID"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Client Secret</label>
                                            <input
                                                type="password"
                                                value={credentials.client_secret}
                                                onChange={(e) => setCredentials({ ...credentials, client_secret: e.target.value })}
                                                required
                                                placeholder="Enter your Client Secret"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">API Key</label>
                                            <input
                                                type="password"
                                                value={credentials.api_key}
                                                onChange={(e) => setCredentials({ ...credentials, api_key: e.target.value })}
                                                required
                                                placeholder="Enter your API Key"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={investecSaving}
                                            className="w-full py-2 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                        >
                                            {investecSaving ? 'Connecting...' : 'Connect Account'}
                                        </button>
                                    </form>
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                        <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1.5">How to get your credentials:</p>
                                        <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-0.5 list-decimal list-inside">
                                            <li>Log in to Investec Online Banking</li>
                                            <li>Navigate to Programmable Banking</li>
                                            <li>Create or use an existing API key</li>
                                            <li>Copy the Client ID, Secret, and API Key</li>
                                        </ol>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Second row: Budget Categories, Budget Preferences, Privacy */}
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {/* Budget Categories */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Budget Categories</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Manage budget entries and view the transaction category reference.
                    </p>
                    <div className="flex flex-col gap-2">
                        <Link
                            to="/budget"
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <LayoutDashboard className="w-7 h-7 text-blue-500 dark:text-blue-400 shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Budget Dashboard</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500">Manage needs, wants, and savings categories</p>
                            </div>
                        </Link>
                        <Link
                            to="/category-guide"
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <HelpCircle className="w-7 h-7 text-blue-500 dark:text-blue-400 shrink-0" />
                            <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Category Guide</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500">Transaction category reference and examples</p>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Budget Preferences */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Budget Preferences</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Day of month your budget period starts. E.g., day 22 means 22nd → 21st of next month.
                    </p>
                    {budgetPeriodLoading ? (
                        <p className="text-sm text-gray-400">Loading...</p>
                    ) : (
                        <form onSubmit={handleBudgetPeriodSave}>
                            <label htmlFor="budget-period-start" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Period start day</label>
                            <div className="flex items-center gap-3">
                                <input
                                    id="budget-period-start"
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={budgetPeriodStartDay}
                                    onChange={(e) => setBudgetPeriodStartDay(parseInt(e.target.value, 10) || 1)}
                                    className="w-20 px-3 py-2 text-sm text-center font-medium border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <span className="text-sm text-gray-500 dark:text-gray-400">of each month</span>
                                <button
                                    type="submit"
                                    disabled={budgetPeriodSaving}
                                    className="ml-auto px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                >
                                    {budgetPeriodSaving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    )}
                    {budgetPeriodError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{budgetPeriodError}</p>}
                    {budgetPeriodSuccess && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{budgetPeriodSuccess}</p>}
                </div>

                {/* Privacy */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Privacy</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Hide amounts when sharing your screen (e.g. with friends)
                    </p>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Blur sensitive values</span>
                        <button
                            role="switch"
                            aria-checked={blurSensitiveValues}
                            onClick={() => setBlurSensitiveValues(!blurSensitiveValues)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                blurSensitiveValues ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    blurSensitiveValues ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDisconnectConfirm}
                onClose={() => setShowDisconnectConfirm(false)}
                onConfirm={handleInvestecDisconnect}
                title="Disconnect Investec?"
                message="This will permanently delete ALL Investec data. This action cannot be undone."
                details={[
                    'API credentials (Client ID, Secret, API Key)',
                    'All bank accounts',
                    'All transactions',
                    'All categorization rules',
                ]}
                confirmText="Disconnect"
                cancelText="Cancel"
                variant="danger"
            />

            <ConfirmModal
                isOpen={showDeleteApiKeyConfirm}
                onClose={() => setShowDeleteApiKeyConfirm(false)}
                onConfirm={doDeleteApiKey}
                title="Remove OpenAI API Key?"
                message="Your encrypted API key will be permanently deleted. You will no longer be able to extract payslip data automatically."
                confirmText="Remove Key"
                cancelText="Cancel"
                variant="danger"
            />

            <ConfirmModal
                isOpen={showChangePasswordConfirm}
                onClose={() => setShowChangePasswordConfirm(false)}
                onConfirm={doChangePassword}
                title="Change Password?"
                message="Are you sure you want to change your password? You will need to use the new password on your next login."
                confirmText="Change Password"
                cancelText="Cancel"
                variant="warning"
            />
        </div>
    )
}
