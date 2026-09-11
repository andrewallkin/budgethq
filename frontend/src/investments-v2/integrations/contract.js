/**
 * Integration adapter contract (frontend DI).
 *
 * Each adapter must provide:
 * - id: IntegrationSourceId
 * - sourceKind: 'google_sheets' | 'playwright'
 * - label, description: wizard copy
 * - detailMode: 'sygnia_full' | 'sheets_live'
 * - createAccount({ name, currencyCode }): AccountSummary (Sygnia throws; Sheets is live via API)
 * - getDetail(account): detail payload for that adapter
 */

export function assertAdapter(adapter) {
    const required = ['id', 'sourceKind', 'label', 'description', 'detailMode', 'createAccount', 'getDetail']
    for (const key of required) {
        if (adapter[key] == null) {
            throw new Error(`Integration adapter missing "${key}"`)
        }
    }
    return adapter
}
