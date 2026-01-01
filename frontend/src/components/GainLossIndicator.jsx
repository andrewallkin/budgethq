import { TrendingUp, TrendingDown } from 'lucide-react'

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

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: 'ZAR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Math.abs(value))
    }

    const iconSize = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'
    const textSize = size === 'lg' ? 'text-sm' : 'text-xs'

    return (
        <div className={`${colorClass} flex items-center justify-center gap-1 ${textSize === 'sm' ? 'text-sm' : 'text-base'}`}>
            <Icon className={iconSize} />
            <div className="text-center">
                <div className={`font-semibold flex items-center gap-1 ${textSize === 'sm' ? 'text-sm' : 'text-base'}`}>
                    <span>{isPositive ? '+' : '-'}{Math.abs(percentage).toFixed(1)}%</span>
                    <span className={colorClass}>
                        ({isPositive ? '+' : '-'}R {formatCurrency(Math.abs(amount)).replace('R', '')})
                    </span>
                </div>
            </div>
        </div>
    )
}
