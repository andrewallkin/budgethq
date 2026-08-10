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
 */

export const PORTFOLIO_CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP']

export const SOURCE_IDS = {
    GOOGLE_SHEETS: 'google_sheets',
    SYGNIA_PLAYWRIGHT: 'sygnia_playwright',
}
