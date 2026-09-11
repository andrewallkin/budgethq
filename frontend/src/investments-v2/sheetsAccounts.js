import { SOURCE_IDS } from './types.js'

export const SHEETS_ACCOUNT_ID_PREFIX = 'sheets:'

export function sheetsAccountId(numericId) {
    return `${SHEETS_ACCOUNT_ID_PREFIX}${numericId}`
}

export function mapInvestmentPortfolios(portfolios) {
    return (portfolios || [])
        .filter((row) => !row?.is_retirement_annuity)
        .map((row) => ({
            id: sheetsAccountId(row.id),
            numericId: row.id,
            name: row.name,
            slug: row.slug,
            currencyCode: row.currency_code || 'ZAR',
            sourceId: SOURCE_IDS.GOOGLE_SHEETS,
            sourceLabel: 'Google Sheets',
            totalValue: Number(row.total_value) || 0,
            sheetName: row.sheet_name || null,
            isDefaultTfsa: Boolean(row.is_default_tfsa),
            createdAt: null,
            productType: null,
        }))
}

export function amountInBase(amount, currencyCode, fx) {
    const value = Number(amount)
    if (Number.isNaN(value)) return null
    const base = String(fx?.base_currency || 'ZAR').trim().toUpperCase()
    const code = String(currencyCode || 'ZAR').trim().toUpperCase()
    if (code === base) return value
    const rate = fx?.rates?.[code]
    if (rate == null || Number.isNaN(Number(rate))) return null
    return value * Number(rate)
}

export function combinedHoldingsTotal(accounts, fx) {
    const list = accounts || []
    const sygniaSum = list
        .filter((a) => a.sourceId === SOURCE_IDS.SYGNIA_PLAYWRIGHT)
        .reduce((sum, a) => sum + (Number(a.totalValue) || 0), 0)

    let sheetsSum = 0
    let omitted = false
    for (const account of list) {
        if (account.sourceId !== SOURCE_IDS.GOOGLE_SHEETS) continue
        const converted = amountInBase(account.totalValue, account.currencyCode, fx)
        if (converted == null) omitted = true
        else sheetsSum += converted
    }

    const fxNote =
        (typeof fx?.sheet_error === 'string' && fx.sheet_error) ||
        (typeof fx?.aggregate_error === 'string' && fx.aggregate_error) ||
        null

    return { total: sygniaSum + sheetsSum, omitted, fxNote }
}
