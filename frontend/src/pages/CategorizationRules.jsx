import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
    AlertTriangle,
    Check,
    ChevronDown,
    ChevronRight,
    Edit2,
    Play,
    Plus,
    Search,
    Trash2,
    Sparkles,
} from 'lucide-react'
import {
    CATEGORIES,
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    NEUTRAL_CATEGORIES,
    CATEGORY_LABELS,
} from '../utils/transactionCategories'
import BlurredValue from '../components/BlurredValue'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import { BankingLoading, BankingPageHeader } from '../components/BankingNav'
import { useAutoClearingMessage } from '../hooks/useAutoClearingMessage'
import {
    PaperCard,
    PaperDialog,
    paperBtnDanger,
    paperBtnGhost,
    paperBtnPrimary,
    paperEyebrow,
    paperField,
    paperIconBtn,
    paperIconBtnDanger,
    paperSegment,
} from '../components/appUi'

const INCOME_SET = new Set(INCOME_CATEGORIES)
const EXPENSE_SET = new Set(EXPENSE_CATEGORIES)
const NEUTRAL_SET = new Set(NEUTRAL_CATEGORIES)

const KIND_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'income', label: 'Income' },
    { id: 'expense', label: 'Expenses' },
    { id: 'neutral', label: 'Neutral' },
]

function categoryKind(category) {
    if (INCOME_SET.has(category)) return 'income'
    if (EXPENSE_SET.has(category)) return 'expense'
    if (NEUTRAL_SET.has(category)) return 'neutral'
    return 'other'
}

function categoryLabel(category) {
    return CATEGORY_LABELS[category] || category || 'Uncategorized'
}

function CategoryOptions({ includeUncategorized = false }) {
    return (
        <>
            {includeUncategorized ? <option value="">Uncategorized</option> : null}
            <optgroup label="Income">
                {INCOME_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                    </option>
                ))}
            </optgroup>
            <optgroup label="Expenses">
                {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                    </option>
                ))}
            </optgroup>
            <optgroup label="Neutral">
                {NEUTRAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                    </option>
                ))}
            </optgroup>
        </>
    )
}

function SegmentButton({ pressed, children, onClick, ...props }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            className={[
                'inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/40',
                pressed
                    ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                    : 'text-[var(--paper-muted)] hover:bg-[var(--paper-card)] hover:text-[var(--paper-ink)]',
            ].join(' ')}
            {...props}
        >
            {children}
        </button>
    )
}

function ActiveSwitch({ active, onToggle, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={label}
            onClick={onToggle}
            className={[
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/40',
                active
                    ? 'border-[var(--paper-ink)] bg-[var(--paper-ink)]'
                    : 'border-[var(--paper-line)] bg-[var(--paper-canvas)]',
            ].join(' ')}
        >
            <span
                aria-hidden="true"
                className={[
                    'inline-block h-4 w-4 rounded-full transition-transform duration-200',
                    active
                        ? 'translate-x-6 bg-[var(--paper-card)]'
                        : 'translate-x-1 bg-[var(--paper-muted)]',
                ].join(' ')}
            />
        </button>
    )
}

function PatternHelp() {
    return (
        <div className="space-y-4 text-sm leading-relaxed text-[var(--paper-muted)]">
            <div>
                <p className="mb-1 font-medium text-[var(--paper-ink)]">Simple matching</p>
                <p>
                    <code className="rounded-md bg-[var(--paper-canvas)] px-1.5 py-0.5 font-mono text-[var(--paper-ink)]">UBER</code>
                    {' '}matches “UBER TRIP 12345”. Matching is case-insensitive.
                </p>
            </div>
            <div>
                <p className="mb-1 font-medium text-[var(--paper-ink)]">Regex</p>
                <p>
                    <code className="rounded-md bg-[var(--paper-canvas)] px-1.5 py-0.5 font-mono text-[var(--paper-ink)]">UBER|BOLT</code>
                    {' '}matches either merchant.{' '}
                    <code className="rounded-md bg-[var(--paper-canvas)] px-1.5 py-0.5 font-mono text-[var(--paper-ink)]">^NETFLIX</code>
                    {' '}matches only at the start of the description.
                </p>
            </div>
            <p>
                <span className="font-medium text-[var(--paper-ink)]">Priority</span>
                {' '}— higher numbers win when two patterns could apply to the same transaction.
            </p>
        </div>
    )
}

