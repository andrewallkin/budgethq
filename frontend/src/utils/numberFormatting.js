// Centralized number formatting utilities
// All app code should use these helpers for displaying numeric values.

const DEFAULT_LOCALE = 'en-US'

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

