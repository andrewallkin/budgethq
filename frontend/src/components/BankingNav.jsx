import { NavLink } from 'react-router-dom'
import { paperEyebrow, paperTitle } from './appUi'

const NAV_ITEMS = [
    { path: '/investec', label: 'Overview', end: true },
    { path: '/investec/accounts', label: 'Accounts' },
    { path: '/investec/transactions', label: 'Transactions' },
    { path: '/investec/budget-analysis', label: 'Analysis' },
    { path: '/investec/rules', label: 'Rules' },
]

export function BankingPageHeader({ title, description, actions }) {
    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className={paperEyebrow}>Banking</p>
                    <h1 className={paperTitle}>{title}</h1>
                    {description ? (
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--paper-muted)]">
                            {description}
                        </p>
                    ) : null}
                </div>
                {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
            </div>
            <BankingNav />
        </div>
    )
}

export function BankingLoading({ title, message = 'Loading…', actions }) {
    return (
        <div className="mx-auto max-w-[1080px] space-y-6">
            <BankingPageHeader title={title} actions={actions} />
            <p className="py-16 text-center text-sm text-[var(--paper-muted)]">{message}</p>
        </div>
    )
}

export default function BankingNav({ className = '' }) {
    return (
        <nav
            className={`banking-nav-scroll -mx-1 overflow-x-auto px-1 ${className}`.trim()}
            aria-label="Banking sections"
        >
            <div className="flex w-max min-w-full gap-1 rounded-lg border border-[var(--paper-line)] bg-[var(--paper-card)] p-1">
                {NAV_ITEMS.map(({ path, label, end }) => (
                    <NavLink
                        key={path}
                        to={path}
                        end={end}
                        className={({ isActive }) =>
                            [
                                'inline-flex min-h-10 min-w-[6.5rem] flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/40',
                                isActive
                                    ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                    : 'text-[var(--paper-muted)] hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)]',
                            ].join(' ')
                        }
                    >
                        {label}
                    </NavLink>
                ))}
            </div>
        </nav>
    )
}
