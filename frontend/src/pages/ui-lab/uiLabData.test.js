import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    BUDGET_COLORS,
    budgetSplit,
    investmentTotal,
    labBudget,
    labHome,
    labInvestments,
    monthlyTotal,
} from './uiLabData.js'

describe('uiLabData', () => {
    it('keeps every budget pie slice above zero', () => {
        const slices = budgetSplit(labBudget)
        assert.equal(slices.length, 4)
        for (const slice of slices) {
            assert.ok(slice.value > 0, `${slice.name} must be > 0`)
            assert.equal(typeof BUDGET_COLORS[slice.name], 'string')
        }
    })

    it('derives monthly totals from cadence', () => {
        assert.equal(monthlyTotal(labBudget.needs), 20500)
        assert.equal(monthlyTotal(labBudget.wants), 2850)
        assert.equal(monthlyTotal(labBudget.savings), 8000)
    })

    it('matches investment total to account values', () => {
        assert.equal(labInvestments.accounts.length, 3)
        assert.equal(investmentTotal(labInvestments.accounts), labInvestments.totalHoldings)
        assert.equal(labInvestments.totalHoldings, labHome.investments.totalValue)
        for (const account of labInvestments.accounts) {
            assert.match(account.accountCode, /^SG-00-\d{4}$/)
        }
    })

    it('gives home charts enough series', () => {
        assert.ok(labHome.accounts.rows.length >= 2)
        assert.ok(labHome.investments.portfolios.length >= 3)
        assert.ok(labHome.emergency.targetValue > labHome.emergency.currentFund)
    })
})
