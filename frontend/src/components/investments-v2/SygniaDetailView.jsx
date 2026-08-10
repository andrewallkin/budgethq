import BlurredValue from '../BlurredValue'
import SygniaGeoPie from './SygniaGeoPie'
import {
    SygniaHistoryProvider,
    SygniaOverviewCards,
    SygniaPerformanceChart,
    SygniaMonthlySnapshots,
} from './SygniaHistorySection'
import { formatCurrency } from '../../utils/numberFormatting'

function Section({ title, children }) {
    return (
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {title}
                </h2>
            </div>
            <div className="p-5">{children}</div>
        </section>
    )
}

function MoneyText({ value }) {
    if (value == null || value === '') return '—'
    const num = Number(value)
    if (!Number.isNaN(num) && String(value).match(/^[\d.-]+$/)) {
        return (
            <BlurredValue>
                <span className="tabular-nums">{formatCurrency(num)}</span>
            </BlurredValue>
        )
    }
    return (
        <BlurredValue>
            <span className="tabular-nums">{value}</span>
        </BlurredValue>
    )
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
        <SygniaHistoryProvider accountId={accountId}>
            <div className="space-y-6">
                <SygniaOverviewCards />

                {hasHoldings && (
                    <Section title="Holdings">
                        <div className="overflow-x-auto -mx-1">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                                        <th className="py-2 pr-4 font-medium">Code</th>
                                        <th className="py-2 pr-4 font-medium">Name</th>
                                        <th className="py-2 pr-4 font-medium text-right">Units</th>
                                        <th className="py-2 pr-4 font-medium text-right">Unit price</th>
                                        <th className="py-2 pr-4 font-medium text-right">Market value</th>
                                        <th className="py-2 font-medium text-right">%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {inv.rows.map((row) => (
                                        <tr key={`${row.investment_code}-${row.investment_name}`}>
                                            <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                                                {row.investment_code}
                                            </td>
                                            <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                                                {row.investment_name}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                                {row.units}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                                <MoneyText value={row.unit_price} />
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                                                <MoneyText value={row.market_value} />
                                            </td>
                                            <td className="py-2.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                {row.percentage}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {(inv.total_market_value != null || inv.total_percentage != null) && (
                                    <tfoot>
                                        <tr className="border-t border-gray-200 dark:border-gray-600 font-semibold text-gray-900 dark:text-white">
                                            <td className="pt-3" colSpan={4}>
                                                Total
                                            </td>
                                            <td className="pt-3 text-right whitespace-nowrap">
                                                <MoneyText value={inv.total_market_value} />
                                            </td>
                                            <td className="pt-3 text-right whitespace-nowrap">{inv.total_percentage}</td>
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
                        <div className="space-y-4">
                            {retirement.components.map((comp) => (
                                <div
                                    key={comp.component}
                                    className="rounded-lg border border-gray-100 dark:border-gray-700 p-4"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <h3 className="font-semibold text-gray-900 dark:text-white">
                                            {comp.component}
                                        </h3>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                            <MoneyText value={comp.market_value} />
                                        </p>
                                    </div>
                                    {comp.benefit_lines?.length > 0 && (
                                        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                            {comp.benefit_lines.map((line) => (
                                                <li key={line}>
                                                    <MoneyText value={line} />
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                            {retirement.account_market_value && (
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Account market value:{' '}
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        <MoneyText value={retirement.account_market_value} />
                                    </span>
                                </p>
                            )}
                        </div>
                    </Section>
                )}

                {hasBeneficiaries && (
                    <Section title="Beneficiaries">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                                        <th className="py-2 pr-4 font-medium">Name</th>
                                        <th className="py-2 pr-4 font-medium">Relationship</th>
                                        <th className="py-2 font-medium text-right">Allocation</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {beneficiaries.map((b) => (
                                        <tr key={`${b.name}-${b.allocation}`}>
                                            <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-white">
                                                {b.name}
                                            </td>
                                            <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-400">
                                                {b.relationship}
                                            </td>
                                            <td className="py-2.5 text-right text-gray-900 dark:text-white">
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
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-5">
                            {[
                                ['Amount', debit.details.debit_order_amount],
                                ['Escalation rate', debit.details.escalation_rate],
                                ['Escalation month', debit.details.escalation_month],
                                ['Day of month', debit.details.day_of_month],
                                ['Effective date', debit.details.effective_date],
                                ['Linked bank', debit.details.linked_bank],
                            ]
                                .filter(([, value]) => value != null && String(value).trim() !== '')
                                .map(([label, value]) => (
                                    <div
                                        key={label}
                                        className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5"
                                    >
                                        <dt className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            {label}
                                        </dt>
                                        <dd className="mt-0.5 font-medium text-gray-900 dark:text-white">
                                            {label === 'Amount' ? (
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
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                    Allocations
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                                                <th className="py-2 pr-4 font-medium">Code</th>
                                                <th className="py-2 pr-4 font-medium">Name</th>
                                                <th className="py-2 font-medium text-right">Allocation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {debit.allocations.map((row) => (
                                                <tr key={`${row.investment_code}-${row.allocation}`}>
                                                    <td className="py-2.5 pr-4 font-medium text-gray-900 dark:text-white">
                                                        {row.investment_code}
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                                                        {row.investment_name}
                                                    </td>
                                                    <td className="py-2.5 text-right text-gray-900 dark:text-white">
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
