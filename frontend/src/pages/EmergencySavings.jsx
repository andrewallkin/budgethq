import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import EmergencyFundCalculator from '../components/EmergencyFundCalculator'

export default function EmergencySavings() {
    const [loading, setLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const hasLoadedData = useRef(false) // Track if we've successfully loaded data from API
    const isInitialLoad = useRef(true) // Track if this is the initial data load

    // Emergency Fund data
    const [emergencyFundData, setEmergencyFundData] = useState({
        current_emergency_fund: 0,
        monthly_emergency_deposit: 0,
        emergency_target_type: null,
        emergency_target_months: null,
        emergency_target_value: null
    })

    // Store latest emergency fund data in ref to avoid stale closures
    const emergencyFundDataRef = useRef(emergencyFundData)
    useEffect(() => {
        emergencyFundDataRef.current = emergencyFundData
    }, [emergencyFundData])

    // Needs total from budget for computing monthly expenses
    const [needsTotal, setNeedsTotal] = useState(0)

    // Store full budget data to preserve it when saving
    const [budgetData, setBudgetData] = useState({
        salary: 0,
        age: 30,
        needs: [],
        wants: [],
        savings: []
    })

    // Store latest budget data in ref to avoid stale closures
    const budgetDataRef = useRef(budgetData)
    useEffect(() => {
        budgetDataRef.current = budgetData
    }, [budgetData])

    // Load data on mount
    useEffect(() => {
        fetchData()
    }, [])

    // Save function using useCallback to ensure it captures latest state via refs
    const saveData = useCallback(async () => {
        // Don't save if we haven't loaded data yet
        if (!hasLoadedData.current) {
            console.log('EmergencySavings: Not saving - data not loaded yet')
            return
        }
        // Don't save during initial data load
        if (isInitialLoad.current) {
            console.log('EmergencySavings: Not saving - still in initial load')
            return
        }
        // Don't save while still loading
        if (loading) {
            console.log('EmergencySavings: Not saving - still loading')
            return
        }
        
        // Get latest values from refs to avoid stale closures
        const latestEmergencyData = emergencyFundDataRef.current
        const latestBudgetData = budgetDataRef.current
        
        console.log('EmergencySavings: Saving data', {
            emergency: latestEmergencyData,
            budget: latestBudgetData
        })
        
        setIsSaving(true)
        try {
            // Save all budget data including emergency fund fields
            // This preserves existing budget data while updating emergency fund values
            await axios.post('/api/budget/default_user', {
                salary: latestBudgetData.salary || 0,
                age: latestBudgetData.age || 30,
                needs: latestBudgetData.needs || [],
                wants: latestBudgetData.wants || [],
                savings: latestBudgetData.savings || [],
                current_emergency_fund: latestEmergencyData.current_emergency_fund ?? 0,
                monthly_emergency_deposit: latestEmergencyData.monthly_emergency_deposit ?? 0,
                emergency_target_type: latestEmergencyData.emergency_target_type,
                emergency_target_months: latestEmergencyData.emergency_target_months,
                emergency_target_value: latestEmergencyData.emergency_target_value
            })
            console.log('EmergencySavings: Save successful')
        } catch (err) {
            console.error("Failed to save data", err)
        } finally {
            setIsSaving(false)
        }
    }, [loading]) // Only depend on loading, values come from refs

    // Auto-save - only after data has been loaded and only for user changes
    useEffect(() => {
        // Don't save if we haven't loaded data yet
        if (!hasLoadedData.current) return
        // Don't save during initial data load
        if (isInitialLoad.current) return
        // Don't save while still loading
        if (loading) return

        const timer = setTimeout(() => {
            saveData()
        }, 1000)

        return () => clearTimeout(timer)
    }, [emergencyFundData, loading, saveData]) // Removed budgetData from deps

    const fetchData = async () => {
        try {
            const budgetRes = await axios.get('/api/budget/default_user')

            if (budgetRes.data && Object.keys(budgetRes.data).length > 0) {
                // Store full budget data to preserve it when saving
                const loadedBudgetData = {
                    salary: budgetRes.data.salary || 0,
                    age: budgetRes.data.age || 30,
                    needs: budgetRes.data.needs || [],
                    wants: budgetRes.data.wants || [],
                    savings: budgetRes.data.savings || []
                }
                setBudgetData(loadedBudgetData)
                budgetDataRef.current = loadedBudgetData

                // Load emergency fund data
                const loadedEmergencyData = {
                    current_emergency_fund: budgetRes.data.current_emergency_fund ?? 0,
                    monthly_emergency_deposit: budgetRes.data.monthly_emergency_deposit ?? 0,
                    emergency_target_type: budgetRes.data.emergency_target_type || null,
                    emergency_target_months: budgetRes.data.emergency_target_months ?? null,
                    emergency_target_value: budgetRes.data.emergency_target_value ?? null
                }
                setEmergencyFundData(loadedEmergencyData)
                emergencyFundDataRef.current = loadedEmergencyData

                // Calculate needs total from budget
                const needs = budgetRes.data.needs || []
                const totalNeeds = needs.reduce((sum, item) => sum + (item.amount || 0), 0)
                setNeedsTotal(totalNeeds)
                
                // Mark that we've successfully loaded data
                hasLoadedData.current = true
            } else {
                // Even if no data, mark as loaded so saves can happen for new users
                hasLoadedData.current = true
            }
        } catch (err) {
            console.error("Failed to fetch data", err)
            // On error, don't reset budgetData - preserve whatever we have
            // Only mark as loaded if we don't have any data yet
            // This prevents overwriting existing data if the fetch fails
            if (budgetDataRef.current.salary === 0 && 
                budgetDataRef.current.needs.length === 0 && 
                budgetDataRef.current.wants.length === 0) {
                // First load and fetch failed - mark as loaded anyway to allow saves
                hasLoadedData.current = true
            } else {
                // We have existing data - mark as loaded but don't reset
                hasLoadedData.current = true
            }
        } finally {
            setLoading(false)
            // After a short delay, allow saves (this prevents saves triggered by initial data load)
            setTimeout(() => {
                isInitialLoad.current = false
            }, 100)
        }
    }


    const handleEmergencyFundSave = (data) => {
        // Update ref immediately to ensure latest value is available for save
        emergencyFundDataRef.current = data
        setEmergencyFundData(data)
    }

    if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🛡️ Emergency Savings</h1>
                <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {isSaving ? 'Saving...' : 'All changes saved'}
                    </div>
                </div>
            </div>

            <EmergencyFundCalculator 
                needsTotal={needsTotal} 
                emergencyFundData={emergencyFundData}
                onSave={handleEmergencyFundSave}
            />
        </div>
    )
}

