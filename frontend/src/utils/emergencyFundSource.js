export const EMERGENCY_FUND_SOURCES = {
    MANUAL: 'manual',
    BANK_SYNC: 'bank_sync'
}

export function getEmergencyFundAccount(accounts = []) {
    return accounts.find((account) => account.is_emergency_fund_account) || null
}

export function canUseBankSync({ hasInvestecCredentials, emergencyAccount }) {
    return Boolean(hasInvestecCredentials && emergencyAccount)
}

export function applyBankSyncedFund(currentData, emergencyAccount) {
    return {
        ...currentData,
        current_fund: emergencyAccount?.available_balance ?? 0
    }
}
