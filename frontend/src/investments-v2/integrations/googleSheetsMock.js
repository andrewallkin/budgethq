import { SOURCE_IDS } from '../types'
import { assertAdapter } from './contract'

export const googleSheetsMock = assertAdapter({
    id: SOURCE_IDS.GOOGLE_SHEETS,
    sourceKind: 'google_sheets',
    label: 'Google Sheets',
    description: 'Track holdings via a spreadsheet tab — same approach as classic Investments.',
    detailMode: 'sheets_live',

    createAccount() {
        throw new Error('Google Sheets accounts are created via POST /api/investments')
    },

    getDetail(account) {
        return {
            status: 'live',
            sourceId: SOURCE_IDS.GOOGLE_SHEETS,
            slug: account?.slug ?? null,
            numericId: account?.numericId ?? null,
            name: account?.name ?? null,
            currencyCode: account?.currencyCode ?? 'ZAR',
        }
    },
})
