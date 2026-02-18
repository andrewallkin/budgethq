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
 * Safely format a date string. Returns '—' for null, undefined, or invalid dates.
 * @param {string|null|undefined} dateStr - Date string (e.g. ISO format)
 * @param {Intl.DateTimeFormatOptions} options - toLocaleDateString options (default: { month: 'short', year: 'numeric' })
 * @returns {string}
 */
export const formatDateSafe = (dateStr, options = { month: 'short', year: 'numeric' }) => {
    if (dateStr == null || dateStr === '') return '—'
    const normalized = dateStr.includes('Z') ? dateStr : dateStr + 'T00:00:00'
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString(DEFAULT_LOCALE, options)
}

