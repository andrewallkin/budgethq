import BlurredValue from '../BlurredValue'
import SygniaGeoPie from './SygniaGeoPie'
import {
    SygniaHistoryProvider,
    SygniaOverviewCards,
    SygniaPerformanceChart,
    SygniaMonthlySnapshots,
} from './SygniaHistorySection'
import { formatCurrency, formatNumber, formatPercent } from '../../utils/numberFormatting'
import { PaperCard, paperDivider, paperEyebrow, paperMoney, paperTableHead, paperTableRow } from '../appUi'

function Section({ title, children, className = '' }) {
    return (
        <PaperCard className={`overflow-hidden ${className}`.trim()}>
            <div className="border-b border-[var(--paper-line)] px-5 py-3.5 sm:px-6">
                <h2 className="text-sm font-semibold tracking-tight text-[var(--paper-ink)]">{title}</h2>
            </div>
            <div className="px-5 py-4 sm:px-6 sm:py-5">{children}</div>
        </PaperCard>
    )
}

function parseBrokerNumber(value) {
    if (value == null || value === '') return null
    const str = String(value).trim()
    if (!str) return null
    if (/^[\d.-]+$/.test(str)) {
        const num = Number(str)
        return Number.isNaN(num) ? null : num
    }
    const pctMatch = str.match(/^([\d\s.,]+)\s*%$/)
    if (pctMatch) {
        const cleaned = pctMatch[1].replace(/\s/g, '').replace(',', '.')
        const num = Number(cleaned)
        return Number.isNaN(num) ? null : num
    }
    const cleaned = str.replace(/^R\s?/i, '').replace(/\s/g, '').replace(',', '.')
    const num = Number(cleaned)
    return Number.isNaN(num) ? null : num
}

function MoneyText({ value, currencyOptions }) {
    if (value == null || value === '') return '—'
    const parsed = parseBrokerNumber(value)
    if (parsed != null) {
        const formatted = formatCurrency(parsed, currencyOptions)
        if (formatted) {
            return (
                <BlurredValue>
                    <span className="tabular-nums">{formatted}</span>
                </BlurredValue>
            )
        }
    }
    return (
        <BlurredValue>
            <span className="tabular-nums">{value}</span>
        </BlurredValue>
    )
}

function NumericText({ value, formatter = formatNumber }) {
    if (value == null || value === '') return '—'
    const parsed = parseBrokerNumber(value)
    if (parsed != null) {
        const formatted = formatter(parsed)
        if (formatted) {
            return <span className="tabular-nums">{formatted}</span>
        }
    }
    return <span className="tabular-nums">{value}</span>
}

function PercentText({ value }) {
    if (value == null || value === '') return '—'
    const parsed = parseBrokerNumber(value)
    if (parsed != null) {
        const formatted = formatPercent(parsed) || String(value).trim()
        return <span className="tabular-nums text-xs text-[var(--paper-muted)]">{formatted}</span>
    }
    return <span className="tabular-nums text-xs text-[var(--paper-muted)]">{value}</span>
}

function hasDebitOrderData(debit) {
    if (!debit) return false
    const details = debit.details || {}
    const hasDetails = Object.values(details).some((v) => v != null && String(v).trim() !== '')
    const hasAllocations = (debit.allocations || []).length > 0
    return hasDetails || hasAllocations
}

