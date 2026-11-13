import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { additionalIncomeTotal, hasAdditionalIncome, hasBonusIncome, payeShareOfEarnings } from './payslipBudget.js'

describe('payslipBudget helpers', () => {
    it('detects additional income', () => {
        const payslip = {
            additional_income: [
                { description: 'Annual Bonus', amount: 113517.97 },
                { description: 'Backpay Current Yr', amount: 3153.28 },
            ],
        }
        assert.equal(additionalIncomeTotal(payslip), 116671.25)
        assert.equal(hasAdditionalIncome(payslip), true)
        assert.equal(hasBonusIncome(payslip), true)
        assert.equal(hasAdditionalIncome({ additional_income: [] }), false)
        assert.equal(hasBonusIncome({
            additional_income: [{ description: 'Expense Claims', amount: 18415.35 }],
        }), false)
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
