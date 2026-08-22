import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SOURCE_IDS } from './types.js'
import {
    SHEETS_ACCOUNT_ID_PREFIX,
    amountInBase,
    combinedHoldingsTotal,
    mapInvestmentPortfolios,
    sheetsAccountId,
} from './sheetsAccounts.js'

describe('sheetsAccounts', () => {
    it('prefixes ids and drops the synthetic RA card', () => {
        const accounts = mapInvestmentPortfolios([
            {
                id: 3,
                name: 'TFSA',
                slug: 'tfsa',
                currency_code: 'ZAR',
                sheet_name: 'user_1_tfsa',
                total_value: 1000,
                is_default_tfsa: true,
            },
            {
                id: null,
                name: 'Retirement Annuity',
                slug: 'ra',
                currency_code: 'ZAR',
                total_value: 50000,
                is_retirement_annuity: true,
            },
        ])
        assert.equal(accounts.length, 1)
        assert.equal(accounts[0].id, `${SHEETS_ACCOUNT_ID_PREFIX}3`)
        assert.equal(accounts[0].id, sheetsAccountId(3))
        assert.equal(accounts[0].sourceId, SOURCE_IDS.GOOGLE_SHEETS)
        assert.equal(accounts[0].sourceLabel, 'Google Sheets')
        assert.equal(accounts[0].slug, 'tfsa')
        assert.equal(accounts[0].sheetName, 'user_1_tfsa')
        assert.equal(accounts[0].currencyCode, 'ZAR')
        assert.equal(accounts[0].totalValue, 1000)
        assert.equal(accounts[0].isDefaultTfsa, true)
    })

    it('converts foreign value as amount times rate and omits missing rates', () => {
        const fx = { base_currency: 'ZAR', rates: { USD: 18 } }
        assert.equal(amountInBase(100, 'ZAR', fx), 100)
        assert.equal(amountInBase(10, 'USD', fx), 180)
        assert.equal(amountInBase(10, 'EUR', fx), null)

        const combined = combinedHoldingsTotal(
            [
                {
                    sourceId: SOURCE_IDS.SYGNIA_PLAYWRIGHT,
                    totalValue: 200,
                    currencyCode: 'ZAR',
                },
                {
                    sourceId: SOURCE_IDS.GOOGLE_SHEETS,
                    totalValue: 10,
                    currencyCode: 'USD',
                },
                {
                    sourceId: SOURCE_IDS.GOOGLE_SHEETS,
                    totalValue: 5,
                    currencyCode: 'EUR',
                },
            ],
            { ...fx, sheet_error: 'EUR missing' },
        )
        assert.equal(combined.total, 380)
        assert.equal(combined.omitted, true)
        assert.equal(combined.fxNote, 'EUR missing')
    })
})
