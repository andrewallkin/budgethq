import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, LayoutDashboard, HelpCircle } from 'lucide-react'
import { formatDateSafe } from '../utils/numberFormatting'

export default function Settings() {
    const { user } = useAuth()
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [loading, setLoading] = useState(false)

    // Username change state
    const [username, setUsername] = useState('')
    const [usernameError, setUsernameError] = useState('')
    const [usernameSuccess, setUsernameSuccess] = useState('')
    const [usernameLoading, setUsernameLoading] = useState(false)

    // OpenAI API Key state
    const [openaiApiKey, setOpenaiApiKey] = useState('')
    const [hasApiKey, setHasApiKey] = useState(false)
    const [apiKeyError, setApiKeyError] = useState('')
    const [apiKeySuccess, setApiKeySuccess] = useState('')
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
    const [investecSuccess, setInvestecSuccess] = useState('')
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
    const [syncingHistorical, setSyncingHistorical] = useState(null)
    const [syncSuccess, setSyncSuccess] = useState('')

    // Budget period settings
    const [budgetPeriodStartDay, setBudgetPeriodStartDay] = useState(1)
    const [budgetPeriodLoading, setBudgetPeriodLoading] = useState(false)
    const [budgetPeriodSaving, setBudgetPeriodSaving] = useState(false)
    const [budgetPeriodError, setBudgetPeriodError] = useState('')
    const [budgetPeriodSuccess, setBudgetPeriodSuccess] = useState('')

    // Initialize username from user
    useEffect(() => {
        if (user?.username) {
            setUsername(user.username)
        }
    }, [user])

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
            setTimeout(() => setBudgetPeriodSuccess(''), 3000)
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
            setShowDisconnectConfirm(false)
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
            setTimeout(() => setSyncSuccess(''), 5000)
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

    const handleDeleteApiKey = async () => {
        if (!confirm('Are you sure you want to delete your OpenAI API key?')) {
            return
        }

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
        <div className="w-full max-w-2xl sm:max-w-4xl lg:max-w-6xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-6 sm:mb-8">⚙️ Settings</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                {/* Block 1: Account Information */}
                <div className="flex flex-col min-h-[280px] bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Account Information</h2>

                    {usernameError && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg text-sm">
                            {usernameError}
                        </div>
                    )}

                    {usernameSuccess && (
                        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg text-sm">
                            {usernameSuccess}
                        </div>
                    )}

                    <form onSubmit={handleUsernameChange} className="space-y-4 mb-6">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Username
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <button
                                    type="submit"
                                    disabled={usernameLoading || username === user?.username}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                                >
                                    {usernameLoading ? 'Updating...' : 'Update'}
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Note: Username must still be in the authorized users list
                            </p>
                        </div>
                    </form>

                    <hr className="my-6 border-gray-200 dark:border-gray-700" />

                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Password</h3>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg text-sm">
                            {success}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Current Password
                            </label>
                            <input
                                id="current-password"
                                type="password"
                                required
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                New Password
                            </label>
                            <input
                                id="new-password"
                                type="password"
                                required
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Confirm New Password
                            </label>
                            <input
                                id="confirm-password"
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {loading ? 'Changing Password...' : 'Change Password'}
                        </button>
                    </form>
                </div>

                {/* Block 2: OpenAI API Key */}
                <div className="flex flex-col min-h-[280px] bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">OpenAI API Key</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Your API key is encrypted and used only for payslip data extraction. You can get an API key from{' '}
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                            OpenAI Platform
                        </a>.
                    </p>

                    {hasApiKey && (
                        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg text-sm flex items-center justify-between">
                            <span>✓ API key is configured</span>
                            <button
                                onClick={handleDeleteApiKey}
                                disabled={apiKeyLoading}
                                className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                            >
                                Remove
                            </button>
                        </div>
                    )}

                    {apiKeyError && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg text-sm">
                            {apiKeyError}
                        </div>
                    )}

                    {apiKeySuccess && (
                        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg text-sm">
                            {apiKeySuccess}
                        </div>
                    )}

                    <form onSubmit={handleSaveApiKey} className="space-y-4">
                        <div>
                            <label htmlFor="openai-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                {hasApiKey ? 'Update API Key' : 'API Key'}
                            </label>
                            <input
                                id="openai-api-key"
                                type="password"
                                required
                                value={openaiApiKey}
                                onChange={(e) => setOpenaiApiKey(e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={apiKeyLoading}
                            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {apiKeyLoading ? 'Saving...' : hasApiKey ? 'Update API Key' : 'Save API Key'}
                        </button>
                    </form>
                </div>

                {/* Block 3: Investec Integration */}
                <div className="flex flex-col min-h-[280px] bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Investec Integration</h2>

                {investecError && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg text-sm flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span>{investecError}</span>
                    </div>
                )}

                {investecSuccess && (
                    <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg text-sm flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 flex-shrink-0" />
                        <span>{investecSuccess}</span>
                    </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                    {connectionStatus === null ? (
                        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
                    ) : connectionStatus?.is_connected ? (
                        <>
                            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                            <div>
                                <p className="text-gray-900 dark:text-white font-medium">Connected</p>
                                {connectionStatus.last_synced && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Last synced: {formatDateSafe(connectionStatus.last_synced, {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <XCircle className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                            <p className="text-gray-900 dark:text-white font-medium">Not Connected</p>
                        </>
                    )}
                </div>

                {connectionStatus?.is_connected && (
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <button
                            onClick={handleSyncNow}
                            disabled={syncing}
                            className="px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                            {syncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                        <button
                            onClick={() => setShowDisconnectConfirm(true)}
                            className="px-4 py-2.5 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Disconnect
                        </button>
                    </div>
                )}

                {connectionStatus?.is_connected && (
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                            Sync Historical Transactions
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Import past transactions for the selected time period
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            {[1, 3, 6].map(months => (
                                <button
                                    key={months}
                                    onClick={() => handleHistoricalSync(months)}
                                    disabled={syncingHistorical === months}
                                    className="px-4 py-2.5 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {syncingHistorical === months ? 'Syncing...' : `${months} Month${months > 1 ? 's' : ''}`}
                                </button>
                            ))}
                        </div>
                        {syncSuccess && (
                            <p className="mt-3 text-sm text-green-600 dark:text-green-400">
                                {syncSuccess}
                            </p>
                        )}
                    </div>
                )}

                {connectionStatus !== null && !connectionStatus?.is_connected && (
                    <>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Connect Investec Account
                        </h3>

                        <form onSubmit={handleInvestecConnect} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Client ID
                                </label>
                                <input
                                    type="password"
                                    value={credentials.client_id}
                                    onChange={(e) => setCredentials({ ...credentials, client_id: e.target.value })}
                                    required
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="Enter your Investec Client ID"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Client Secret
                                </label>
                                <input
                                    type="password"
                                    value={credentials.client_secret}
                                    onChange={(e) => setCredentials({ ...credentials, client_secret: e.target.value })}
                                    required
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="Enter your Investec Client Secret"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    API Key
                                </label>
                                <input
                                    type="password"
                                    value={credentials.api_key}
                                    onChange={(e) => setCredentials({ ...credentials, api_key: e.target.value })}
                                    required
                                    className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="Enter your Investec API Key"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={investecSaving}
                                className="w-full px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {investecSaving ? 'Connecting...' : 'Connect Account'}
                            </button>
                        </form>

                        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                                How to get your credentials:
                            </h3>
                            <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-decimal list-inside">
                                <li>Log in to Investec Online Banking</li>
                                <li>Navigate to Programmable Banking</li>
                                <li>Create a new API key or use an existing one</li>
                                <li>Copy the Client ID, Client Secret, and API Key</li>
                            </ol>
                        </div>
                    </>
                )}
                </div>
            </div>

            {/* Budget Preferences */}
            <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Budget Preferences</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    Day of month when your budget period starts. E.g., 22 = period runs 22nd to 21st (for payday on 20th).
                </p>
                {budgetPeriodLoading ? (
                    <p className="text-gray-600 dark:text-gray-400">Loading...</p>
                ) : (
                    <form onSubmit={handleBudgetPeriodSave} className="flex flex-col sm:flex-row gap-4 items-end">
                        <div>
                            <label htmlFor="budget-period-start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Budget period start day
                            </label>
                            <input
                                id="budget-period-start"
                                type="number"
                                min={1}
                                max={31}
                                value={budgetPeriodStartDay}
                                onChange={(e) => setBudgetPeriodStartDay(parseInt(e.target.value, 10) || 1)}
                                className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={budgetPeriodSaving}
                            className="px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {budgetPeriodSaving ? 'Saving...' : 'Save'}
                        </button>
                    </form>
                )}
                {budgetPeriodError && (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">{budgetPeriodError}</p>
                )}
                {budgetPeriodSuccess && (
                    <p className="mt-3 text-sm text-green-600 dark:text-green-400">{budgetPeriodSuccess}</p>
                )}
            </div>

            {/* Budget Categories */}
            <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Budget Categories</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    Manage your budget entries and view the transaction category reference used across the app.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Link
                        to="/budget"
                        className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <LayoutDashboard className="w-8 h-8 text-blue-600 dark:text-blue-400 shrink-0" />
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">Budget Dashboard</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Manage needs, wants, and savings categories</p>
                        </div>
                    </Link>
                    <Link
                        to="/category-guide"
                        className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <HelpCircle className="w-8 h-8 text-blue-600 dark:text-blue-400 shrink-0" />
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">Budget Category Guide</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Transaction category reference and examples</p>
                        </div>
                    </Link>
                </div>
            </div>

            {showDisconnectConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Disconnect Investec?
                            </h3>
                            <div className="text-gray-700 dark:text-gray-300 mb-6 space-y-2">
                                <p className="font-semibold text-red-600 dark:text-red-400">
                                    This will permanently delete ALL Investec data:
                                </p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                    <li>API credentials (Client ID, Secret, API Key)</li>
                                    <li>All bank accounts</li>
                                    <li>All transactions</li>
                                    <li>All categorization rules</li>
                                </ul>
                                <p className="mt-3 text-sm">
                                    This action cannot be undone.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleInvestecDisconnect}
                                    disabled={investecSaving}
                                    className="flex-1 px-4 py-2.5 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                >
                                    {investecSaving ? 'Disconnecting...' : 'Disconnect'}
                                </button>
                                <button
                                    onClick={() => setShowDisconnectConfirm(false)}
                                    disabled={investecSaving}
                                    className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    )
}
