import { googleSheetsMock } from './googleSheetsMock'
import { sygniaPlaywrightMock } from './sygniaPlaywrightMock'

const adapters = [googleSheetsMock, sygniaPlaywrightMock]

const byId = Object.fromEntries(adapters.map((a) => [a.id, a]))

/** Wizard step 1: high-level source kinds. */
export const WIZARD_SOURCE_KINDS = [
    {
        id: 'google_sheets',
        label: 'Google Sheets',
        description: 'Name the account yourself and track holdings from a sheet tab.',
        adapterId: googleSheetsMock.id,
    },
    {
        id: 'playwright',
        label: 'Playwright automation',
        description: 'Connect a supported broker and sync holdings automatically.',
    },
]

export function getAdapter(sourceId) {
    const adapter = byId[sourceId]
    if (!adapter) {
        throw new Error(`Unknown integration source: ${sourceId}`)
    }
    return adapter
}

export function listAdapters() {
    return adapters
}

export function listPlaywrightAdapters() {
    return adapters.filter((a) => a.sourceKind === 'playwright')
}
