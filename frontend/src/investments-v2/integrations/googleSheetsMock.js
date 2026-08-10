import { SOURCE_IDS } from '../types'
import { assertAdapter } from './contract'

const SHEETS_PLACEHOLDER_DETAIL = {
    status: 'coming_soon',
    message: 'Google Sheets sync UI coming soon. Holdings and price refresh will plug in here.',
}

export const googleSheetsMock = assertAdapter({
    id: SOURCE_IDS.GOOGLE_SHEETS,
    sourceKind: 'google_sheets',
    label: 'Google Sheets',
    description: 'Track holdings via a spreadsheet tab — same approach as classic Investments.',
    detailMode: 'sheets_placeholder',

    createAccount() {
        throw new Error('Google Sheets accounts are not available yet')
    },

    getDetail() {
        return SHEETS_PLACEHOLDER_DETAIL
    },
})
