import { useState, useEffect, useRef } from 'react'
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

    // Load data on mount
    useEffect(() => {
        fetchData()
    }, [])

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
    }, [emergencyFundData, loading, budgetData])

    const fetchData = async () => {
        try {
            const budgetRes = await axios.get('/api/budget/default_user')

            if (budgetRes.data && Object.keys(budgetRes.data).length > 0) {
                // Store full budget data to preserve it when saving
                setBudgetData({
                    salary: budgetRes.data.salary || 0,
                    age: budgetRes.data.age || 30,
                    needs: budgetRes.data.needs || [],
                    wants: budgetRes.data.wants || [],
                    savings: budgetRes.data.savings || []
                })

                // Load emergency fund data
                setEmergencyFundData({
                    current_emergency_fund: budgetRes.data.current_emergency_fund ?? 0,
                    monthly_emergency_deposit: budgetRes.data.monthly_emergency_deposit ?? 0,
                    emergency_target_type: budgetRes.data.emergency_target_type || null,
                    emergency_target_months: budgetRes.data.emergency_target_months ?? null,
                    emergency_target_value: budgetRes.data.emergency_target_value ?? null
                })

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
            // Mark as loaded even on error to prevent infinite blocking
            hasLoadedData.current = true
        } finally {
            setLoading(false)
            // After a short delay, allow saves (this prevents saves triggered by initial data load)
            setTimeout(() => {
                isInitialLoad.current = false
            }, 100)
        }
    }

    const saveData = async () => {
        // Don't save if budget data hasn't been loaded yet
        if (loading) return
        
        setIsSaving(true)
        try {
            // Save all budget data including emergency fund fields
            // This preserves existing budget data while updating emergency fund values
            await axios.post('/api/budget/default_user', {
                salary: budgetData.salary || 0,
                age: budgetData.age || 30,
                needs: budgetData.needs || [],
                wants: budgetData.wants || [],
                savings: budgetData.savings || [],
                current_emergency_fund: emergencyFundData.current_emergency_fund ?? 0,
                monthly_emergency_deposit: emergencyFundData.monthly_emergency_deposit ?? 0,
                emergency_target_type: emergencyFundData.emergency_target_type,
                emergency_target_months: emergencyFundData.emergency_target_months,
                emergency_target_value: emergencyFundData.emergency_target_value
            })
        } catch (err) {
            console.error("Failed to save data", err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleEmergencyFundSave = (data) => {
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

