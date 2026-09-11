import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import EmergencyFundCalculator from '../components/EmergencyFundCalculator'
import BlurredValue from '../components/BlurredValue'
import { formatCurrency, formatNumber } from '../utils/numberFormatting'
import {
    CARD_BAND,
    AppCard,
    LedgerRow,
    eyebrowClass,
    heroMoneyClass,
    moneyTone,
    dividerClass,
} from '../components/appUi'
import {
    EMERGENCY_FUND_SOURCES,
    getEmergencyFundAccount,
    canUseBankSync,
    applyBankSyncedFund,
    computeEffectiveEmergencyFund
} from '../utils/emergencyFundSource'

export default function EmergencySavings() {
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const hasLoadedData = useRef(false)
    const [hasUserEdited, setHasUserEdited] = useState(false)
    const [emergencyAccount, setEmergencyAccount] = useState(null)
    const [hasInvestecCredentials, setHasInvestecCredentials] = useState(false)
    const [fundSource, setFundSource] = useState(EMERGENCY_FUND_SOURCES.MANUAL)

    // Emergency Fund data - uses new field names matching API
    const [emergencyFundData, setEmergencyFundData] = useState({
        current_fund: 0,
        monthly_deposit: 0,
        target_type: null,
        target_months: null,
        target_value: null
    })

    // Store latest emergency fund data in ref to avoid stale closures
    const emergencyFundDataRef = useRef(emergencyFundData)
    useEffect(() => {
        emergencyFundDataRef.current = emergencyFundData
    }, [emergencyFundData])

    // Needs total from budget for computing monthly expenses (read-only)
    const [needsTotal, setNeedsTotal] = useState(0)

    // Manual bank accounts (for emergency fund total when is_emergency_savings)
    const [manualAccounts, setManualAccounts] = useState([])

    // Load data on mount
    useEffect(() => {
        fetchData()
    }, [])

    // Save function - saves ONLY to emergency-savings endpoint
    const saveData = useCallback(async (fundSourceOverride) => {
        if (!hasLoadedData.current) {
            console.log('EmergencySavings: Not saving - data not loaded yet')
            return
        }
        if (loading) {
            console.log('EmergencySavings: Not saving - still loading')
            return
        }

        const latestEmergencyData = emergencyFundDataRef.current

        console.log('EmergencySavings: Saving data', latestEmergencyData)

        setIsSaving(true)
        try {
            // Save ONLY to emergency-savings endpoint - no need to touch budget
            await axios.post('/api/emergency-savings/default_user', {
                current_fund: latestEmergencyData.current_fund ?? 0,
                monthly_deposit: latestEmergencyData.monthly_deposit ?? 0,
                target_type: latestEmergencyData.target_type,
                target_months: latestEmergencyData.target_months,
                target_value: latestEmergencyData.target_value,
                fund_source: fundSourceOverride ?? fundSource
            })
            console.log('EmergencySavings: Save successful')
        } catch (err) {
            console.error("Failed to save data", err)
        } finally {
            setIsSaving(false)
        }
    }, [loading, fundSource])

    // Auto-save when user edits
    useEffect(() => {
        if (!hasLoadedData.current) return
        if (!hasUserEdited) return
        if (loading) return

        const timer = setTimeout(() => {
            saveData()
        }, 1000)

        return () => clearTimeout(timer)
    }, [emergencyFundData, loading, saveData, hasUserEdited])

    const fetchData = async () => {
        try {
            // Fetch budget data (read-only, for needs total)
            const budgetRes = await axios.get('/api/budget/default_user')

            if (budgetRes.data && Object.keys(budgetRes.data).length > 0) {
                const needs = budgetRes.data.needs || []
                const totalNeeds = needs.reduce((sum, item) => sum + (item.amount || 0), 0)
                setNeedsTotal(totalNeeds)
            }

            // Fetch emergency savings data from dedicated endpoint
            const emergencyRes = await axios.get('/api/emergency-savings/default_user')

            let savedFundSource = EMERGENCY_FUND_SOURCES.MANUAL
            if (emergencyRes.data) {
                const loadedEmergencyData = {
                    current_fund: emergencyRes.data.current_fund ?? 0,
                    monthly_deposit: emergencyRes.data.monthly_deposit ?? 0,
                    target_type: emergencyRes.data.target_type || null,
                    target_months: emergencyRes.data.target_months ?? null,
                    target_value: emergencyRes.data.target_value ?? null
                }
                setEmergencyFundData(loadedEmergencyData)
                emergencyFundDataRef.current = loadedEmergencyData
                const apiSource = emergencyRes.data.fund_source
                savedFundSource =
                    apiSource === EMERGENCY_FUND_SOURCES.BANK_SYNC
                        ? EMERGENCY_FUND_SOURCES.BANK_SYNC
                        : EMERGENCY_FUND_SOURCES.MANUAL
            }

            // Fetch Investec connection and account state for optional bank sync
            let hasCredentials = false
            let efAccount = null
            try {
                const credentialsRes = await axios.get('/api/investec/credentials/status')
                hasCredentials = Boolean(credentialsRes.data?.is_connected)
                setHasInvestecCredentials(hasCredentials)

                if (hasCredentials) {
                    const accountsRes = await axios.get('/api/investec/accounts')
                    efAccount = getEmergencyFundAccount(accountsRes.data)
                    setEmergencyAccount(efAccount || null)
                } else {
                    setEmergencyAccount(null)
                }
            } catch (e) {
                setHasInvestecCredentials(false)
                setEmergencyAccount(null)
            }

            // Fetch manual bank accounts (for emergency fund total)
            try {
                const manualRes = await axios.get('/api/manual-accounts')
                setManualAccounts(manualRes.data || [])
            } catch (e) {
                setManualAccounts([])
            }

            // Set fundSource only after Investec state is known - otherwise the useEffect
            // would immediately reset bank_sync to manual because bankSyncAvailable is
            // still false while Investec is loading
            const bankSyncOk = Boolean(hasCredentials && efAccount)
            const resolvedSource =
                savedFundSource === EMERGENCY_FUND_SOURCES.BANK_SYNC && !bankSyncOk
                    ? EMERGENCY_FUND_SOURCES.MANUAL
                    : savedFundSource
            setFundSource(resolvedSource)

            hasLoadedData.current = true
        } catch (err) {
            console.error("Failed to fetch data", err)
            hasLoadedData.current = true
        } finally {
            setLoading(false)
        }
    }

    const bankSyncAvailable = canUseBankSync({
        hasInvestecCredentials,
        emergencyAccount
    })

    useEffect(() => {
        if (!bankSyncAvailable && fundSource !== EMERGENCY_FUND_SOURCES.MANUAL) {
            setFundSource(EMERGENCY_FUND_SOURCES.MANUAL)
            saveData(EMERGENCY_FUND_SOURCES.MANUAL)
        }
    }, [bankSyncAvailable, fundSource, saveData])

    const handleFundSourceChange = (source) => {
        if (source === EMERGENCY_FUND_SOURCES.BANK_SYNC && !bankSyncAvailable) return
        setFundSource(source)

        if (source === EMERGENCY_FUND_SOURCES.BANK_SYNC && emergencyAccount) {
            const newData = applyBankSyncedFund(
                emergencyFundDataRef.current,
                emergencyAccount
            )
            emergencyFundDataRef.current = newData
            setEmergencyFundData(newData)
        }
        saveData(source)
    }

    const handleEmergencyFundSave = (data) => {
        setHasUserEdited(true)
        // Manual accounts contribute to displayed total; we only store the "manual" portion in current_fund
        const manualEmergencyTotal = manualAccounts
            .filter((a) => a.is_emergency_savings)
            .reduce((sum, a) => sum + (a.balance || 0), 0)
        const userEnteredTotal = data.current_emergency_fund ?? 0
        const manualPortionToStore = Math.max(0, userEnteredTotal - manualEmergencyTotal)

        // Convert from component's field names to API field names
        const apiData = {
            current_fund: manualPortionToStore,
            monthly_deposit: data.monthly_emergency_deposit ?? 0,
            target_type: data.emergency_target_type,
            target_months: data.emergency_target_months,
            target_value: data.emergency_target_value
        }
        emergencyFundDataRef.current = apiData
        setEmergencyFundData(apiData)
    }

    if (loading) {
        return (
            <div className="mx-auto max-w-[1400px] space-y-5">
                <p className="py-12 text-center text-sm text-neutral-400">Loading...</p>
            </div>
        )
    }

    // Compute effective total from manual value, bank sync, and manual accounts marked as EF
    const effectiveCurrentFund = computeEffectiveEmergencyFund({
        fundSource,
        fundSourceManualValue: emergencyFundData.current_fund,
        bankSyncBalance: emergencyAccount?.available_balance,
        manualAccounts
    })

    const targetAmount =
        emergencyFundData.target_type === 'target_value'
            ? (emergencyFundData.target_value ?? 0)
            : needsTotal * (emergencyFundData.target_months ?? 6)

    const progress =
        targetAmount > 0 ? Math.min(100, (effectiveCurrentFund / targetAmount) * 100) : null

    const remainingToSave = Math.max(0, targetAmount - effectiveCurrentFund)
    const excessAboveTarget = Math.max(0, effectiveCurrentFund - targetAmount)

    const fundSourceLabel =
        fundSource === EMERGENCY_FUND_SOURCES.BANK_SYNC ? 'Bank sync' : 'Manual input'

    // Convert API field names to component's expected field names
    const componentData = {
        current_emergency_fund: effectiveCurrentFund,
        monthly_emergency_deposit: emergencyFundData.monthly_deposit,
        emergency_target_type: emergencyFundData.target_type,
        emergency_target_months: emergencyFundData.target_months,
        emergency_target_value: emergencyFundData.target_value
    }

    return (
        <div className="mx-auto max-w-[1400px] space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className={eyebrowClass}>Cash & safety</p>
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
                        Emergency Savings
                    </h1>
                </div>
                <p className="text-xs font-medium text-neutral-400">
                    {isSaving ? 'Saving...' : 'All changes saved'}
                </p>
            </div>

            <AppCard band={CARD_BAND.accounts} className="p-6">
                <div className="flex items-baseline justify-between gap-4">
                    <p className={eyebrowClass}>Emergency fund</p>
                    <p className="text-xs text-neutral-400">
                        {progress == null ? 'No target' : `${Math.round(progress)}% funded`}
                    </p>
                </div>
                <BlurredValue>
                    <p className={`mt-5 ${heroMoneyClass}`}>
                        {formatCurrency(effectiveCurrentFund, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        })}
                    </p>
                </BlurredValue>

                {progress != null && (
                    <div className="mt-6">
                        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                            <div
                                className="h-full rounded-full bg-neutral-950 transition-all dark:bg-white"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-neutral-400">
                            <BlurredValue>
                                <span>
                                    {formatCurrency(effectiveCurrentFund, {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 0,
                                    })}
                                </span>
                            </BlurredValue>
                            <BlurredValue>
                                <span>
                                    {formatCurrency(targetAmount, {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 0,
                                    })}
                                </span>
                            </BlurredValue>
                        </div>
                    </div>
                )}

                <div className={`mt-6 ${dividerClass}`}>
                    <LedgerRow
                        label="Target"
                        value={
                            <BlurredValue>
                                {targetAmount > 0
                                    ? formatCurrency(targetAmount, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                      })
                                    : 'Not set'}
                            </BlurredValue>
                        }
                    />
                    <LedgerRow
                        label="Monthly deposit"
                        value={
                            <BlurredValue>
                                {formatCurrency(emergencyFundData.monthly_deposit ?? 0, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </BlurredValue>
                        }
                    />
                    <LedgerRow
                        label="Fund source"
                        value={fundSourceLabel}
                    />
                    {targetAmount > 0 && (
                        <LedgerRow
                            label={remainingToSave > 0 ? 'Remaining to save' : 'Excess above target'}
                            value={
                                <BlurredValue>
                                    {formatCurrency(
                                        remainingToSave > 0 ? remainingToSave : excessAboveTarget,
                                        { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                                    )}
                                </BlurredValue>
                            }
                            tone={moneyTone(remainingToSave > 0 ? -1 : 1)}
                        />
                    )}
                    {progress != null && (
                        <LedgerRow
                            label="Progress"
                            value={
                                <BlurredValue>
                                    {formatNumber(progress, {
                                        minimumFractionDigits: 1,
                                        maximumFractionDigits: 1,
                                    })}
                                    %
                                </BlurredValue>
                            }
                        />
                    )}
                </div>
            </AppCard>

            <AppCard band={CARD_BAND.accounts} className="overflow-hidden p-6">
                <p className={eyebrowClass}>Fund setup</p>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                    Configure source, targets, and monthly deposits.
                </p>
                <div className="mt-4 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 [&>div]:shadow-none [&>div]:dark:bg-transparent [&_h2]:hidden">
                    <EmergencyFundCalculator
                        needsTotal={needsTotal}
                        emergencyFundData={componentData}
                        onSave={handleEmergencyFundSave}
                        fundSource={fundSource}
                        onFundSourceChange={handleFundSourceChange}
                        bankSyncAvailable={bankSyncAvailable}
                        hasInvestecCredentials={hasInvestecCredentials}
                        bankSyncMeta={{
                            accountName: emergencyAccount?.account_name,
                            referenceName: emergencyAccount?.reference_name,
                            balanceUpdatedAt: emergencyAccount?.balance_updated_at
                        }}
                    />
                </div>
            </AppCard>
        </div>
    )
}
