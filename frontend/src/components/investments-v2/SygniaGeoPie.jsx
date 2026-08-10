import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import BlurredValue from '../BlurredValue'
import { formatPercent } from '../../utils/numberFormatting'

const COLORS = {
    sa: '#0d9488',
    foreign: '#6366f1',
}

export default function SygniaGeoPie({ foreignAllocation }) {
    if (foreignAllocation == null || Number.isNaN(Number(foreignAllocation))) {
        return null
    }

    const foreign = Math.max(0, Math.min(100, Number(foreignAllocation)))
    const sa = Math.round((100 - foreign) * 100) / 100

    const data = [
        { name: 'South Africa', value: sa },
        { name: 'Foreign', value: foreign },
    ]

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
                Geographic allocation
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="h-48 sm:h-52">
                    <BlurredValue as="div" className="h-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius="55%"
                                    outerRadius="82%"
                                    paddingAngle={3}
                                >
                                    <Cell fill={COLORS.sa} />
                                    <Cell fill={COLORS.foreign} />
                                </Pie>
                                <Tooltip formatter={(value) => formatPercent(value)} />
                            </PieChart>
                        </ResponsiveContainer>
                    </BlurredValue>
                </div>
                <ul className="space-y-3 text-sm">
                    {data.map((item) => (
                        <li key={item.name} className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{
                                        backgroundColor:
                                            item.name === 'South Africa' ? COLORS.sa : COLORS.foreign,
                                    }}
                                />
                                {item.name}
                            </span>
                            <BlurredValue>
                                <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                                    {formatPercent(item.value)}
                                </span>
                            </BlurredValue>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}
