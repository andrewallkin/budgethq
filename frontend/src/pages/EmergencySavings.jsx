import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import EmergencyFundCalculator from '../components/EmergencyFundCalculator'
import {
    EMERGENCY_FUND_SOURCES,
    getEmergencyFundAccount,
    canUseBankSync,
    applyBankSyncedFund
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
        // Convert from component's field names to API field names
        const apiData = {
            current_fund: data.current_emergency_fund ?? 0,
            monthly_deposit: data.monthly_emergency_deposit ?? 0,
            target_type: data.emergency_target_type,
            target_months: data.emergency_target_months,
            target_value: data.emergency_target_value
        }
        emergencyFundDataRef.current = apiData
        setEmergencyFundData(apiData)
    }

    if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>

    // Convert API field names to component's expected field names
    const componentData = {
        current_emergency_fund: emergencyFundData.current_fund,
        monthly_emergency_deposit: emergencyFundData.monthly_deposit,
        emergency_target_type: emergencyFundData.target_type,
        emergency_target_months: emergencyFundData.target_months,
        emergency_target_value: emergencyFundData.target_value
    }

    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">🛡️ Emergency Savings</h1>
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {isSaving ? 'Saving...' : 'All changes saved'}
                    </div>
                </div>
            </div>

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
    )
}
