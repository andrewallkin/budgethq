import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Wallet, X, Edit2 } from 'lucide-react'
import axios from 'axios'
import ConfirmModal from '../components/ConfirmModal'
import BlurredValue from '../components/BlurredValue'
import { formatCurrency } from '../utils/numberFormatting'

const PORTFOLIO_CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP']

const portfolioCardHoverRingClasses =
    'border border-gray-200 dark:border-gray-600 shadow-sm hover:border-teal-400 dark:hover:border-teal-500 focus-within:border-teal-400 dark:focus-within:border-teal-500 transition-colors'

export default function InvestmentsLanding() {
    const [loading, setLoading] = useState(true)
    const [portfolios, setPortfolios] = useState([])
    const [newName, setNewName] = useState('')
    const [newCurrencyCode, setNewCurrencyCode] = useState('')
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState('')
    const [portfolioToDelete, setPortfolioToDelete] = useState(null)
    const [portfolioToEdit, setPortfolioToEdit] = useState(null)
    const [editName, setEditName] = useState('')
    const [editCurrencyCode, setEditCurrencyCode] = useState('ZAR')
    const [editSaving, setEditSaving] = useState(false)
    const [totalValueBaseCurrency, setTotalValueBaseCurrency] = useState(null)
    const [baseCurrencyDisplay, setBaseCurrencyDisplay] = useState('ZAR')
    const [fxSummary, setFxSummary] = useState(null)

    const fetchPortfolios = async () => {
        try {
            setLoading(true)
            const res = await axios.get('/api/investments')
            setPortfolios(res.data.portfolios || [])
            setTotalValueBaseCurrency(
                typeof res.data.total_value_base_currency === 'number' ? res.data.total_value_base_currency : null,
            )
            setBaseCurrencyDisplay(res.data.base_currency || 'ZAR')
            setFxSummary(res.data.fx || null)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load investments')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchPortfolios()
    }, [])

    const createPortfolio = async () => {
        if (!newName.trim() || !newCurrencyCode) return
        setCreating(true)
        setError('')
        try {
            await axios.post('/api/investments', {
                name: newName.trim(),
                currency_code: newCurrencyCode,
            })
            setNewName('')
            setNewCurrencyCode('')
            await fetchPortfolios()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create portfolio')
        } finally {
            setCreating(false)
        }
    }

    const deletePortfolio = async () => {
        if (!portfolioToDelete) return
        try {
            await axios.delete(`/api/investments/${portfolioToDelete.id}`, { params: { confirm: true } })
            setPortfolioToDelete(null)
            await fetchPortfolios()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete portfolio')
        }
    }

    const openEditPortfolio = (portfolio) => {
        setPortfolioToEdit(portfolio)
        setEditName(portfolio.name)
        setEditCurrencyCode(portfolio.currency_code || 'ZAR')
        setError('')
    }

    const saveEditPortfolio = async () => {
        if (!portfolioToEdit || !editName.trim()) return
        setEditSaving(true)
        setError('')
        try {
            const body = { name: editName.trim() }
            if (!portfolioToEdit.is_default_tfsa) {
                body.currency_code = editCurrencyCode
            }
            await axios.patch(`/api/investments/${portfolioToEdit.id}`, body)
            setPortfolioToEdit(null)
            await fetchPortfolios()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update portfolio')
        } finally {
            setEditSaving(false)
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading investments...</div>
    }

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 rounded-xl shadow-lg">
                <h1 className="text-3xl font-bold text-white">Investments</h1>
                <p className="text-emerald-100 mt-1">
                    Manage your TFSA and separate portfolios for other accounts, ETFs, and equities.
                </p>
                <div className="mt-5">
                    <h2 className="text-sm font-medium text-emerald-100 uppercase tracking-wide">
                        Total holdings ({baseCurrencyDisplay})
                    </h2>
                    {totalValueBaseCurrency != null ? (
                        <>
                            <BlurredValue>
                                <p className="mt-2 text-4xl font-bold text-white">
                                    {formatCurrency(totalValueBaseCurrency, {
                                        currency: baseCurrencyDisplay,
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </p>
                            </BlurredValue>
                            {fxSummary?.sheet_error ? (
                                <p className="mt-2 text-xs text-emerald-50/95 leading-snug">{fxSummary.sheet_error}</p>
                            ) : null}
                        </>
                    ) : (
                        <p className="mt-2 text-lg font-semibold text-white leading-snug">
                            {fxSummary?.aggregate_error ||
                                fxSummary?.sheet_error ||
                                'Configure the FX worksheet tab and share it with your service account to see an all‑accounts total.'}
                        </p>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-600">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Portfolio</h2>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Portfolio name (e.g. USD Account)"
                        className="lg:col-span-5 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <select
                        value={newCurrencyCode}
                        onChange={(e) => setNewCurrencyCode(e.target.value)}
                        aria-label="Portfolio currency"
                        className="lg:col-span-3 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="" disabled className="text-gray-500">
                            Select currency
                        </option>
                        {PORTFOLIO_CURRENCIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={createPortfolio}
                        disabled={creating || !newName.trim() || !newCurrencyCode}
                        className="lg:col-span-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus className="w-4 h-4" />
                        {creating ? 'Creating...' : 'Create Portfolio'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {portfolios.map((portfolio) => (
                    <div
                        key={portfolio.id}
                        className={`relative bg-white dark:bg-gray-800 p-5 rounded-xl ${portfolioCardHoverRingClasses}`}
                    >
                        <Link
                            to={`/investments/${portfolio.slug}`}
                            className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 dark:focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                            aria-label={`Open portfolio: ${portfolio.name}`}
                        >
                            <span className="sr-only">Open {portfolio.name}</span>
                        </Link>
                        <div className="relative z-10 flex flex-col gap-4 pointer-events-none">
                            <div className="flex items-start justify-between gap-3 pointer-events-none">
                                <div className="min-w-0 pointer-events-none">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{portfolio.name}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Sheet tab: {portfolio.sheet_name || 'Not set'}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        Currency: {portfolio.currency_code || 'ZAR'}
                                    </p>
                                </div>
                                <div className="flex items-center shrink-0 pointer-events-auto">
                                    <button
                                        type="button"
                                        onClick={() => openEditPortfolio(portfolio)}
                                        className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                        title="Rename / currency"
                                        aria-label={`Edit ${portfolio.name}`}
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    {!portfolio.is_default_tfsa && (
                                        <button
                                            type="button"
                                            onClick={() => setPortfolioToDelete(portfolio)}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                                            title="Delete portfolio"
                                            aria-label={`Delete ${portfolio.name}`}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 pointer-events-none">
                                <Wallet className="w-4 h-4" aria-hidden />
                                <BlurredValue>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(portfolio.total_value || 0, {
                                            currency: portfolio.currency_code || 'ZAR',
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        })}
                                    </span>
                                </BlurredValue>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {portfolioToEdit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 relative border border-gray-200 dark:border-gray-600">
                        <button
                            type="button"
                            onClick={() => setPortfolioToEdit(null)}
                            className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white pr-10">Edit portfolio</h3>
                        <div className="mt-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                                <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            {!portfolioToEdit.is_default_tfsa && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Currency
                                    </label>
                                    <select
                                        value={editCurrencyCode}
                                        onChange={(e) => setEditCurrencyCode(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        {PORTFOLIO_CURRENCIES.map((c) => (
                                            <option key={c} value={c}>
                                                {c}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex gap-2 justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={() => setPortfolioToEdit(null)}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={saveEditPortfolio}
                                    disabled={editSaving || !editName.trim()}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {editSaving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!portfolioToDelete}
                onClose={() => setPortfolioToDelete(null)}
                onConfirm={deletePortfolio}
                title="Delete Portfolio"
                message={portfolioToDelete ? `Delete ${portfolioToDelete.name}?` : ''}
                details={['This action cannot be undone.', 'Delete is only allowed when the portfolio has no holdings.']}
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />
        </div>
    )
}
