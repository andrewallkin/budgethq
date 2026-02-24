import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Trash2, ArrowLeft, ChevronLeft, ChevronRight, Upload, FileText, TrendingUp, DollarSign, Receipt, PenLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '../utils/numberFormatting'
import PayslipUploadModal from '../components/PayslipUploadModal'
import ManualPayslipModal from '../components/ManualPayslipModal'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function SalaryPage() {
    const [loading, setLoading] = useState(true)
    const [payslipData, setPayslipData] = useState(null)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)
    const [uploadModalOpen, setUploadModalOpen] = useState(false)
    const [manualModalOpen, setManualModalOpen] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [hasOpenAIKey, setHasOpenAIKey] = useState(false)
    const [fyData, setFyData] = useState(null)
    
    // Month/Year state - will be set from latest payslip
    const [selectedMonth, setSelectedMonth] = useState(null)
    const [selectedYear, setSelectedYear] = useState(null)
    const [latestMonth, setLatestMonth] = useState(null)
    const [latestYear, setLatestYear] = useState(null)
    
    const currentDate = new Date()
    const [fyYear, setFyYear] = useState(currentDate.getMonth() >= 3 ? currentDate.getFullYear() : currentDate.getFullYear() - 1)

    // Load latest payslip and OpenAI key status on mount
    useEffect(() => {
        loadLatestPayslip()
        axios.get('/api/auth/user/settings/openai-key')
            .then(res => setHasOpenAIKey(res.data.has_key))
            .catch(() => {})
    }, [])

    // Load specific payslip when month/year changes (after initial load)
    useEffect(() => {
        if (selectedMonth && selectedYear) {
            loadPayslip(selectedYear, selectedMonth)
        }
    }, [selectedMonth, selectedYear])

    // Load financial year data
    useEffect(() => {
        fetchFinancialYearData()
    }, [fyYear])

    const loadLatestPayslip = async () => {
        try {
            const res = await axios.get('/api/payslip/latest')
            const payslip = res.data
            setPayslipData(payslip)
            setSelectedMonth(payslip.month)
            setSelectedYear(payslip.year)
            setLatestMonth(payslip.month)
            setLatestYear(payslip.year)
            setError(null)
        } catch (err) {
            if (err.response?.status === 404) {
                // No payslips uploaded yet
                setPayslipData(null)
                setError(null)
            } else {
                console.error("Failed to fetch latest payslip", err)
                setError("Failed to load payslip data")
            }
        } finally {
            setLoading(false)
        }
    }

    const loadPayslip = async (year, month) => {
        setLoading(true)
        try {
            const res = await axios.get(`/api/payslip/${year}/${month}`)
            setPayslipData(res.data)
            setError(null)
        } catch (err) {
            if (err.response?.status === 404) {
                setPayslipData(null)
                setError(null)
            } else {
                console.error("Failed to fetch payslip", err)
                setError("Failed to load payslip data")
            }
        } finally {
            setLoading(false)
        }
    }

    const fetchFinancialYearData = async () => {
        try {
            const res = await axios.get(`/api/payslip/financial-year/${fyYear}`)
            setFyData(res.data)
        } catch (err) {
            console.error("Failed to fetch FY data", err)
        }
    }

    const handleMonthChange = (direction) => {
        if (!selectedMonth || !selectedYear) return

        let newMonth = selectedMonth + direction
        let newYear = selectedYear

        if (newMonth > 12) {
            newMonth = 1
            newYear += 1
        } else if (newMonth < 1) {
            newMonth = 12
            newYear -= 1
        }

        setSelectedMonth(newMonth)
        setSelectedYear(newYear)
    }

    const handleUploadSuccess = (uploadedPayslip) => {
        // Set the uploaded payslip as current
        setPayslipData(uploadedPayslip)
        setSelectedMonth(uploadedPayslip.month)
        setSelectedYear(uploadedPayslip.year)
        setLatestMonth(uploadedPayslip.month)
        setLatestYear(uploadedPayslip.year)
        fetchFinancialYearData()
    }

    const handleUpdatePayslip = async (field, value) => {
        if (!selectedMonth || !selectedYear) return
        
        setSaving(true)
        try {
            await axios.put(`/api/payslip/${selectedYear}/${selectedMonth}`, {
                [field]: value
            })
            // Refresh payslip data
            await loadPayslip(selectedYear, selectedMonth)
        } catch (err) {
            console.error("Failed to update payslip", err)
        } finally {
            setSaving(false)
        }
    }

    const handleAddItem = async (description, amount, itemType) => {
        if (!description || !amount || !selectedMonth || !selectedYear) return
        
        setSaving(true)
        try {
            await axios.post(`/api/payslip/${selectedYear}/${selectedMonth}/items`, {
                description,
                amount: parseFloat(amount),
                item_type: itemType
            })
            await loadPayslip(selectedYear, selectedMonth)
        } catch (err) {
            console.error("Failed to add item", err)
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteItem = async (itemId) => {
        setSaving(true)
        try {
            await axios.delete(`/api/payslip/items/${itemId}`)
            await loadPayslip(selectedYear, selectedMonth)
        } catch (err) {
            console.error("Failed to delete item", err)
        } finally {
            setSaving(false)
        }
    }

    const handleUpdateItem = async (itemId, field, value) => {
        setSaving(true)
        try {
            await axios.put(`/api/payslip/items/${itemId}`, {
                [field]: field === 'amount' ? parseFloat(value) || 0 : value
            })
            await loadPayslip(selectedYear, selectedMonth)
        } catch (err) {
            console.error("Failed to update item", err)
        } finally {
            setSaving(false)
        }
    }

    const handleAddAdditionalIncome = async (description, amount) => {
        if (!description || !amount || !selectedMonth || !selectedYear) return
        
        setSaving(true)
        try {
            await axios.post(`/api/payslip/${selectedYear}/${selectedMonth}/additional-income`, {
                description,
                amount: parseFloat(amount)
            })
            await loadPayslip(selectedYear, selectedMonth)
        } catch (err) {
            console.error("Failed to add additional income", err)
        } finally {
            setSaving(false)
        }
    }

    const handleDeletePayslip = async () => {
        if (!selectedMonth || !selectedYear) return
        
        setSaving(true)
        try {
            await axios.delete(`/api/payslip/${selectedYear}/${selectedMonth}`)
            
            // Close modal and reset state
            setDeleteModalOpen(false)
            
            // After deletion, try to load latest payslip again
            await loadLatestPayslip()
            
            // Refresh financial year data
            fetchFinancialYearData()
        } catch (err) {
            console.error("Failed to delete payslip", err)
            alert("Failed to delete payslip. Please try again.")
        } finally {
            setSaving(false)
        }
    }

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ]

    if (loading) return <div className="p-8">Loading...</div>
    if (error) return <div className="p-8 text-red-600">{error}</div>

    // Empty state - no payslips
    if (!payslipData && !selectedMonth && !selectedYear) {
        return (
            <div className="max-w-6xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
                <div className="flex items-center gap-4 mb-6">
                    <Link to="/budget" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payslip Details</h1>
                        <p className="text-sm text-gray-500">Upload your first payslip to get started</p>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-12 border border-blue-200 dark:border-blue-800 text-center">
                    <FileText className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No Payslips Yet</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Upload your monthly payslip PDF to automatically extract and track your salary information
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button
                            onClick={() => setUploadModalOpen(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-lg"
                        >
                            <Upload className="w-5 h-5" />
                            Upload First Payslip
                        </button>
                        <button
                            onClick={() => setManualModalOpen(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-lg"
                        >
                            <PenLine className="w-5 h-5" />
                            Enter Manually
                        </button>
                    </div>
                </div>

                <PayslipUploadModal
                    isOpen={uploadModalOpen}
                    onClose={() => setUploadModalOpen(false)}
                    onSuccess={handleUploadSuccess}
                    initialMonth={currentDate.getMonth() + 1}
                    initialYear={currentDate.getFullYear()}
                    isUpdate={false}
                    hasOpenAIKey={hasOpenAIKey}
                />
                <ManualPayslipModal
                    isOpen={manualModalOpen}
                    onClose={() => setManualModalOpen(false)}
                    onSuccess={handleUploadSuccess}
                    initialMonth={currentDate.getMonth() + 1}
                    initialYear={currentDate.getFullYear()}
                />
            </div>
        )
    }

    // Empty state - viewing a month with no payslip
    if (!payslipData && selectedMonth && selectedYear) {
        return (
            <div className="max-w-6xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
                <div className="flex items-center gap-4 mb-6">
                    <Link to="/budget" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payslip Details</h1>
                        <p className="text-sm text-gray-500">Upload and manage your monthly payslips</p>
                    </div>
                    {saving && <span className="ml-auto text-xs text-green-600 font-medium animate-pulse">Saving...</span>}
                </div>

                {/* Month Navigator */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-center gap-3">
                        <button
                            onClick={() => handleMonthChange(-1)}
                            className="p-2 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        <div className="text-center">
                            <div className="text-lg font-bold text-gray-900 dark:text-white">
                                {monthNames[selectedMonth - 1]} {selectedYear}
                            </div>
                        </div>
                        <button
                            onClick={() => handleMonthChange(1)}
                            className="p-2 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 border border-gray-200 dark:border-gray-700 text-center">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Payslip for This Month</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Upload a payslip for {monthNames[selectedMonth - 1]} {selectedYear}
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button
                            onClick={() => setUploadModalOpen(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                        >
                            <Upload className="w-5 h-5" />
                            Upload Payslip
                        </button>
                        <button
                            onClick={() => setManualModalOpen(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                        >
                            <PenLine className="w-5 h-5" />
                            Enter Manually
                        </button>
                    </div>
                </div>

                <PayslipUploadModal
                    isOpen={uploadModalOpen}
                    onClose={() => setUploadModalOpen(false)}
                    onSuccess={handleUploadSuccess}
                    initialMonth={selectedMonth}
                    initialYear={selectedYear}
                    isUpdate={false}
                    hasOpenAIKey={hasOpenAIKey}
                />
                <ManualPayslipModal
                    isOpen={manualModalOpen}
                    onClose={() => setManualModalOpen(false)}
                    onSuccess={handleUploadSuccess}
                    initialMonth={selectedMonth}
                    initialYear={selectedYear}
                />
            </div>
        )
    }

    // Main view with payslip data
    const companyContributions = payslipData.items.filter(i => i.item_type === 'company_contribution')
    const personalDeductions = payslipData.items.filter(i => i.item_type === 'personal_deduction')
    const additionalIncome = payslipData.additional_income || []

    const isLatest = selectedMonth === latestMonth && selectedYear === latestYear

    // Calculate totals dynamically
    const totalAdditionalIncome = additionalIncome.reduce((sum, item) => sum + (item.amount || 0), 0)
    const totalCompanyContrib = companyContributions.reduce((sum, item) => sum + item.amount, 0)
    const totalPersonalDeduct = personalDeductions.reduce((sum, item) => sum + item.amount, 0)
    // Total income (display) = base gross + company contributions (benefits) + additional income
    const totalIncome = payslipData.gross_salary + totalCompanyContrib + totalAdditionalIncome

    return (
        <div className="max-w-6xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link to="/budget" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payslip Details</h1>
                    <p className="text-sm text-gray-500">View and edit your monthly payslip data</p>
                </div>
                {saving && <span className="ml-auto text-xs text-green-600 font-medium animate-pulse">Saving...</span>}
            </div>

            {/* Month Selector & Upload */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center justify-between sm:justify-start gap-3">
                        <button
                            onClick={() => handleMonthChange(-1)}
                            className="p-2 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        <div className="text-center">
                            <div className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                {monthNames[selectedMonth - 1]} {selectedYear}
                                {isLatest && (
                                    <span className="px-2 py-1 text-xs font-bold bg-green-500 text-white rounded">
                                        LATEST
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                {payslipData.company_name || 'Uploaded Payslip'}
                            </div>
                        </div>
                        <button
                            onClick={() => handleMonthChange(1)}
                            className="p-2 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setDeleteModalOpen(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
                            title="Delete this payslip"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmDeleteModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={handleDeletePayslip}
                title="Are you sure you want to delete this payslip?"
                message="This will permanently remove all payslip data for this month."
                monthYear={`${monthNames[selectedMonth - 1]} ${selectedYear}`}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                {/* LEFT COLUMN: INPUTS - order-2 on mobile so Summary appears first */}
                <div className="order-2 lg:order-1 lg:col-span-2 space-y-8">
                    {/* 1. GROSS INCOME */}
                    <SectionContainer title="Gross Salary" color="blue">
                        <div className="space-y-4">
                            <EditableField
                                label="Gross Salary"
                                value={payslipData.gross_salary}
                                onSave={(value) => handleUpdatePayslip('gross_salary', parseFloat(value))}
                            />
                            <EditableTextField
                                label="Job Title"
                                value={payslipData.title || ''}
                                onSave={(value) => handleUpdatePayslip('title', value)}
                            />
                            <EditableTextField
                                label="Company Name"
                                value={payslipData.company_name || ''}
                                onSave={(value) => handleUpdatePayslip('company_name', value)}
                            />
                        </div>
                    </SectionContainer>

                    {/* 2. ADDITIONAL INCOME */}
                    <SectionContainer title="Additional Income" color="green">
                        <ItemList
                            items={additionalIncome}
                            onAdd={handleAddAdditionalIncome}
                            color="green"
                            placeholder="Bonus, commission..."
                        />
                    </SectionContainer>

                    {/* 3. COMPANY CONTRIBUTIONS */}
                    <SectionContainer title="Company Contributions" color="purple">
                        <ItemList
                            items={companyContributions}
                            onDelete={handleDeleteItem}
                            onUpdate={handleUpdateItem}
                            onAdd={(desc, amt) => handleAddItem(desc, amt, 'company_contribution')}
                            color="purple"
                            placeholder="Pension, medical aid..."
                        />
                    </SectionContainer>

                    {/* 4. PERSONAL DEDUCTIONS */}
                    <SectionContainer title="Personal Deductions" color="indigo">
                        <ItemList
                            items={personalDeductions}
                            onDelete={handleDeleteItem}
                            onUpdate={handleUpdateItem}
                            onAdd={(desc, amt) => handleAddItem(desc, amt, 'personal_deduction')}
                            color="indigo"
                            placeholder="Medical aid, union dues..."
                        />
                    </SectionContainer>

                    {/* 5. TAX FIELDS */}
                    <SectionContainer title="Tax & Statutory Deductions" color="red">
                        <div className="space-y-4">
                            <EditableField
                                label="PAYE (Tax)"
                                value={payslipData.paye}
                                onSave={(value) => handleUpdatePayslip('paye', parseFloat(value))}
                            />
                            <EditableField
                                label="UIF (Employee Portion)"
                                value={payslipData.uif_employee_portion}
                                onSave={(value) => handleUpdatePayslip('uif_employee_portion', parseFloat(value))}
                            />
                        </div>
                    </SectionContainer>
                </div>

                {/* RIGHT COLUMN: SUMMARY - order-1 on mobile so it appears first after month block */}
                <div className="order-1 lg:order-2 lg:col-span-1 w-full">
                    <div className="lg:sticky lg:top-8 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-900/50 p-4 border-b border-gray-100 dark:border-gray-700">
                            <h2 className="font-bold text-gray-900 dark:text-white">Payslip Summary</h2>
                        </div>

                        <div className="p-4 sm:p-6 space-y-3 text-sm">
                            <SummaryRow label="Gross Salary" value={payslipData.gross_salary} isGreen />
                            {totalCompanyContrib > 0 && (
                                <SummaryRow label="Company Contributions" value={totalCompanyContrib} isGreen />
                            )}
                            <SummaryRow label="Additional Income" value={totalAdditionalIncome} isGreen />
                            
                            <div className="border-t border-gray-200 dark:border-gray-700 mt-4 pt-3"></div>
                            <div className="flex justify-between font-bold text-gray-900 dark:text-white py-1">
                                <span>Total Income</span>
                                <span>{formatCurrency(totalIncome)}</span>
                            </div>
                            <div className="border-t border-dashed border-gray-200 dark:border-gray-700 my-3"></div>

                            <SummaryRow label="PAYE (Tax)" value={payslipData.paye} isMutedRed />
                            <SummaryRow label="UIF" value={payslipData.uif_employee_portion} isMutedRed />
                            <SummaryRow label="Company Contributions" value={totalCompanyContrib} isMutedRed />
                            <SummaryRow label="Personal Deductions" value={totalPersonalDeduct} isMutedRed />

                            <div className="border-t-2 border-gray-100 dark:border-gray-700 mt-4 pt-4"></div>

                            <div className="flex justify-between items-end py-2">
                                <span className="text-gray-500 font-medium">Net Pay</span>
                                <span className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
                                    {formatCurrency(payslipData.net_pay)}
                                </span>
                            </div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 text-center text-xs text-blue-700 dark:text-blue-300 font-medium">
                            Synced to Dashboard
                        </div>
                    </div>
                </div>
            </div>

            {/* Financial Year Summary */}
            {fyData && fyData.months.some(m => m.has_data) && (
                <div className="mt-12 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                            Financial Year Summary ({fyData.financial_year})
                        </h2>
                        <select
                            value={fyYear}
                            onChange={(e) => setFyYear(parseInt(e.target.value))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                            {Array.from({ length: 5 }, (_, i) => {
                                const year = currentDate.getFullYear() - i
                                return (
                                    <option key={year} value={year}>
                                        FY {year}/{(year + 1).toString().slice(-2)}
                                    </option>
                                )
                            })}
                        </select>
                    </div>

                    {/* Metrics Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-green-500 rounded-lg">
                                    <DollarSign className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-sm font-medium text-green-900 dark:text-green-100">Total Gross Income</h3>
                            </div>
                            <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                                {formatCurrency(fyData.total_gross_income)}
                            </p>
                        </div>

                        <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl p-6 border border-red-200 dark:border-red-800">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-red-500 rounded-lg">
                                    <Receipt className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-sm font-medium text-red-900 dark:text-red-100">Total Tax Paid (PAYE)</h3>
                            </div>
                            <p className="text-3xl font-bold text-red-700 dark:text-red-300">
                                {formatCurrency(fyData.total_paye)}
                            </p>
                        </div>

                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-500 rounded-lg">
                                    <TrendingUp className="w-5 h-5 text-white" />
                                </div>
                                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Total Net Pay</h3>
                            </div>
                            <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                                {formatCurrency(fyData.total_net_pay)}
                            </p>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Monthly Salary Trend */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Monthly Salary Trend</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={fyData.months.filter(m => m.has_data)}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                                    <XAxis 
                                        dataKey="month_name" 
                                        tick={{ fontSize: 12 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={80}
                                    />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#1f2937', 
                                            border: '1px solid #374151',
                                            borderRadius: '8px'
                                        }}
                                        formatter={(value) => formatCurrency(value)}
                                    />
                                    <Legend />
                                    <Line 
                                        type="monotone" 
                                        dataKey="gross_salary" 
                                        stroke="#10b981" 
                                        strokeWidth={2}
                                        name="Gross Salary"
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="net_pay" 
                                        stroke="#3b82f6" 
                                        strokeWidth={2}
                                        name="Net Pay"
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="paye" 
                                        stroke="#ef4444" 
                                        strokeWidth={2}
                                        name="PAYE"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Tax Analysis */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tax & Deductions</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={fyData.months.filter(m => m.has_data)}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                                    <XAxis 
                                        dataKey="month_name" 
                                        tick={{ fontSize: 12 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={80}
                                    />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: '#1f2937', 
                                            border: '1px solid #374151',
                                            borderRadius: '8px'
                                        }}
                                        formatter={(value) => formatCurrency(value)}
                                    />
                                    <Legend />
                                    <Area 
                                        type="monotone" 
                                        dataKey="paye" 
                                        stackId="1"
                                        stroke="#ef4444" 
                                        fill="#ef4444"
                                        fillOpacity={0.6}
                                        name="PAYE"
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="uif" 
                                        stackId="1"
                                        stroke="#f59e0b" 
                                        fill="#f59e0b"
                                        fillOpacity={0.6}
                                        name="UIF"
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="personal_deductions" 
                                        stackId="1"
                                        stroke="#8b5cf6" 
                                        fill="#8b5cf6"
                                        fillOpacity={0.6}
                                        name="Personal Deductions"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Sub-components

function SectionContainer({ title, color, children }) {
    const colors = {
        blue: "border-l-blue-500",
        green: "border-l-green-500",
        purple: "border-l-purple-500",
        indigo: "border-l-indigo-500",
        red: "border-l-red-500"
    }

    return (
        <div className={`w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 border-l-4 ${colors[color]}`}>
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
            {children}
        </div>
    )
}

function EditableField({ label, value, onSave }) {
    const [editing, setEditing] = useState(false)
    const [tempValue, setTempValue] = useState(value)

    useEffect(() => {
        setTempValue(value)
    }, [value])

    const handleSave = () => {
        onSave(tempValue)
        setEditing(false)
    }

    return (
        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                {label}
            </label>
            <div className="relative flex items-center min-h-[44px]">
                <span className="absolute left-3 text-gray-500">R</span>
                <input
                    type="number"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="w-full pl-8 pr-4 py-3 min-h-[44px] text-base sm:text-lg font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
            </div>
        </div>
    )
}

function EditableTextField({ label, value, onSave }) {
    const [tempValue, setTempValue] = useState(value)

    useEffect(() => {
        setTempValue(value)
    }, [value])

    const handleSave = () => {
        onSave(tempValue)
    }

    return (
        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1">
                {label}
            </label>
            <input
                type="text"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="w-full px-4 py-2 text-sm sm:text-base font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder={`Enter ${label.toLowerCase()}`}
            />
        </div>
    )
}

function ItemList({ items, onDelete, onUpdate, onAdd, color = 'blue', placeholder }) {
    const [newDescription, setNewDescription] = useState('')
    const [newAmount, setNewAmount] = useState('')

    const handleAdd = () => {
        if (newDescription && newAmount) {
            onAdd(newDescription, newAmount)
            setNewDescription('')
            setNewAmount('')
        }
    }

    const focusRingClasses = {
        blue: "focus:ring-blue-500/20 focus-within:ring-blue-500/20",
        green: "focus:ring-green-500/20 focus-within:ring-green-500/20",
        purple: "focus:ring-purple-500/20 focus-within:ring-purple-500/20",
        indigo: "focus:ring-indigo-500/20 focus-within:ring-indigo-500/20"
    }
    const ringClass = focusRingClasses[color]

    return (
        <div className="space-y-3">
            {items.map(item => (
                <EditableItem
                    key={item.id}
                    item={item}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                />
            ))}

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 mt-2">
                <input
                    placeholder={placeholder || "Add item..."}
                    className={`flex-1 w-full min-h-[44px] px-4 py-3 text-sm bg-gray-50/50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-xl outline-none transition-all placeholder:text-gray-400 font-medium focus:ring-4 ${ringClass}`}
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <div className={`flex items-center gap-1 w-full sm:w-40 min-h-[44px] px-3 py-2 bg-gray-50/50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-xl focus-within:ring-4 focus-within:ring-offset-0 ${ringClass}`}>
                    <span className="text-gray-500 text-sm font-mono">R</span>
                    <input
                        type="number"
                        placeholder="0.00"
                        className="flex-1 min-w-0 py-2 text-sm bg-transparent border-none outline-none text-right placeholder:text-gray-400 font-mono"
                        value={newAmount}
                        onChange={e => setNewAmount(e.target.value)}
                        onBlur={handleAdd}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                </div>
            </div>
        </div>
    )
}

function EditableItem({ item, onUpdate, onDelete }) {
    const [description, setDescription] = useState(item.description)
    const [amount, setAmount] = useState(item.amount)

    useEffect(() => {
        setDescription(item.description)
        setAmount(item.amount)
    }, [item.description, item.amount])

    return (
        <div className="group flex flex-row items-center gap-2 p-2 sm:p-2.5 bg-gray-50 dark:bg-gray-700/30 rounded-xl hover:bg-white dark:hover:bg-gray-700 hover:shadow-md transition-all border border-transparent hover:border-gray-100 dark:hover:border-gray-600">
            <input
                className="flex-1 min-w-0 bg-transparent border-none focus:ring-2 focus:ring-blue-500/20 rounded px-2 py-1 font-medium text-gray-700 dark:text-gray-200 outline-none transition-all text-sm sm:text-base"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => description !== item.description && onUpdate?.(item.id, 'description', description)}
                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            />
            <div className="flex items-center gap-1 flex-shrink-0 w-24 sm:w-28 bg-transparent rounded focus-within:ring-2 focus-within:ring-blue-500/20">
                <span className="text-gray-500 text-sm font-mono">R</span>
                <input
                    type="number"
                    className="w-full min-w-0 py-1 pr-1 bg-transparent border-none focus:ring-0 font-mono text-gray-900 dark:text-white text-right outline-none text-sm sm:text-base"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onBlur={() => amount !== item.amount && onUpdate?.(item.id, 'amount', amount)}
                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                />
            </div>
            {onDelete && (
                <button
                    onClick={() => onDelete(item.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Delete item"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}
        </div>
    )
}

function SummaryRow({ label, value, isMutedRed, isGreen }) {
    let textColorClass = ''
    if (isMutedRed) textColorClass = 'text-red-500 font-medium'
    else if (isGreen) textColorClass = 'text-green-600 dark:text-green-400 font-medium'

    return (
        <div className="flex justify-between items-center">
            <span className={isMutedRed ? 'text-gray-500' : ''}>{label}</span>
            <span className={textColorClass}>
                {isMutedRed ? '- ' : ''}{formatCurrency(value || 0)}
            </span>
        </div>
    )
}
