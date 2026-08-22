/** @typedef {'google_sheets' | 'sygnia_playwright'} IntegrationSourceId */
/** @typedef {'google_sheets' | 'playwright'} SourceKind */
/** @typedef {'sygnia_full' | 'sheets_placeholder'} DetailMode */

/**
 * @typedef {Object} AccountSummary
 * @property {string} id
 * @property {string} name
 * @property {string} currencyCode
 * @property {IntegrationSourceId} sourceId
 * @property {string} sourceLabel
 * @property {number} totalValue
 * @property {string} createdAt
 * @property {string|null} [productType]
 */

export const PRODUCT_TYPES = [
    { id: 'ra', label: 'Retirement annuity' },
    { id: 'tfsa', label: 'TFSA' },
    { id: 'offshore', label: 'Offshore' },
]

const PRODUCT_TYPE_LABELS = {
    ra: 'Retirement annuity',
    tfsa: 'TFSA',
    offshore: 'Offshore',
    living_annuity: 'Living annuity',
    discretionary: 'Discretionary investment',
}

export function productTypeLabel(id) {
    return PRODUCT_TYPE_LABELS[id] || null
}

export function stripAccountCodeFromName(name, accountCode) {
    if (!name) return ''
    const trimmed = name.trim()
    if (!accountCode) return trimmed
    const escaped = String(accountCode).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const stripped = trimmed.replace(new RegExp(`\\s*[:(]?\\s*${escaped}\\s*\\)?\\s*$`, 'i'), '').trim()
    return stripped || trimmed
}

export function labelsMatch(a, b) {
    const norm = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    return Boolean(a && b && norm(a) === norm(b))
}

export const PORTFOLIO_CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP']

export const SOURCE_IDS = {
    GOOGLE_SHEETS: 'google_sheets',
    SYGNIA_PLAYWRIGHT: 'sygnia_playwright',
}
