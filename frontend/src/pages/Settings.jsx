import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

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
        <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">⚙️ Settings</h1>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
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
                        <div className="flex gap-2">
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

                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Change Password</h2>

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

                <hr className="my-6 border-gray-200 dark:border-gray-700" />

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
        </div>
    )
}
