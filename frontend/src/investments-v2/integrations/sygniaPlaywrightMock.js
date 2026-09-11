import { SOURCE_IDS } from '../types'
import { assertAdapter } from './contract'

export const sygniaPlaywrightMock = assertAdapter({
    id: SOURCE_IDS.SYGNIA_PLAYWRIGHT,
    sourceKind: 'playwright',
    label: 'Sygnia',
    description: 'Sync Investments Summary via Playwright login.',
    detailMode: 'sygnia_full',

    createAccount() {
        throw new Error('Sygnia accounts are created via the live API')
    },

    getDetail() {
        return null
    },
})
