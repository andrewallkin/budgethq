import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { additionalIncomeTotal, hasAdditionalIncome, payeShareOfEarnings } from './payslipBudget.js'

describe('payslipBudget helpers', () => {
    it('detects additional income', () => {
        const payslip = {
            additional_income: [{ amount: 113517.97 }, { amount: 3153.28 }],
        }
        assert.equal(additionalIncomeTotal(payslip), 116671.25)
        assert.equal(hasAdditionalIncome(payslip), true)
        assert.equal(hasAdditionalIncome({ additional_income: [] }), false)
    })

    it('shows PAYE against cash earnings, not gross salary alone', () => {
        const share = payeShareOfEarnings({
            gross_salary: 66218.39,
            paye: 63939,
            additional_income: [{ amount: 116671.25 }],
        })
        assert.ok(share > 30)
        assert.ok(share < 40)
    })
})
