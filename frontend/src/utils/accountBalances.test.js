import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { summarizeAccountBalances } from './accountBalances.js'

const byId = (id, kind) => (_source, account) => (String(account.id) === String(id) ? kind : 'cash')

describe('summarizeAccountBalances', () => {
    it('splits mixed Investec and manual cash vs loans', () => {
        const result = summarizeAccountBalances(
            [
                { id: 1, account_name: 'Cheque', current_balance: 10000, is_active: true },
                { id: 2, reference_name: 'Car', current_balance: 50000, is_active: true },
            ],
            [
                { id: 9, name: 'Savings', balance: 2000 },
                { id: 8, name: 'Personal loan', balance: 3000 },
            ],
            (source, account) => {
                if (source === 'investec' && account.id === 2) return 'loan'
                if (source === 'manual' && account.id === 8) return 'loan'
                return 'cash'
            },
        )

        assert.equal(result.cashTotal, 12000)
        assert.equal(result.liabilityTotal, 53000)
        assert.equal(result.loanCount, 2)
        assert.deepEqual(
            result.cashAccounts.map((row) => row.id),
            ['investec-1', 'manual-9'],
        )
        assert.deepEqual(
            result.loanAccounts.map((row) => row.id),
            ['investec-2', 'manual-8'],
        )
        assert.equal(result.loanAccounts[0].name, 'Car')
        assert.equal(result.loanAccounts[0].value, 50000)
    })

    it('counts a negative stored loan balance as amount owed', () => {
        const result = summarizeAccountBalances(
            [{ id: 1, account_name: 'Home loan', current_balance: -250000, is_active: true }],
            [],
            () => 'loan',
        )
        assert.equal(result.cashTotal, 0)
        assert.equal(result.liabilityTotal, 250000)
        assert.equal(result.loanAccounts[0].value, 250000)
        assert.equal(result.loanCount, 1)
    })

    it('excludes inactive Investec accounts', () => {
        const result = summarizeAccountBalances(
            [
                { id: 1, account_name: 'Live', current_balance: 100, is_active: true },
                { id: 2, account_name: 'Dead', current_balance: 999, is_active: false },
            ],
            [],
            () => 'cash',
        )
        assert.equal(result.cashTotal, 100)
        assert.equal(result.cashAccounts.length, 1)
    })

    it('treats all-cash and all-loan and empty lists', () => {
        const allCash = summarizeAccountBalances(
            [{ id: 1, current_balance: 10, is_active: true }],
            [{ id: 2, balance: 5 }],
            () => 'cash',
        )
        assert.equal(allCash.cashTotal, 15)
        assert.equal(allCash.loanCount, 0)
        assert.equal(allCash.liabilityTotal, 0)

        const allLoans = summarizeAccountBalances(
            [{ id: 1, current_balance: 10, is_active: true }],
            [{ id: 2, balance: 5 }],
            () => 'loan',
        )
        assert.equal(allLoans.cashTotal, 0)
        assert.equal(allLoans.liabilityTotal, 15)
        assert.equal(allLoans.loanCount, 2)

        const empty = summarizeAccountBalances(null, undefined, () => 'cash')
        assert.equal(empty.cashTotal, 0)
        assert.equal(empty.liabilityTotal, 0)
        assert.equal(empty.loanCount, 0)
        assert.deepEqual(empty.cashAccounts, [])
        assert.deepEqual(empty.loanAccounts, [])
    })

    it('uses getKind even when the name looks like a loan', () => {
        const result = summarizeAccountBalances(
            [{ id: 1, product_name: 'Vehicle finance', current_balance: 40000, is_active: true }],
            [],
            byId(1, 'cash'),
        )
        assert.equal(result.cashTotal, 40000)
        assert.equal(result.loanCount, 0)
    })

    it('treats missing balances as zero', () => {
        const result = summarizeAccountBalances(
            [{ id: 1, account_name: 'Empty', is_active: true }],
            [{ id: 2, name: 'Manual' }],
            () => 'cash',
        )
        assert.equal(result.cashTotal, 0)
        assert.equal(result.cashAccounts.length, 2)
    })
})
