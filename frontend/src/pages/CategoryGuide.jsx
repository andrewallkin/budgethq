import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
    PaperCard,
    paperEyebrow,
    paperField,
    paperSegment,
    paperTitle,
} from '../components/appUi'
import {
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    NEUTRAL_CATEGORIES,
    BUDGET_TRANSACTION_CATEGORIES,
    CATEGORY_LABELS,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_EXAMPLES,
} from '../utils/transactionCategories'

const BUDGET_SET = new Set(BUDGET_TRANSACTION_CATEGORIES)

const KIND_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'income', label: 'Income' },
    { id: 'expense', label: 'Expenses' },
    { id: 'neutral', label: 'Neutral' },
]

const KIND_META = {
    income: {
        label: 'Income',
        hint: 'Money in. Reimbursements offset spend; they are not earnings.',
        chip: 'bg-[var(--paper-olive)]/12 text-[var(--paper-olive)]',
    },
    expense: {
        label: 'Expenses',
        hint: 'Everyday spend. Budget line items usually map here.',
        chip: 'bg-[var(--paper-accent)]/12 text-[var(--paper-accent)]',
    },
    neutral: {
        label: 'Neutral',
        hint: 'Moves that should not look like income or new spend.',
        chip: 'bg-[var(--paper-canvas)] text-[var(--paper-muted)]',
    },
}

function kindFor(cat) {
    if (INCOME_CATEGORIES.includes(cat)) return 'income'
    if (EXPENSE_CATEGORIES.includes(cat)) return 'expense'
    return 'neutral'
}

function categoryNote(cat, showInvestecNav) {
    if (cat === 'reimbursements' && showInvestecNav) {
        return 'Not earnings. Link to the expense you fronted to reduce that category’s spend.'
    }
    if (cat === 'transfers') {
        return showInvestecNav
            ? 'Moving money between your own accounts does not change Budget Analysis totals.'
            : 'Moving money between your own accounts does not change budget totals.'
    }
    if (cat === 'refund' && showInvestecNav) {
        return 'Not earnings. Link to the original debit, or leave unlinked for envelope headroom.'
    }
    if (cat === 'uncategorized' && showInvestecNav) {
        return 'Uncategorized transactions sit in Analysis until a rule or manual category is set.'
    }
    return null
}

function matchesQuery(cat, query) {
    if (!query) return true
    const haystack = [
        cat,
        CATEGORY_LABELS[cat],
        CATEGORY_DESCRIPTIONS[cat],
        CATEGORY_EXAMPLES[cat],
        KIND_META[kindFor(cat)].label,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    return haystack.includes(query)
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

function JumpLink({ to, children }) {
    return (
        <Link
            to={to}
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--paper-muted)] transition-colors duration-200 hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/20"
        >
            {children}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
    )
}

function CategoryCard({ cat, showInvestecNav }) {
    const kind = kindFor(cat)
    const note = categoryNote(cat, showInvestecNav)
    const onBudget = BUDGET_SET.has(cat)
    const examples = CATEGORY_EXAMPLES[cat]
    const exampleText = examples && examples !== '—' ? examples : null

    return (
        <article className="flex h-full flex-col rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] p-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${KIND_META[kind].chip}`}>
                    {KIND_META[kind].label}
                </span>
                {onBudget ? (
                    <span className="rounded-md bg-[var(--paper-canvas)] px-2 py-0.5 text-xs font-medium text-[var(--paper-muted)]">
                        Budget line
                    </span>
                ) : null}
            </div>
            <h3 className="mt-3 text-base font-semibold text-[var(--paper-ink)]">
                {CATEGORY_LABELS[cat]}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--paper-muted)]">
                {CATEGORY_DESCRIPTIONS[cat]}
            </p>
            {exampleText ? (
                <p className="mt-2 text-xs leading-relaxed text-[var(--paper-muted)]">
                    e.g. {exampleText}
                </p>
            ) : null}
            {note ? (
                <p className="mt-3 border-t border-[var(--paper-line)] pt-3 text-xs leading-relaxed text-[var(--paper-ink)]">
                    {note}
                </p>
            ) : null}
        </article>
    )
}

function CategoryGroup({ title, hint, cats, showInvestecNav }) {
    if (!cats.length) return null
    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h2 className="text-lg font-semibold text-[var(--paper-ink)]">{title}</h2>
                    {hint ? <p className={`mt-0.5 ${paperEyebrow}`}>{hint}</p> : null}
                </div>
                <p className="text-xs text-[var(--paper-muted)]">{cats.length}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {cats.map((cat) => (
                    <CategoryCard key={cat} cat={cat} showInvestecNav={showInvestecNav} />
                ))}
            </div>
        </section>
    )
}

