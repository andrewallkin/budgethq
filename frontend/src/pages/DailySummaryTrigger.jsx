import { useState } from 'react'
import axios from 'axios'
import { Calendar, CheckCircle, AlertCircle, Clock, Database } from 'lucide-react'

export default function DailySummaryTrigger() {
    const [selectedDate, setSelectedDate] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!selectedDate) {
            setError('Please select a date')
            return
        }

        setLoading(true)
        setError('')
        setResult(null)

        try {
            const response = await axios.post('/api/admin/trigger-daily-summary', {
                target_date: selectedDate
            })

            setResult(response.data)
        } catch (err) {
            if (err.response?.data?.detail) {
                setError(err.response.data.detail)
            } else {
                setError('An error occurred while triggering the daily summary')
            }
        } finally {
            setLoading(false)
        }
    }

    const getStatusIcon = (status) => {
        switch (status) {
            case 'success':
                return <CheckCircle className="w-6 h-6 text-green-500" />
            case 'no_data':
                return <AlertCircle className="w-6 h-6 text-yellow-500" />
            case 'already_exists':
                return <Clock className="w-6 h-6 text-blue-500" />
            default:
                return <AlertCircle className="w-6 h-6 text-gray-500" />
        }
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'success':
                return 'border-green-200 bg-green-50 dark:bg-green-900/20'
            case 'no_data':
                return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20'
            case 'already_exists':
                return 'border-blue-200 bg-blue-50 dark:bg-blue-900/20'
            default:
                return 'border-gray-200 bg-gray-50 dark:bg-gray-900/20'
        }
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Daily Summary Trigger</h1>
                <p className="text-gray-600 dark:text-gray-400">
                    Manually create daily portfolio summaries for specific dates. This tool helps backfill missing daily summaries from existing hourly snapshots.
                </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Select Date
                        </label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="date"
                                id="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-full"
                                required
                            />
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            Choose a date to create a daily summary. The system will check for existing hourly snapshots on this date.
                        </p>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-center">
                                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                                <span className="text-red-700 dark:text-red-400">{error}</span>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                Processing...
                            </>
                        ) : (
                            <>
                                <Database className="w-5 h-5 mr-2" />
                                Create Daily Summary
                            </>
                        )}
                    </button>
                </form>

                {result && (
                    <div className={`mt-6 p-6 border rounded-lg ${getStatusColor(result.status)}`}>
                        <div className="flex items-start">
                            {getStatusIcon(result.status)}
                            <div className="ml-3 flex-1">
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                                    {result.message}
                                </h3>

                                {result.status === 'success' && result.stats && (
                                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                        <p><strong>Summaries Created:</strong> {result.stats.summaries_created || 0}</p>
                                    </div>
                                )}

                                {result.snapshots_found !== undefined && (
                                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                        <p><strong>Hourly Snapshots Found:</strong> {result.snapshots_found}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How It Works</h3>
                <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                    <p>• <strong>Hourly snapshots</strong> are created automatically every hour containing your portfolio data</p>
                    <p>• <strong>Daily summaries</strong> are created once per day at 17:30 SAST from the hourly snapshots</p>
                    <p>• The <strong>6M and 1Y graphs</strong> use daily summaries to create weekly averages</p>
                    <p>• This tool helps <strong>backfill missing daily summaries</strong> for dates that have hourly data</p>
                </div>
            </div>
        </div>
    )
}
