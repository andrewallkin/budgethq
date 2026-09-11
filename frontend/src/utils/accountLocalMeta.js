const STORAGE_KEY = 'budgethq.accountLocalMeta.v1'

const emptyMeta = () => ({
    kinds: { investec: {}, manual: {} },
    clearedEmergencyAccountId: null,
})

export function inferAccountKind(account = {}) {
    const text = [account.product_name, account.account_name, account.reference_name, account.name]
        .filter(Boolean)
        .join(' ')
    if (/\b(loan|finance|instalment|installment|credit)\b/i.test(text)) return 'loan'
    return 'cash'
}

export function readAccountLocalMeta() {
    if (typeof window === 'undefined') return emptyMeta()
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return emptyMeta()
        const parsed = JSON.parse(raw)
        return {
            kinds: {
                investec: parsed.kinds?.investec || {},
                manual: parsed.kinds?.manual || {},
            },
            clearedEmergencyAccountId: parsed.clearedEmergencyAccountId ?? null,
        }
    } catch {
        return emptyMeta()
    }
}

function writeAccountLocalMeta(meta) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta))
}

export function getAccountKind(source, account) {
    const stored = readAccountLocalMeta().kinds?.[source]?.[String(account.id)]
    if (stored === 'cash' || stored === 'loan') return stored
    return inferAccountKind(account)
}

export function setAccountKind(source, accountId, kind) {
    const meta = readAccountLocalMeta()
    meta.kinds[source] = { ...meta.kinds[source], [String(accountId)]: kind }
    writeAccountLocalMeta(meta)
}

export function isInvestecEmergencyCleared(accountId) {
    return readAccountLocalMeta().clearedEmergencyAccountId === accountId
}

export function setInvestecEmergencyCleared(accountId) {
    const meta = readAccountLocalMeta()
    meta.clearedEmergencyAccountId = accountId
    writeAccountLocalMeta(meta)
}

export function clearInvestecEmergencyCleared() {
    const meta = readAccountLocalMeta()
    meta.clearedEmergencyAccountId = null
    writeAccountLocalMeta(meta)
}

export function withInvestecEmergencyOverlay(account) {
    if (!account) return account
    if (isInvestecEmergencyCleared(account.id)) {
        return { ...account, is_emergency_fund_account: false }
    }
    return account
}
