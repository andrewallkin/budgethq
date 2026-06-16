import { useState, useEffect, Fragment } from 'react'
import axios from 'axios'
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight, HelpCircle, Play, Layers } from 'lucide-react'
import { CATEGORIES, INCOME_CATEGORIES, EXPENSE_CATEGORIES, NEUTRAL_CATEGORIES, CATEGORY_LABELS } from '../utils/transactionCategories'
import BlurredValue from '../components/BlurredValue'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import HubBackLink from '../components/HubBackLink'
import { useAutoClearingMessage } from '../hooks/useAutoClearingMessage'

export default function CategorizationRules() {
    const [loading, setLoading] = useState(true)
    const [rules, setRules] = useState([])
    const [error, setError] = useState('')
    const [success, setSuccess] = useAutoClearingMessage(8000)

    const [newRule, setNewRule] = useState({
        pattern: '',
        category: '',
        priority: 10
    })

    const [editingRule, setEditingRule] = useState(null)
    const [showHelp, setShowHelp] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [showApplyModal, setShowApplyModal] = useState(false)
    const [applying, setApplying] = useState(false)
    const [applyResults, setApplyResults] = useState(null)
    const [runningRuleId, setRunningRuleId] = useState(null)
    const [applyMode, setApplyMode] = useState('uncategorized') // 'uncategorized' | 'all'
    const [applyPreview, setApplyPreview] = useState(null) // { uncategorized_count, conflicts }
    const [showConflictModal, setShowConflictModal] = useState(false)
    const [acceptedConflictIds, setAcceptedConflictIds] = useState(new Set())
    const [conflictOverrides, setConflictOverrides] = useState({}) // { [txnId]: category } user-edited target

    // Filter and group-by state
    const [categoryFilter, setCategoryFilter] = useState('')
    const [groupedByCategory, setGroupedByCategory] = useState(true)
    const [collapsedGroups, setCollapsedGroups] = useState(new Set())

    useEffect(() => {
        fetchRules()
    }, [])

    const fetchRules = async () => {
        try {
            const response = await axios.get('/api/investec/rules')
            setRules(response.data.sort((a, b) => b.priority - a.priority))
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load rules')
        } finally {
            setLoading(false)
        }
    }

    const handleCreateRule = async (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')

        try {
            await axios.post('/api/investec/rules', newRule)
            setSuccess('Rule created successfully')
            setNewRule({ pattern: '', category: '', priority: 10 })
            await fetchRules()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create rule')
        }
    }

    const handleUpdateRule = async (ruleId, updates) => {
        setError('')
        try {
            await axios.patch(`/api/investec/rules/${ruleId}`, updates)
            setSuccess('Rule updated successfully')
            setEditingRule(null)
            await fetchRules()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update rule')
        }
    }

    const handleSaveEditRule = async (e) => {
        e.preventDefault()
        if (!editingRule) return
        await handleUpdateRule(editingRule.id, {
            pattern: editingRule.pattern,
            category: editingRule.category,
            priority: editingRule.priority,
            is_active: editingRule.is_active
        })
    }

    const handleApplySingleRule = async (ruleId, e) => {
        e?.stopPropagation()
        setRunningRuleId(ruleId)
        setError('')
        try {
            const response = await axios.post(`/api/investec/rules/${ruleId}/apply-to-existing`)
            setSuccess(`Rule applied: ${response.data.categorized} transactions categorized`)
            await fetchRules()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to apply rule')
        } finally {
            setRunningRuleId(null)
        }
    }

    const handleToggleActive = async (ruleId, currentActive) => {
        await handleUpdateRule(ruleId, { is_active: !currentActive })
    }

    const handleDeleteRule = async (ruleId) => {
        try {
            await axios.delete(`/api/investec/rules/${ruleId}`)
            setSuccess('Rule deleted successfully')
            setDeleteConfirm(null)
            await fetchRules()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to delete rule')
        }
    }

    const handleApplyRules = async (acceptedIds = [], overrides = {}) => {
        setApplying(true)
        setError('')

        try {
            const payload = {}
            if (acceptedIds.length > 0) payload.accepted_conflict_ids = acceptedIds
            if (Object.keys(overrides).length > 0) payload.category_overrides = overrides
            const response = await axios.post('/api/investec/rules/apply-to-existing', payload)
            setShowApplyModal(false)
            setShowConflictModal(false)
            setApplyPreview(null)
            setAcceptedConflictIds(new Set())
            setConflictOverrides({})
            setApplyResults(response.data)
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to apply rules')
            setShowApplyModal(false)
            setShowConflictModal(false)
        } finally {
            setApplying(false)
        }
    }

    const handleApplyRulesToAll = async () => {
        setApplying(true)
        setError('')
        try {
            const response = await axios.get('/api/investec/rules/apply-to-existing/preview')
            setApplyPreview(response.data)
            setApplyMode('all')
            const hasConflicts = response.data.conflicts?.length > 0
            const hasUncategorized = (response.data.uncategorized_count ?? 0) > 0
            if (hasConflicts) {
                setAcceptedConflictIds(new Set())
                setShowConflictModal(true)
            } else if (hasUncategorized) {
                setShowApplyModal(true)
            } else {
                setSuccess('No transactions to categorize')
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load preview')
        } finally {
            setApplying(false)
        }
    }

    const toggleConflictAccept = (id) => {
        setAcceptedConflictIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // User edits the target category for a conflict; auto-accept that row
    const handleConflictOverride = (id, category) => {
        setConflictOverrides(prev => ({ ...prev, [id]: category }))
        setAcceptedConflictIds(prev => {
            const next = new Set(prev)
            next.add(id)
            return next
        })
    }

    const handleApplyFromConflictModal = () => {
        const accepted = []
        const overrides = {}
        acceptedConflictIds.forEach(id => {
            const conflict = applyPreview?.conflicts?.find(c => c.id === id)
            const override = conflictOverrides[id]
            // Override only matters when it differs from the rule's proposed category
            if (override !== undefined && override !== conflict?.proposed_category) {
                overrides[id] = override
            } else {
                accepted.push(id)
            }
        })
        handleApplyRules(accepted, overrides)
    }

    const toggleGroupByCategory = () => {
        setGroupedByCategory(prev => !prev)
    }

    const toggleGroupCollapse = (category) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev)
            if (next.has(category)) next.delete(category)
            else next.add(category)
            return next
        })
    }

    const filteredRules = rules.filter(r => !categoryFilter || r.category === categoryFilter)

    const getGroupedRules = () => {
        const groups = {}
        for (const rule of filteredRules) {
            const cat = rule.category || 'uncategorized'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(rule)
        }
        const orderedCats = CATEGORIES.filter(cat => groups[cat]?.length)
        const extraCats = Object.keys(groups).filter(cat => !CATEGORIES.includes(cat))
        return [...orderedCats, ...extraCats].map(cat => ({ category: cat, rules: groups[cat] }))
    }

    const renderRuleRow = (rule) => (
        <tr
            key={rule.id}
            onClick={() => setEditingRule({ ...rule })}
            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
        >
            <td className={`px-4 py-3 ${groupedByCategory ? 'pl-8' : ''}`}>
                <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-900 dark:text-white">
                    {rule.pattern}
                </code>
            </td>
            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                {CATEGORY_LABELS[rule.category] || rule.category}
            </td>
            <td className="px-4 py-3 text-center text-sm text-gray-900 dark:text-white">
                {rule.priority}
            </td>
            <td className="px-4 py-3 text-center text-sm text-gray-900 dark:text-white">
                {rule.usage_count || 0}
            </td>
            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        handleToggleActive(rule.id, rule.is_active)
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                        rule.is_active
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                >
                    {rule.is_active ? 'Active' : 'Inactive'}
                </button>
            </td>
            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-1">
                    <button
                        onClick={(e) => handleApplySingleRule(rule.id, e)}
                        disabled={runningRuleId === rule.id}
                        title="Apply this rule to existing transactions"
                        className="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors disabled:opacity-50"
                    >
                        <Play className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm(rule.id)
                        }}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </td>
        </tr>
    )

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-600 dark:text-gray-400">Loading rules...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <HubBackLink to="/investec" label="Investec Banking" />
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                    Categorization Rules
                </h1>
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

            {/* Create Rule Form */}
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Create New Rule
                </h2>

                <form onSubmit={handleCreateRule} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Pattern
                            </label>
                            <input
                                type="text"
                                value={newRule.pattern}
                                onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                                placeholder="e.g., UBER or SMW"
                                required
                                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Category
                            </label>
                            <select
                                value={newRule.category}
                                onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                                required
                                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="" disabled>Select a category...</option>
                                <optgroup label="Income">
                                    {INCOME_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat} style={{ color: '#16a34a' }}>
                                            {CATEGORY_LABELS[cat]}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Expenses">
                                    {EXPENSE_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat} style={{ color: '#dc2626' }}>
                                            {CATEGORY_LABELS[cat]}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="Neutral">
                                    {NEUTRAL_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat} style={{ color: '#6b7280' }}>
                                            {CATEGORY_LABELS[cat]}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Priority (0-100)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={newRule.priority}
                                onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value) || 0 })}
                                className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Create Rule
                    </button>
                </form>
            </div>

            {/* Apply Rules to Existing Transactions */}
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Apply Rules to Past Transactions
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Re-categorize transactions using your current active rules.
                    Already-categorized transactions that conflict with rules will be flagged for review.
                </p>
                <button
                    onClick={handleApplyRulesToAll}
                    disabled={applying}
                    className="px-4 py-2.5 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                    {applying ? 'Loading...' : 'Apply Rules'}
                </button>
            </div>

            {/* Help Section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button
                    onClick={() => setShowHelp(!showHelp)}
                    className="w-full px-4 sm:px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-medium text-gray-900 dark:text-white">
                            How do patterns work?
                        </span>
                    </div>
                    {showHelp ? (
                        <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    ) : (
                        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    )}
                </button>

                {showHelp && (
                    <div className="px-4 sm:px-6 pb-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                        <div>
                            <p className="font-medium mb-1">Simple substring matching:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">UBER</code> matches "UBER TRIP 12345"</li>
                                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">SMW</code> matches "SMW 0701 RONDEBOSCH"</li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-medium mb-1">Regex patterns (advanced):</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">UBER|BOLT</code> matches either "UBER" or "BOLT"</li>
                                <li><code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">^NETFLIX</code> matches "NETFLIX" at start of description</li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-medium mb-1">Priority:</p>
                            <p>Higher priority rules are checked first. Use priority to handle overlapping patterns.</p>
                        </div>

                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <p className="text-blue-900 dark:text-blue-200">
                                <strong>Tip:</strong> Matching is case-insensitive. Pattern "uber" will match "UBER" and "Uber".
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Rules Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center gap-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        Filter by category:
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="">All categories</option>
                            <optgroup label="Income">
                                {INCOME_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Expenses">
                                {EXPENSE_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Neutral">
                                {NEUTRAL_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                                ))}
                            </optgroup>
                        </select>
                    </label>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Pattern
                                </th>
                                <th
                                    onClick={toggleGroupByCategory}
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div className="flex items-center gap-1">
                                        Category
                                        {groupedByCategory ? (
                                            <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" title="Grouped by category (click to ungroup)" />
                                        ) : (
                                            <Layers className="w-3.5 h-3.5 opacity-40" title="Click to group by category" />
                                        )}
                                    </div>
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Priority
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Usage Count
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Active
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {groupedByCategory ? (
                                getGroupedRules().map(({ category, rules: groupRules }) => {
                                    const isCollapsed = collapsedGroups.has(category)
                                    return (
                                        <Fragment key={category}>
                                            <tr
                                                onClick={() => toggleGroupCollapse(category)}
                                                className="bg-gray-100 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                            >
                                                <td colSpan={6} className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        {isCollapsed ? (
                                                            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />
                                                        )}
                                                        <span className="font-medium text-gray-900 dark:text-white">
                                                            {CATEGORY_LABELS[category] || category}
                                                        </span>
                                                        <span className="text-sm text-gray-500 dark:text-gray-400">
                                                            ({groupRules.length} rule{groupRules.length !== 1 ? 's' : ''})
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                            {!isCollapsed && groupRules.map(rule => renderRuleRow(rule))}
                                        </Fragment>
                                    )
                                })
                            ) : (
                                filteredRules.map(rule => renderRuleRow(rule))
                            )}
                        </tbody>
                    </table>
                </div>

                {(rules.length === 0 || filteredRules.length === 0) && (
                    <div className="text-center py-12 text-gray-600 dark:text-gray-400">
                        {rules.length === 0
                            ? 'No rules created yet. Create your first rule above.'
                            : 'No rules match this filter. Try a different category.'}
                    </div>
                )}
            </div>

            {/* Edit Rule Modal */}
            {editingRule && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
                    onClick={() => setEditingRule(null)}
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Edit Rule
                        </h3>
                        <form onSubmit={handleSaveEditRule} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Pattern
                                </label>
                                <input
                                    type="text"
                                    value={editingRule.pattern}
                                    onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Category
                                </label>
                                <select
                                    value={editingRule.category}
                                    onChange={(e) => setEditingRule({ ...editingRule, category: e.target.value })}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <optgroup label="Income">
                                        {INCOME_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat} style={{ color: '#16a34a' }}>
                                                {CATEGORY_LABELS[cat]}
                                            </option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Expenses">
                                        {EXPENSE_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat} style={{ color: '#dc2626' }}>
                                                {CATEGORY_LABELS[cat]}
                                            </option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="Neutral">
                                        {NEUTRAL_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat} style={{ color: '#6b7280' }}>
                                                {CATEGORY_LABELS[cat]}
                                            </option>
                                        ))}
                                    </optgroup>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Priority (0-100)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={editingRule.priority}
                                    onChange={(e) => setEditingRule({ ...editingRule, priority: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="edit-rule-active"
                                    checked={editingRule.is_active ?? true}
                                    onChange={(e) => setEditingRule({ ...editingRule, is_active: e.target.checked })}
                                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="edit-rule-active" className="text-sm text-gray-700 dark:text-gray-300">
                                    Active
                                </label>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingRule(null)}
                                    className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Delete Rule?
                        </h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-6">
                            This will permanently delete this categorization rule. Existing categorizations will not be affected.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleDeleteRule(deleteConfirm)}
                                className="flex-1 px-4 py-2.5 min-h-[44px] bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Delete
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Apply Rules Confirmation Modal */}
            {showApplyModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            {applyMode === 'uncategorized' ? 'Apply Rules to Uncategorized?' : 'Apply Rules?'}
                        </h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-6">
                            {applyMode === 'uncategorized'
                                ? 'This will re-categorize uncategorized transactions using your current active rules. AI and manually categorized transactions will not be affected.'
                                : `This will apply rules to ${applyPreview?.uncategorized_count ?? 0} uncategorized transaction(s). No conflicts were found.`}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleApplyRules([])}
                                disabled={applying}
                                className="flex-1 px-4 py-2.5 min-h-[44px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {applying ? 'Applying...' : 'Apply Rules'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowApplyModal(false)
                                    setApplyPreview(null)
                                }}
                                disabled={applying}
                                className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Conflict Review Modal */}
            {showConflictModal && applyPreview?.conflicts?.length > 0 && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-4xl w-full my-8 max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Review Conflicts
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            These transactions are already categorized but would receive a different category from a rule.
                            Accept the rule's suggestion, edit it to a category of your choice, or leave it unchecked to skip.
                            Uncategorized transactions ({applyPreview.uncategorized_count}) will be auto-applied.
                        </p>
                        <div className="overflow-auto flex-1 min-h-0 border border-gray-200 dark:border-gray-600 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Description</th>
                                        <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Amount</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Date</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Current</th>
                                        <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Proposed</th>
                                        <th className="px-4 py-2 text-center font-medium text-gray-600 dark:text-gray-400">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {applyPreview.conflicts.map((c) => (
                                        <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                            <td className="px-4 py-2 text-gray-900 dark:text-white truncate max-w-[200px]" title={c.description}>
                                                {c.description}
                                            </td>
                                            <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                                                <BlurredValue>{formatCurrency(Math.abs(c.amount))}</BlurredValue>
                                            </td>
                                            <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                                                {formatDateSafe(c.transaction_date, { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700">
                                                    {CATEGORY_LABELS[c.current_category] || c.current_category || '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">
                                                <select
                                                    value={conflictOverrides[c.id] ?? c.proposed_category}
                                                    onChange={(e) => handleConflictOverride(c.id, e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="px-2 py-1 rounded text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                >
                                                    <option value="">Uncategorized</option>
                                                    <optgroup label="Income">
                                                        {INCOME_CATEGORIES.map(cat => (
                                                            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Expenses">
                                                        {EXPENSE_CATEGORIES.map(cat => (
                                                            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Neutral">
                                                        {NEUTRAL_CATEGORIES.map(cat => (
                                                            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                                {(conflictOverrides[c.id] !== undefined && conflictOverrides[c.id] !== c.proposed_category) && (
                                                    <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">edited</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <label className="flex items-center justify-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={acceptedConflictIds.has(c.id)}
                                                        onChange={() => toggleConflictAccept(c.id)}
                                                        className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">Accept</span>
                                                </label>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                            {acceptedConflictIds.size} of {applyPreview.conflicts.length} accepted. Will apply {applyPreview.uncategorized_count} uncategorized + {acceptedConflictIds.size} conflicts.
                        </p>
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={handleApplyFromConflictModal}
                                disabled={applying}
                                className="flex-1 px-4 py-2.5 min-h-[44px] bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {applying ? 'Applying...' : 'Apply Rules'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowConflictModal(false)
                                    setApplyPreview(null)
                                    setAcceptedConflictIds(new Set())
                                    setConflictOverrides({})
                                }}
                                disabled={applying}
                                className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Modal */}
            {applyResults && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Rules Applied Successfully
                        </h3>
                        <div className="space-y-2 mb-6">
                            <p className="text-gray-700 dark:text-gray-300">
                                <strong>Uncategorized processed:</strong> {applyResults.total}
                            </p>
                            <p className="text-green-600 dark:text-green-400">
                                <strong>Categorized:</strong> {applyResults.categorized}
                            </p>
                            <p className="text-gray-600 dark:text-gray-400">
                                <strong>Remaining uncategorized:</strong> {applyResults.uncategorized}
                            </p>
                            {applyResults.conflicts_resolved > 0 && (
                                <p className="text-indigo-600 dark:text-indigo-400">
                                    <strong>Conflicts resolved:</strong> {applyResults.conflicts_resolved}
                                </p>
                            )}
                            {applyResults.overrides_applied > 0 && (
                                <p className="text-amber-600 dark:text-amber-400">
                                    <strong>Edited categories applied:</strong> {applyResults.overrides_applied}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                setApplyResults(null)
                                fetchRules() // Refresh rules to show updated usage counts
                            }}
                            className="w-full px-4 py-2.5 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