export default function SygniaDetailView({ accountId, detail }) {
    if (!detail) return null

    const inv = detail.investment_summary || { rows: [] }
    const retirement = detail.retirement_fund_components || { components: [] }
    const beneficiaries = detail.beneficiaries || []
    const debit = detail.debit_order

    const hasHoldings = (inv.rows || []).length > 0
    const hasRetirement = (retirement.components || []).length > 0
    const hasBeneficiaries = beneficiaries.length > 0
    const hasDebit = hasDebitOrderData(debit)
    const foreignAllocation = detail.foreign_allocation

    return (
        <SygniaHistoryProvider
            accountId={accountId}
            refreshKey={detail.last_synced_at || detail.as_of_date}
        >
            <div className="space-y-6">
                <SygniaOverviewCards />

                {hasHoldings && (
                    <Section title="Holdings">
                        <div className="-mx-1 overflow-x-auto overflow-y-hidden">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className={paperTableHead}>
                                        <th className="py-2 pr-4 font-normal">Code</th>
                                        <th className="py-2 pr-4 font-normal">Name</th>
                                        <th className="py-2 pr-4 text-right font-normal">Units</th>
                                        <th className="py-2 pr-4 text-right font-normal">Unit price</th>
                                        <th className="py-2 pr-4 text-right font-normal">Market value</th>
                                        <th className="py-2 text-right font-normal">Weight</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inv.rows.map((row) => (
                                        <tr key={`${row.investment_code}-${row.investment_name}`} className={paperTableRow}>
                                            <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs font-medium tabular-nums text-[var(--paper-ink)]">
                                                {row.investment_code}
                                            </td>
                                            <td className="max-w-[12rem] py-2 pr-4 text-[var(--paper-ink)] sm:max-w-none">
                                                {row.investment_name}
                                            </td>
                                            <td className="whitespace-nowrap py-2 pr-4 text-right text-[var(--paper-muted)]">
                                                <NumericText value={row.units} />
                                            </td>
                                            <td className="whitespace-nowrap py-2 pr-4 text-right text-[var(--paper-muted)]">
                                                <MoneyText
                                                    value={row.unit_price}
                                                    currencyOptions={{ minimumFractionDigits: 2, maximumFractionDigits: 4 }}
                                                />
                                            </td>
                                            <td className={`whitespace-nowrap py-2 pr-4 text-right ${paperMoney} text-[var(--paper-ink)]`}>
                                                <MoneyText value={row.market_value} />
                                            </td>
                                            <td className="whitespace-nowrap py-2 text-right">
                                                <PercentText value={row.percentage} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {(inv.total_market_value != null || inv.total_percentage != null) && (
                                    <tfoot>
                                        <tr className="border-t border-[var(--paper-line)] text-[var(--paper-ink)]">
                                            <td className="pt-3 text-sm font-semibold" colSpan={4}>
                                                Total
                                            </td>
                                            <td className={`whitespace-nowrap pt-3 text-right ${paperMoney}`}>
                                                <MoneyText value={inv.total_market_value} />
                                            </td>
                                            <td className="whitespace-nowrap pt-3 text-right">
                                                <PercentText value={inv.total_percentage} />
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </Section>
                )}

                <SygniaPerformanceChart />

                {hasRetirement && (
                    <Section title="Retirement fund components">
                        <div className={paperDivider}>
                            {retirement.components.map((comp) => (
                                <div key={comp.component} className="py-4 first:pt-0 last:pb-0">
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                        <h3 className="text-sm font-medium text-[var(--paper-ink)]">
                                            {comp.component}
                                        </h3>
                                        <p className={`text-sm ${paperMoney} text-[var(--paper-ink)]`}>
                                            <MoneyText value={comp.market_value} />
                                        </p>
                                    </div>
                                    {comp.benefit_lines?.length > 0 && (
                                        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--paper-muted)]">
                                            {comp.benefit_lines.map((line) => (
                                                <li key={line}>{line}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                        {retirement.account_market_value && (
                            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--paper-line)] pt-4">
                                <p className="text-sm text-[var(--paper-muted)]">Account market value</p>
                                <p className={`text-sm ${paperMoney} text-[var(--paper-ink)]`}>
                                    <MoneyText value={retirement.account_market_value} />
                                </p>
                            </div>
                        )}
                    </Section>
                )}

                {hasBeneficiaries && (
                    <Section title="Beneficiaries">
                        <div className="overflow-x-auto overflow-y-hidden">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className={paperTableHead}>
                                        <th className="py-2.5 pr-4">Name</th>
                                        <th className="py-2.5 pr-4">Relationship</th>
                                        <th className="py-2.5 text-right">Allocation</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {beneficiaries.map((b) => (
                                        <tr key={`${b.name}-${b.allocation}`} className={paperTableRow}>
                                            <td className="py-2.5 pr-4 font-medium text-[var(--paper-ink)]">
                                                {b.name}
                                            </td>
                                            <td className="py-2.5 pr-4 text-[var(--paper-muted)]">
                                                {b.relationship}
                                            </td>
                                            <td className="py-2.5 text-right tabular-nums text-[var(--paper-ink)]">
                                                {b.allocation}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Section>
                )}

                {hasDebit && (
                    <Section title="Debit order">
                        <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                            {[
                                ['Amount', debit.details.debit_order_amount, true],
                                ['Escalation rate', debit.details.escalation_rate, false],
                                ['Escalation month', debit.details.escalation_month, false],
                                ['Day of month', debit.details.day_of_month, false],
                                ['Effective date', debit.details.effective_date, false],
                                ['Linked bank', debit.details.linked_bank, false],
                            ]
                                .filter(([, value]) => value != null && String(value).trim() !== '')
                                .map(([label, value, isMoney]) => (
                                    <div key={label}>
                                        <dt className={`${paperEyebrow} text-[11px]`}>{label}</dt>
                                        <dd className="mt-0.5 font-medium text-[var(--paper-ink)]">
                                            {isMoney ? (
                                                <MoneyText value={value} />
                                            ) : (
                                                value
                                            )}
                                        </dd>
                                    </div>
                                ))}
                        </dl>

                        {debit.allocations?.length > 0 && (
                            <>
                                <h3 className="mb-2 text-sm font-semibold text-[var(--paper-ink)]">
                                    Allocations
                                </h3>
                                <div className="overflow-x-auto overflow-y-hidden">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className={paperTableHead}>
                                                <th className="py-2.5 pr-4">Code</th>
                                                <th className="py-2.5 pr-4">Name</th>
                                                <th className="py-2.5 text-right">Allocation</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {debit.allocations.map((row) => (
                                                <tr key={`${row.investment_code}-${row.allocation}`} className={paperTableRow}>
                                                    <td className="py-2.5 pr-4 font-medium tabular-nums text-[var(--paper-ink)]">
                                                        {row.investment_code}
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-[var(--paper-muted)]">
                                                        {row.investment_name}
                                                    </td>
                                                    <td className="py-2.5 text-right tabular-nums text-[var(--paper-ink)]">
                                                        {row.allocation}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </Section>
                )}

                <SygniaMonthlySnapshots />

                {foreignAllocation != null && <SygniaGeoPie foreignAllocation={foreignAllocation} />}
            </div>
        </SygniaHistoryProvider>
    )
}
