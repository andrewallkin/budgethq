export default function ChartLegend({ payload, formatter }) {
    if (!payload || payload.length === 0) return null
    return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 min-h-[60px] text-gray-500 dark:text-gray-400 text-sm">
            {payload.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                    <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: entry.color }}
                    />
                    <span>{formatter ? formatter(entry.value, entry, index) : entry.value}</span>
                </div>
            ))}
        </div>
    )
}
