// Centralized number formatting utilities
// All app code should use these helpers for displaying numeric values.

// Using en-ZA (South African English) locale:
// - Space for thousands separator: 1 234 567
// - Period for decimal separator: 1 234.56
const DEFAULT_LOCALE = 'en-ZA'

const baseNumberFormat = (options = {}) =>
    new Intl.NumberFormat(DEFAULT_LOCALE, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        ...options,
    })

export const formatNumber = (value, options) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return ''
    }
    const num = Number(value)
    return baseNumberFormat(options).format(num)
}

export const formatCurrency = (value, options) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return ''
    }
    const num = Number(value)
    const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options,
    })
    return formatter.format(num)
}

export const formatPercent = (value, options) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return ''
    }
    const num = Number(value)
    const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
        ...options,
    })
    return formatter.format(num / 100)
}

/**
 * Date + time in South African locale (e.g. "12 May 2026, 05:58").
 */
export const formatDateTimeSafe = (
    dateStr,
    options = {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    },
) => {
    if (dateStr == null || dateStr === '') return '—'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '—'
    try {
        return d.toLocaleString(DEFAULT_LOCALE, options)
    } catch {
        return formatDateSafe(
            typeof dateStr === 'string' ? dateStr.split('T')[0] : dateStr,
            { day: 'numeric', month: 'short', year: 'numeric' },
        )
    }
}

/**
 * Safely format a date string. Returns '—' for null, undefined, or invalid dates.
 */
export const formatDateSafe = (dateStr, options = { month: 'short', year: 'numeric' }) => {
    if (dateStr == null || dateStr === '') return '—'
    const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(/Z$/, '') + 'T00:00:00'
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return '—'
    try {
        return d.toLocaleDateString(DEFAULT_LOCALE, options)
    } catch {
        // Fallback for mobile browsers where toLocaleDateString may fail
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        if (options.day !== undefined && options.month === 'short') {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            return `${day} ${months[d.getMonth()]} ${y}`
        }
        return `${y}-${m}-${day}`
    }
}

