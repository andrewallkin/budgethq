import BlurredValue from '../BlurredValue'
import { formatPercent } from '../../utils/numberFormatting'
import { AllocationRow, PAPER_CHART, PaperCard } from '../appUi'

export default function SygniaGeoPie({ foreignAllocation }) {
    if (foreignAllocation == null || Number.isNaN(Number(foreignAllocation))) {
        return null
    }

    const foreign = Math.max(0, Math.min(100, Number(foreignAllocation)))
    const sa = Math.round((100 - foreign) * 100) / 100

    return (
        <PaperCard className="overflow-hidden">
            <div className="border-b border-[var(--paper-line)] px-5 py-3.5 sm:px-6">
                <h2 className="text-sm font-semibold text-[var(--paper-ink)]">Geographic allocation</h2>
            </div>
            <div className="space-y-0 px-5 py-1 sm:px-6 [&>div:first-child]:pt-2 [&>div:last-child]:pb-3">
                <AllocationRow
                    label="South Africa"
                    amount={sa}
                    total={100}
                    display={
                        <BlurredValue as="span">{formatPercent(sa)}</BlurredValue>
                    }
                    color={PAPER_CHART.olive}
                />
                <AllocationRow
                    label="Foreign"
                    amount={foreign}
                    total={100}
                    display={
                        <BlurredValue as="span">{formatPercent(foreign)}</BlurredValue>
                    }
                    color={PAPER_CHART.umber}
                />
            </div>
        </PaperCard>
    )
}
