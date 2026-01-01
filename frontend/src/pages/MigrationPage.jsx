import { useState } from 'react'
import { Database, AlertTriangle, CheckCircle, Loader } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function MigrationPage() {
    const { user } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)

    const handleMigration = async () => {
        if (!window.confirm('This will create your personal user_sheet record linking your account to your Google Sheet tab. This should only be done once. Continue?')) {
            return
        }

        setIsLoading(true)
        setError(null)
        setResult(null)

        try {
            const token = localStorage.getItem('token')
            const response = await fetch('/api/admin/migrate-user-sheet', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })

            const data = await response.json()

            if (response.ok) {
                setResult(data)
            } else {
                setError(data.detail || 'Migration failed')
            }
        } catch (err) {
            setError('Network error occurred during migration')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-2xl p-8 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center mb-6">
                    <Database className="w-8 h-8 text-orange-600 dark:text-orange-400 mr-4" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Sheet Migration</h1>
                </div>

                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-orange-200 dark:border-orange-700">
                        <div className="flex items-start">
                            <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400 mr-3 mt-1 flex-shrink-0" />
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    ⚠️ One-Time Migration Required
                                </h3>
                                <p className="text-gray-700 dark:text-gray-300 mb-4">
                                    The application has been updated to use per-user Google Sheets instead of a global sheet.
                                    This migration will create your personal user_sheet record to support the new architecture.
                                </p>
                                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
                                    <p className="text-sm text-orange-800 dark:text-orange-200">
                                        <strong>Important:</strong> This migration should only be run once per user. Running it multiple times is safe but unnecessary.
                                        The user_sheets table must already exist (created by Alembic migration). Make sure your Google Sheet tab has been renamed to match your user ID.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">What This Migration Does:</h3>
                        <div className="space-y-3">
                            <div className="flex items-start">
                                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Creates your user record</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Adds a record mapping your user ID to your personal sheet name (e.g., "user_1")</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Enables per-user sheets</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Links your account to your dedicated Google Sheet tab for ETF price management</p>
                                </div>
                            </div>
                            <div className="flex items-start">
                                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white">Assumes table exists</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">The user_sheets table must be created by Alembic migration before running this</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Before You Proceed:</h3>
                        <div className="space-y-3">
                            <div className="flex items-center">
                                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                                <p className="text-gray-700 dark:text-gray-300">
                                    Ensure the user_sheets table exists (created by Alembic migration)
                                </p>
                            </div>
                            <div className="flex items-center">
                                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                                <p className="text-gray-700 dark:text-gray-300">
                                    Rename your Google Sheet tab to match your user ID (e.g., "user_1")
                                </p>
                            </div>
                            <div className="flex items-center">
                                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                                <p className="text-gray-700 dark:text-gray-300">
                                    Verify GOOGLE_SHEET_NAME environment variable has been removed
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Migration Button */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    Ready to Migrate Your Account?
                                </h3>
                                <p className="text-gray-600 dark:text-gray-400">
                                    Click the button below to create your personal user_sheet record. This links your account to your dedicated Google Sheet tab.
                                </p>
                            </div>
                            <button
                                onClick={handleMigration}
                                disabled={isLoading}
                                className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center ${
                                    isLoading
                                        ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader className="w-5 h-5 mr-2 animate-spin" />
                                        Creating Record...
                                    </>
                                ) : (
                                    <>
                                        <Database className="w-5 h-5 mr-2" />
                                        Create My User Sheet Record
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Results */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
                            <div className="flex items-center">
                                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 mr-3" />
                                <div>
                                    <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
                                        Migration Failed
                                    </h3>
                                    <p className="text-red-800 dark:text-red-200">{error}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {result && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
                            <div className="flex items-center mb-4">
                                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 mr-3" />
                                <div>
                                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
                                        Migration Successful!
                                    </h3>
                                    <p className="text-green-800 dark:text-green-200 mt-1">
                                        {result.message}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-green-100 dark:bg-green-800/30 rounded-lg p-4">
                                <pre className="text-sm text-green-900 dark:text-green-100 font-mono">
                                    {JSON.stringify(result, null, 2)}
                                </pre>
                            </div>
                            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                                <p className="text-blue-800 dark:text-blue-200 text-sm">
                                    <strong>Next Steps:</strong> You can now safely remove this migration page from the codebase.
                                    Your account is now linked to your personal Google Sheet tab!
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default MigrationPage