export default function CategoryGuide() {
    const { showInvestecNav } = useAuth()
    const [query, setQuery] = useState('')
    const [kindFilter, setKindFilter] = useState('all')
    const deferredQuery = useDeferredValue(query.trim().toLowerCase())

    const groups = useMemo(() => {
        const keep = (cat) => matchesQuery(cat, deferredQuery)
        return {
            income: INCOME_CATEGORIES.filter(keep),
            expense: EXPENSE_CATEGORIES.filter(keep),
            neutral: [...NEUTRAL_CATEGORIES, 'uncategorized'].filter(keep),
        }
    }, [deferredQuery])

    const visible = {
        income: kindFilter === 'all' || kindFilter === 'income' ? groups.income : [],
        expense: kindFilter === 'all' || kindFilter === 'expense' ? groups.expense : [],
        neutral: kindFilter === 'all' || kindFilter === 'neutral' ? groups.neutral : [],
    }
    const visibleCount = visible.income.length + visible.expense.length + visible.neutral.length

    const path = showInvestecNav
        ? [
              { title: 'Payslip', body: 'Net pay becomes monthly budget income.', to: '/salary' },
              { title: 'Budget', body: 'Each line item maps to one category.', to: '/budget' },
              { title: 'Banking', body: 'Transactions pick up the same category via rules.', to: '/investec/transactions' },
              { title: 'Analysis', body: 'Actual spend is compared to the budget by category.', to: '/investec/budget-analysis' },
          ]
        : [
              { title: 'Payslip', body: 'Net pay becomes monthly budget income.', to: '/salary' },
              { title: 'Budget', body: 'Each line item maps to one category from this list.', to: '/budget' },
          ]

    return (
        <div className="mx-auto max-w-[1080px] space-y-8">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className={paperTitle}>Guide</h1>
                    <p className={`mt-1 ${paperEyebrow}`}>
                        {showInvestecNav
                            ? 'Shared categories for budget lines, transactions, and analysis.'
                            : 'Categories for mapping budget line items.'}
                    </p>
                </div>
                <nav className="flex flex-wrap items-center gap-1" aria-label="Related pages">
                    <JumpLink to="/budget">Budget</JumpLink>
                    {showInvestecNav ? (
                        <>
                            <JumpLink to="/investec/transactions">Transactions</JumpLink>
                            <JumpLink to="/investec/rules">Rules</JumpLink>
                            <JumpLink to="/investec/budget-analysis">Analysis</JumpLink>
                        </>
                    ) : null}
                </nav>
            </header>

            <PaperCard className="overflow-hidden">
                <div
                    className={`grid grid-cols-1 ${
                        path.length === 4
                            ? 'lg:grid-cols-4'
                            : 'sm:grid-cols-2'
                    } divide-y divide-[var(--paper-line)] ${
                        path.length === 4 ? 'lg:divide-x lg:divide-y-0' : 'sm:divide-x sm:divide-y-0'
                    }`}
                >
                    {path.map((step, index) => (
                        <Link
                            key={step.title}
                            to={step.to}
                            className="group flex cursor-pointer flex-col p-5 transition-colors duration-200 hover:bg-[var(--paper-canvas)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--paper-accent)]/20 sm:p-6"
                        >
                            <p className={paperEyebrow}>
                                {String(index + 1).padStart(2, '0')}
                            </p>
                            <p className="mt-3 text-base font-semibold text-[var(--paper-ink)]">
                                {step.title}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-[var(--paper-muted)]">
                                {step.body}
                            </p>
                            <span className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--paper-muted)] transition-colors duration-200 group-hover:text-[var(--paper-ink)]">
                                Open
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                        </Link>
                    ))}
                </div>
            </PaperCard>

            <PaperCard className="p-5 sm:p-6">
                <p className={paperEyebrow}>Watch for</p>
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--paper-muted)]">
                    <li>
                        <span className="font-medium text-[var(--paper-ink)]">Budget lines</span>
                        {' '}can use expense categories, transfers, or uncategorized. Income categories are for transactions, not budget pots.
                    </li>
                    <li>
                        <span className="font-medium text-[var(--paper-ink)]">Excluded</span>
                        {' '}budget items stay visible on Budget but are left out of Analysis.
                    </li>
                    {showInvestecNav ? (
                        <li>
                            <span className="font-medium text-[var(--paper-ink)]">Rules</span>
                            {' '}override auto-categorization by merchant or description.
                        </li>
                    ) : null}
                </ul>
            </PaperCard>

            <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className={`${paperSegment} w-fit`} role="group" aria-label="Filter by type">
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
                    <div className="relative min-w-0 flex-1">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-muted)]"
                            aria-hidden="true"
                        />
                        <label htmlFor="category-guide-search" className="sr-only">
                            Search categories
                        </label>
                        <input
                            id="category-guide-search"
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search labels, merchants, or descriptions"
                            className={`${paperField} pl-9`}
                        />
                    </div>
                </div>
                <p className="text-xs text-[var(--paper-muted)]" aria-live="polite">
                    {visibleCount} {visibleCount === 1 ? 'category' : 'categories'}
                    {deferredQuery ? ` matching “${query.trim()}”` : ''}
                </p>
            </div>

            {visibleCount === 0 ? (
                <PaperCard className="p-8 text-center sm:p-12">
                    <p className="text-sm text-[var(--paper-muted)]">No categories match that search.</p>
                    <button
                        type="button"
                        onClick={() => {
                            setQuery('')
                            setKindFilter('all')
                        }}
                        className="mt-3 cursor-pointer text-sm font-medium text-[var(--paper-ink)] underline underline-offset-2"
                    >
                        Clear filters
                    </button>
                </PaperCard>
            ) : (
                <div className="space-y-8">
                    <CategoryGroup
                        title={KIND_META.income.label}
                        hint={KIND_META.income.hint}
                        cats={visible.income}
                        showInvestecNav={showInvestecNav}
                    />
                    <CategoryGroup
                        title={KIND_META.expense.label}
                        hint={KIND_META.expense.hint}
                        cats={visible.expense}
                        showInvestecNav={showInvestecNav}
                    />
                    <CategoryGroup
                        title={KIND_META.neutral.label}
                        hint={KIND_META.neutral.hint}
                        cats={visible.neutral}
                        showInvestecNav={showInvestecNav}
                    />
                </div>
            )}
        </div>
    )
}
