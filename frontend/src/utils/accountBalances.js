import { getAccountKind } from './accountLocalMeta'

const toAmount = (value) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
}

const investecName = (account) =>
    account.reference_name || account.account_name || account.product_name || 'Investec'

const mapLine = (source, id, name, stored, asLoan) => ({
    id: `${source}-${id}`,
    source,
    name,
    value: asLoan ? Math.abs(stored) : stored,
})

const byValueDesc = (a, b) => b.value - a.value

export function summarizeAccountBalances(
    investecAccounts = [],
    manualAccounts = [],
    getKind = getAccountKind,
) {
    const investecList = Array.isArray(investecAccounts) ? investecAccounts : []
    const manualList = Array.isArray(manualAccounts) ? manualAccounts : []

    const cashInvestec = []
    const loanInvestec = []
    for (const account of investecList) {
        if (account.is_active === false) continue
        const stored = toAmount(account.current_balance)
        const isLoan = getKind('investec', account) === 'loan'
        const line = mapLine('investec', account.id, investecName(account), stored, isLoan)
        if (isLoan) loanInvestec.push(line)
        else cashInvestec.push(line)
    }

    const cashManual = []
    const loanManual = []
    for (const account of manualList) {
        const stored = toAmount(account.balance)
        const isLoan = getKind('manual', account) === 'loan'
        const line = mapLine('manual', account.id, account.name || 'Account', stored, isLoan)
        if (isLoan) loanManual.push(line)
        else cashManual.push(line)
    }

    cashInvestec.sort(byValueDesc)
    cashManual.sort(byValueDesc)
    loanInvestec.sort(byValueDesc)
    loanManual.sort(byValueDesc)

    const cashAccounts = [...cashInvestec, ...cashManual]
    const loanAccounts = [...loanInvestec, ...loanManual]
    const cashTotal = cashAccounts.reduce((sum, row) => sum + row.value, 0)
    const liabilityTotal = loanAccounts.reduce((sum, row) => sum + row.value, 0)

    return {
        cashAccounts,
        loanAccounts,
        cashTotal,
        liabilityTotal,
        loanCount: loanAccounts.length,
    }
}
