import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatCurrency, formatPercent } from '../utils/numberFormatting'
import BlurredValue from './BlurredValue'

export default function GainLossIndicator({ percentage, amount, size = 'sm' }) {
    // Handle cases where we don't have valid data
    if (percentage === null || percentage === undefined || amount === null || amount === undefined) {
        return (
            <div className="text-gray-400 dark:text-gray-500 text-center">
                <div className="text-xs">—</div>
                <div className="text-xs">—</div>
            </div>
        )
    }

    const isPositive = percentage >= 0
    const Icon = isPositive ? TrendingUp : TrendingDown
    const colorClass = isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'

    const iconSize = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'
    const textSize = size === 'lg' ? 'text-sm' : 'text-xs'

    return (
        <div className={`${colorClass} flex items-center justify-center gap-1 ${textSize === 'sm' ? 'text-sm' : 'text-base'}`}>
            <Icon className={iconSize} />
            <div className="text-center">
                <BlurredValue><div className={`font-semibold flex items-center gap-1 ${textSize === 'sm' ? 'text-sm' : 'text-base'}`}>
                    <span>{formatPercent(percentage)}</span>
                    <span className={colorClass}>
                        ({formatCurrency(amount)})
                    </span>
                </div></BlurredValue>
            </div>
        </div>
    )
}