export default function CategorizationRules() {
    const [loading, setLoading] = useState(true)
    const [rules, setRules] = useState([])
    const [error, setError] = useState('')
    const [success, setSuccess] = useAutoClearingMessage(8000)
    const [creating, setCreating] = useState(false)

    const [newRule, setNewRule] = useState({
        pattern: '',
        category: '',
        priority: 10,
    })
    const [formError, setFormError] = useState('')

    const [editingRule, setEditingRule] = useState(null)
    const [showHelp, setShowHelp] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [showApplyModal, setShowApplyModal] = useState(false)
    const [applying, setApplying] = useState(false)
    const [applyResults, setApplyResults] = useState(null)
    const [runningRuleId, setRunningRuleId] = useState(null)
    const [applyMode, setApplyMode] = useState('uncategorized')
    const [applyPreview, setApplyPreview] = useState(null)
    const [showConflictModal, setShowConflictModal] = useState(false)
    const [acceptedConflictIds, setAcceptedConflictIds] = useState(new Set())
    const [conflictOverrides, setConflictOverrides] = useState({})

    const [searchQuery, setSearchQuery] = useState('')
    const [kindFilter, setKindFilter] = useState('all')
    const [groupedByCategory, setGroupedByCategory] = useState(true)
    const [collapsedGroups, setCollapsedGroups] = useState(new Set())

    const patternInputRef = useRef(null)
    const errorRef = useRef(null)

    useEffect(() => {
        fetchRules()
    }, [])

    useEffect(() => {
        if (error && errorRef.current) {
            errorRef.current.focus()
        }
    }, [error])

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
        setFormError('')

        if (!newRule.pattern.trim()) {
            setFormError('Enter a pattern to match on descriptions.')
            patternInputRef.current?.focus()
            return
        }
        if (!newRule.category) {
            setFormError('Choose a category for matching transactions.')
            return
        }

        setCreating(true)
        try {
            await axios.post('/api/investec/rules', newRule)
            setSuccess('Rule created')
            setNewRule({ pattern: '', category: '', priority: 10 })
            await fetchRules()
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create rule')
        } finally {
            setCreating(false)
        }
    }

    const handleUpdateRule = async (ruleId, updates) => {
        setError('')
        try {
            await axios.patch(`/api/investec/rules/${ruleId}`, updates)
            setSuccess('Rule updated')
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
            is_active: editingRule.is_active,
        })
    }

    const handleApplySingleRule = async (ruleId) => {
        setRunningRuleId(ruleId)
        setError('')
        try {
            const response = await axios.post(`/api/investec/rules/${ruleId}/apply-to-existing`)
            setSuccess(`Applied to ${response.data.categorized} transactions`)
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
            setSuccess('Rule deleted')
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
                setSuccess('Nothing left to categorize')
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load preview')
        } finally {
            setApplying(false)
        }
    }

    const toggleConflictAccept = (id) => {
        setAcceptedConflictIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleConflictOverride = (id, category) => {
        setConflictOverrides((prev) => ({ ...prev, [id]: category }))
        setAcceptedConflictIds((prev) => {
            const next = new Set(prev)
            next.add(id)
            return next
        })
    }

    const handleApplyFromConflictModal = () => {
        const accepted = []
        const overrides = {}
        acceptedConflictIds.forEach((id) => {
            const conflict = applyPreview?.conflicts?.find((c) => c.id === id)
            const override = conflictOverrides[id]
            if (override !== undefined && override !== conflict?.proposed_category) {
                overrides[id] = override
            } else {
                accepted.push(id)
            }
        })
        handleApplyRules(accepted, overrides)
    }

    const toggleGroupCollapse = (category) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev)
            if (next.has(category)) next.delete(category)
            else next.add(category)
            return next
        })
    }

    const focusComposer = () => {
        patternInputRef.current?.focus()
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        patternInputRef.current?.scrollIntoView({
            behavior: reduceMotion ? 'auto' : 'smooth',
            block: 'center',
        })
    }

    const stats = useMemo(() => {
        const active = rules.filter((r) => r.is_active).length
        const matches = rules.reduce((sum, r) => sum + (r.usage_count || 0), 0)
        return {
            total: rules.length,
            active,
            inactive: rules.length - active,
            matches,
        }
    }, [rules])

    const filteredRules = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        return rules.filter((rule) => {
            if (kindFilter !== 'all' && categoryKind(rule.category) !== kindFilter) return false
            if (!q) return true
            const label = categoryLabel(rule.category).toLowerCase()
            return rule.pattern.toLowerCase().includes(q) || label.includes(q)
        })
    }, [rules, searchQuery, kindFilter])

    const groupedRules = useMemo(() => {
        const groups = {}
        for (const rule of filteredRules) {
            const cat = rule.category || 'uncategorized'
            if (!groups[cat]) groups[cat] = []
            groups[cat].push(rule)
        }
        const orderedCats = CATEGORIES.filter((cat) => groups[cat]?.length)
        const extraCats = Object.keys(groups).filter((cat) => !CATEGORIES.includes(cat))
        return [...orderedCats, ...extraCats].map((cat) => ({ category: cat, rules: groups[cat] }))
    }, [filteredRules])

    const renderRule = (rule) => {
        const usage = rule.usage_count || 0
        return (
            <article
                key={rule.id}
                className={`flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${
                    rule.is_active ? '' : 'opacity-70'
                }`}
            >
                <div className="min-w-0 flex-1">
                    <code className="block truncate font-mono text-[15px] text-[var(--paper-ink)]" title={rule.pattern}>
                        {rule.pattern}
                    </code>
                    <p className="mt-1 text-sm text-[var(--paper-muted)]">
                        {categoryLabel(rule.category)}
                        <span aria-hidden="true"> · </span>
                        Priority {rule.priority}
                        <span aria-hidden="true"> · </span>
                        {usage === 0 ? 'Not used yet' : `Used ${usage} time${usage === 1 ? '' : 's'}`}
                    </p>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <ActiveSwitch
                        active={Boolean(rule.is_active)}
                        onToggle={() => handleToggleActive(rule.id, rule.is_active)}
                        label={rule.is_active ? `Deactivate ${rule.pattern}` : `Activate ${rule.pattern}`}
                    />
                    <div className="flex items-center">
                        <button
                            type="button"
                            onClick={() => handleApplySingleRule(rule.id)}
                            disabled={runningRuleId === rule.id}
                            aria-label={`Apply ${rule.pattern} to existing transactions`}
                            className={paperIconBtn}
                        >
                            <Play className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditingRule({ ...rule })}
                            aria-label={`Edit ${rule.pattern}`}
                            className={paperIconBtn}
                        >
                            <Edit2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setDeleteConfirm(rule)}
                            aria-label={`Delete ${rule.pattern}`}
                            className={paperIconBtnDanger}
                        >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </article>
        )
    }

    if (loading) {
        return <BankingLoading title="Rules" message="Loading rules…" />
    }

    const hasRules = rules.length > 0
    const hasMatches = filteredRules.length > 0

    return (
        <div className="mx-auto max-w-[1080px] space-y-6">
            <BankingPageHeader
                title="Rules"
                description="Teach banking how to categorize merchants. Patterns match transaction descriptions; higher priority wins when they overlap."
                actions={
                    <>
                        <button type="button" onClick={focusComposer} className={paperBtnGhost}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            New rule
                        </button>
                        <button
                            type="button"
                            onClick={handleApplyRulesToAll}
                            disabled={applying || !hasRules}
                            className={paperBtnPrimary}
                        >
                            <Sparkles className="h-4 w-4" aria-hidden="true" />
                            {applying ? 'Checking…' : 'Apply to past'}
                        </button>
                    </>
                }
            />

            {error ? (
                <div ref={errorRef} tabIndex={-1} className="outline-none">
                    <PaperCard role="alert" className="flex items-start gap-2 p-4 text-[var(--paper-brick)]">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <div>
                            <p className="font-medium text-[var(--paper-ink)]">There is a problem</p>
                            <p className="mt-0.5 text-sm">{error}</p>
                        </div>
                    </PaperCard>
                </div>
            ) : null}

            {success ? (
                <PaperCard className="flex items-center gap-2 p-4 text-[var(--paper-olive)]" role="status">
                    <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{success}</span>
                </PaperCard>
            ) : null}

            {hasRules ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                        { label: 'Rules', value: stats.total },
                        { label: 'Active', value: stats.active },
                        { label: 'Paused', value: stats.inactive },
                        { label: 'Times used', value: stats.matches },
                    ].map((item) => (
                        <PaperCard key={item.label} className="px-4 py-3">
                            <p className={paperEyebrow}>{item.label}</p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-[var(--paper-ink)]">
                                {item.value}
                            </p>
                        </PaperCard>
                    ))}
                </div>
            ) : null}

            <PaperCard className="p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className={paperEyebrow}>New rule</p>
                        <p className="mt-1 text-sm text-[var(--paper-muted)]">
                            If a description contains this pattern, assign that category.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowHelp((open) => !open)}
                        aria-expanded={showHelp}
                        className={`${paperBtnGhost} shrink-0 px-3 py-1.5 text-xs`}
                    >
                        How matching works
                    </button>
                </div>

                {showHelp ? (
                    <div className="mt-4 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)]/60 p-4">
                        <PatternHelp />
                    </div>
                ) : null}

                <form onSubmit={handleCreateRule} className="mt-5">
                    {formError ? (
                        <p id="rule-form-error" className="mb-3 text-sm text-[var(--paper-brick)]">
                            {formError}
                        </p>
                    ) : null}
                    <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_auto]">
                        <label htmlFor="new-rule-pattern" className={`${paperEyebrow} lg:col-start-1 lg:row-start-1`}>
                            Pattern
                        </label>
                        <input
                            id="new-rule-pattern"
                            ref={patternInputRef}
                            type="text"
                            value={newRule.pattern}
                            onChange={(e) => {
                                setFormError('')
                                setNewRule({ ...newRule, pattern: e.target.value })
                            }}
                            placeholder="UBER, SMW, NETFLIX…"
                            autoComplete="off"
                            aria-describedby={formError ? 'rule-form-error' : 'new-rule-hint'}
                            className={`${paperField} h-10 font-mono lg:col-start-1 lg:row-start-2`}
                        />

                        <label htmlFor="new-rule-category" className={`${paperEyebrow} mt-2.5 lg:col-start-2 lg:row-start-1 lg:mt-0`}>
                            Category
                        </label>
                        <select
                            id="new-rule-category"
                            value={newRule.category}
                            onChange={(e) => {
                                setFormError('')
                                setNewRule({ ...newRule, category: e.target.value })
                            }}
                            className={`${paperField} h-10 lg:col-start-2 lg:row-start-2`}
                        >
                            <option value="">Choose…</option>
                            <CategoryOptions />
                        </select>

                        <label htmlFor="new-rule-priority" className={`${paperEyebrow} mt-2.5 lg:col-start-3 lg:row-start-1 lg:mt-0`}>
                            Priority
                        </label>
                        <input
                            id="new-rule-priority"
                            type="number"
                            min="0"
                            max="100"
                            value={newRule.priority}
                            onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value, 10) || 0 })}
                            className={`${paperField} h-10 lg:col-start-3 lg:row-start-2`}
                        />

                        <button
                            type="submit"
                            disabled={creating}
                            className={`${paperBtnPrimary} mt-2 h-10 w-full lg:col-start-4 lg:row-start-2 lg:mt-0 lg:w-auto`}
                        >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            {creating ? 'Adding…' : 'Add'}
                        </button>

                        <p
                            id="new-rule-hint"
                            className="text-xs leading-5 text-[var(--paper-muted)] lg:col-span-3 lg:row-start-3"
                        >
                            Case-insensitive. Use | for either/or.
                        </p>
                    </div>
                </form>
            </PaperCard>

            <PaperCard className="overflow-hidden">
                {hasRules ? (
                    <div className="flex flex-col gap-4 border-b border-[var(--paper-line)] p-4 sm:p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <p className={paperEyebrow}>
                                {hasMatches
                                    ? `${filteredRules.length} rule${filteredRules.length === 1 ? '' : 's'}`
                                    : 'Your rules'}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className={paperSegment} role="group" aria-label="Filter by type">
                                    {KIND_FILTERS.map((kind) => (
                                        <SegmentButton
                                            key={kind.id}
                                            pressed={kindFilter === kind.id}
                                            onClick={() => setKindFilter(kind.id)}
                                        >
                                            {kind.label}
                                        </SegmentButton>
                                    ))}
                                </div>
                                <div className={paperSegment} role="group" aria-label="List layout">
                                    <SegmentButton
                                        pressed={groupedByCategory}
                                        onClick={() => setGroupedByCategory(true)}
                                    >
                                        Grouped
                                    </SegmentButton>
                                    <SegmentButton
                                        pressed={!groupedByCategory}
                                        onClick={() => setGroupedByCategory(false)}
                                    >
                                        List
                                    </SegmentButton>
                                </div>
                            </div>
                        </div>
                        <div className="relative">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-muted)]"
                                aria-hidden="true"
                            />
                            <label htmlFor="rules-search" className="sr-only">
                                Search rules
                            </label>
                            <input
                                id="rules-search"
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search patterns or categories"
                                className={`${paperField} pl-9`}
                            />
                        </div>
                    </div>
                ) : null}

                {!hasRules ? (
                    <div className="px-5 py-14 text-center">
                        <p className="text-base font-medium text-[var(--paper-ink)]">No rules yet</p>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--paper-muted)]">
                            Add a pattern such as UBER for Transport. New transactions will pick it up automatically; use Apply to past for history.
                        </p>
                        <button type="button" onClick={focusComposer} className={`${paperBtnPrimary} mt-5`}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Create a rule
                        </button>
                    </div>
                ) : !hasMatches ? (
                    <div className="px-5 py-12 text-center">
                        <p className="text-base font-medium text-[var(--paper-ink)]">Nothing matches</p>
                        <p className="mt-2 text-sm text-[var(--paper-muted)]">
                            {searchQuery.trim()
                                ? `No rules for “${searchQuery.trim()}”. Try another search or clear filters.`
                                : 'No rules in this type. Try All.'}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('')
                                setKindFilter('all')
                            }}
                            className={`${paperBtnGhost} mt-4`}
                        >
                            Clear filters
                        </button>
                    </div>
                ) : groupedByCategory ? (
                    <div className="divide-y divide-[var(--paper-line)]">
                        {groupedRules.map(({ category, rules: groupRules }) => {
                            const isCollapsed = collapsedGroups.has(category)
                            return (
                                <section key={category}>
                                    <button
                                        type="button"
                                        onClick={() => toggleGroupCollapse(category)}
                                        aria-expanded={!isCollapsed}
                                        className="flex w-full cursor-pointer items-center gap-2 bg-[var(--paper-canvas)]/50 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--paper-canvas)] sm:px-5"
                                    >
                                        {isCollapsed ? (
                                            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
                                        )}
                                        <span className="font-medium text-[var(--paper-ink)]">{categoryLabel(category)}</span>
                                        <span className="text-xs tabular-nums text-[var(--paper-muted)]">
                                            {groupRules.length}
                                        </span>
                                    </button>
                                    {!isCollapsed ? (
                                        <div className="divide-y divide-[var(--paper-line)]">
                                            {groupRules.map(renderRule)}
                                        </div>
                                    ) : null}
                                </section>
                            )
                        })}
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--paper-line)]">{filteredRules.map(renderRule)}</div>
                )}
            </PaperCard>

            <PaperDialog
                open={Boolean(editingRule)}
                onClose={() => setEditingRule(null)}
                title="Edit rule"
                footer={
                    <>
                        <button type="button" onClick={() => setEditingRule(null)} className={paperBtnGhost}>
                            Cancel
                        </button>
                        <button type="submit" form="edit-rule-form" className={paperBtnPrimary}>
                            Save
                        </button>
                    </>
                }
            >
                {editingRule ? (
                    <form id="edit-rule-form" onSubmit={handleSaveEditRule} className="space-y-4">
                        <div>
                            <label htmlFor="edit-rule-pattern" className={`${paperEyebrow} mb-1.5 block`}>
                                Pattern
                            </label>
                            <input
                                id="edit-rule-pattern"
                                type="text"
                                value={editingRule.pattern}
                                onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                                required
                                className={`${paperField} font-mono`}
                            />
                        </div>
                        <div>
                            <label htmlFor="edit-rule-category" className={`${paperEyebrow} mb-1.5 block`}>
                                Category
                            </label>
                            <select
                                id="edit-rule-category"
                                value={editingRule.category}
                                onChange={(e) => setEditingRule({ ...editingRule, category: e.target.value })}
                                required
                                className={paperField}
                            >
                                <CategoryOptions />
                            </select>
                        </div>
                        <div>
                            <label htmlFor="edit-rule-priority" className={`${paperEyebrow} mb-1.5 block`}>
                                Priority (0–100)
                            </label>
                            <input
                                id="edit-rule-priority"
                                type="number"
                                min="0"
                                max="100"
                                value={editingRule.priority}
                                onChange={(e) =>
                                    setEditingRule({ ...editingRule, priority: parseInt(e.target.value, 10) || 0 })
                                }
                                className={paperField}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--paper-line)] px-3 py-2.5">
                            <p className="text-sm text-[var(--paper-ink)]">Active</p>
                            <ActiveSwitch
                                active={editingRule.is_active ?? true}
                                onToggle={() =>
                                    setEditingRule({ ...editingRule, is_active: !(editingRule.is_active ?? true) })
                                }
                                label="Rule is active"
                            />
                        </div>
                    </form>
                ) : null}
            </PaperDialog>

            <PaperDialog
                open={Boolean(deleteConfirm)}
                onClose={() => setDeleteConfirm(null)}
                title="Delete this rule?"
                description="Existing categorizations stay as they are. Only future matching will change."
                footer={
                    <>
                        <button type="button" onClick={() => setDeleteConfirm(null)} className={paperBtnGhost}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => handleDeleteRule(deleteConfirm.id)}
                            className={paperBtnDanger}
                        >
                            Delete
                        </button>
                    </>
                }
            >
                {deleteConfirm ? (
                    <p className="font-mono text-sm text-[var(--paper-ink)]">{deleteConfirm.pattern}</p>
                ) : null}
            </PaperDialog>

            <PaperDialog
                open={showApplyModal}
                onClose={() => {
                    if (applying) return
                    setShowApplyModal(false)
                    setApplyPreview(null)
                }}
                disableClose={applying}
                title={applyMode === 'uncategorized' ? 'Apply to uncategorized?' : 'Apply rules?'}
                description={
                    applyMode === 'uncategorized'
                        ? 'Active rules will categorize unmatched transactions. AI and manual categories stay put.'
                        : `This will apply rules to ${applyPreview?.uncategorized_count ?? 0} uncategorized transaction(s). No conflicts were found.`
                }
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setShowApplyModal(false)
                                setApplyPreview(null)
                            }}
                            disabled={applying}
                            className={paperBtnGhost}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => handleApplyRules([])}
                            disabled={applying}
                            className={paperBtnPrimary}
                        >
                            {applying ? 'Applying…' : 'Apply'}
                        </button>
                    </>
                }
            />

            <PaperDialog
                open={showConflictModal && Boolean(applyPreview?.conflicts?.length)}
                onClose={() => {
                    if (applying) return
                    setShowConflictModal(false)
                    setApplyPreview(null)
                    setAcceptedConflictIds(new Set())
                    setConflictOverrides({})
                }}
                disableClose={applying}
                title="Review conflicts"
                description={`${applyPreview?.uncategorized_count ?? 0} uncategorized will apply automatically. Accept a rule suggestion, change the category, or skip the row.`}
                maxWidth="max-w-3xl"
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setShowConflictModal(false)
                                setApplyPreview(null)
                                setAcceptedConflictIds(new Set())
                                setConflictOverrides({})
                            }}
                            disabled={applying}
                            className={paperBtnGhost}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleApplyFromConflictModal}
                            disabled={applying}
                            className={paperBtnPrimary}
                        >
                            {applying
                                ? 'Applying…'
                                : `Apply (${(applyPreview?.uncategorized_count ?? 0) + acceptedConflictIds.size})`}
                        </button>
                    </>
                }
            >
                <div className="space-y-3">
                    {(applyPreview?.conflicts || []).map((c) => {
                        const accepted = acceptedConflictIds.has(c.id)
                        const edited =
                            conflictOverrides[c.id] !== undefined &&
                            conflictOverrides[c.id] !== c.proposed_category
                        return (
                            <div
                                key={c.id}
                                className="rounded-md border border-[var(--paper-line)] p-4"
                            >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                                    <p className="min-w-0 truncate font-medium text-[var(--paper-ink)]" title={c.description}>
                                        {c.description}
                                    </p>
                                    <p className="shrink-0 text-sm tabular-nums text-[var(--paper-ink)]">
                                        <BlurredValue>{formatCurrency(Math.abs(c.amount))}</BlurredValue>
                                        <span className="text-[var(--paper-muted)]">
                                            {' · '}
                                            {formatDateSafe(c.transaction_date, {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            })}
                                        </span>
                                    </p>
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                                    <div>
                                        <p className={`${paperEyebrow} mb-1.5`}>Current</p>
                                        <p className="text-sm text-[var(--paper-ink)]">
                                            {categoryLabel(c.current_category) || '—'}
                                        </p>
                                    </div>
                                    <div>
                                        <label htmlFor={`conflict-cat-${c.id}`} className={`${paperEyebrow} mb-1.5 block`}>
                                            Proposed{edited ? ' (edited)' : ''}
                                        </label>
                                        <select
                                            id={`conflict-cat-${c.id}`}
                                            value={conflictOverrides[c.id] ?? c.proposed_category}
                                            onChange={(e) => handleConflictOverride(c.id, e.target.value)}
                                            className={paperField}
                                        >
                                            <CategoryOptions includeUncategorized />
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        aria-pressed={accepted}
                                        onClick={() => toggleConflictAccept(c.id)}
                                        className={accepted ? paperBtnPrimary : paperBtnGhost}
                                    >
                                        {accepted ? 'Accepted' : 'Accept'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </PaperDialog>

            <PaperDialog
                open={Boolean(applyResults)}
                onClose={() => {
                    setApplyResults(null)
                    fetchRules()
                }}
                title="Rules applied"
                footer={
                    <button
                        type="button"
                        onClick={() => {
                            setApplyResults(null)
                            fetchRules()
                        }}
                        className={paperBtnPrimary}
                    >
                        Done
                    </button>
                }
            >
                {applyResults ? (
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between gap-4">
                            <dt className="text-[var(--paper-muted)]">Processed</dt>
                            <dd className="tabular-nums text-[var(--paper-ink)]">{applyResults.total}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-[var(--paper-muted)]">Categorized</dt>
                            <dd className="tabular-nums text-[var(--paper-olive)]">{applyResults.categorized}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-[var(--paper-muted)]">Still uncategorized</dt>
                            <dd className="tabular-nums text-[var(--paper-ink)]">{applyResults.uncategorized}</dd>
                        </div>
                        {applyResults.conflicts_resolved > 0 ? (
                            <div className="flex justify-between gap-4">
                                <dt className="text-[var(--paper-muted)]">Conflicts resolved</dt>
                                <dd className="tabular-nums text-[var(--paper-ink)]">{applyResults.conflicts_resolved}</dd>
                            </div>
                        ) : null}
                        {applyResults.overrides_applied > 0 ? (
                            <div className="flex justify-between gap-4">
                                <dt className="text-[var(--paper-muted)]">Edited categories</dt>
                                <dd className="tabular-nums text-[var(--paper-ink)]">{applyResults.overrides_applied}</dd>
                            </div>
                        ) : null}
                    </dl>
                ) : null}
            </PaperDialog>
        </div>
    )
}
