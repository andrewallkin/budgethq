import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency, formatPercent } from '../utils/numberFormatting'
import BlurredValue from './BlurredValue'
import { paperMoney, paperMoneyTone } from './appUi'

export default function GainLossIndicator({ percentage, amount, size = 'sm', formatCurrencyOpts = {} }) {
    if (percentage === null || percentage === undefined || amount === null || amount === undefined) {
        return (
            <span className="text-xs text-[var(--paper-muted)]">—</span>
        )
    }

    const isPositive = percentage >= 0
    const isFlat = percentage === 0 && amount === 0
    const Icon = isPositive ? TrendingUp : TrendingDown
    const colorClass = isFlat ? 'text-[var(--paper-muted)]' : paperMoneyTone(percentage)

    const iconSize = size === 'lg' ? 'h-3.5 w-3.5' : 'h-3 w-3'
    const textSize = size === 'lg' ? 'text-sm' : 'text-xs'

    return (
        <div className={`flex items-center justify-end gap-1 ${colorClass} ${textSize}`}>
            {!isFlat && <Icon className={iconSize} aria-hidden="true" />}
            <BlurredValue>
                <span className={`tabular-nums ${paperMoney} ${textSize}`}>
                    {formatPercent(percentage)}
                    <span className="ml-1 font-normal opacity-80">
                        ({formatCurrency(amount, {
                            ...formatCurrencyOpts,
                            signDisplay: isFlat ? 'auto' : 'exceptZero',
                        })})
                    </span>
                </span>
            </BlurredValue>
        </div>
    )
}
