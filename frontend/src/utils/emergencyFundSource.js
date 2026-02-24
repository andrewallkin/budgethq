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

/**
 * Compute effective emergency fund total from multiple sources.
 * - manual current_fund (from EmergencySavings when fund_source=manual)
 * - bank_sync balance (Investec EF account when fund_source=bank_sync)
 * - manual accounts marked as emergency savings (always added when present)
 */
export function computeEffectiveEmergencyFund({
    fundSource,
    fundSourceManualValue,
    bankSyncBalance,
    manualAccounts = []
}) {
    const manualEmergencyTotal = manualAccounts
        .filter((a) => a.is_emergency_savings)
        .reduce((sum, a) => sum + (a.balance || 0), 0)

    if (fundSource === 'bank_sync' && bankSyncBalance != null) {
        return (bankSyncBalance ?? 0) + manualEmergencyTotal
    }

    return (fundSourceManualValue ?? 0) + manualEmergencyTotal
}
