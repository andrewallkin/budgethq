import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Trash2, ArrowLeft, ChevronLeft, ChevronRight, Upload, PenLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { formatCurrency, formatDateSafe } from '../utils/numberFormatting'
import { hasAdditionalIncome, payslipMonthLabel } from '../utils/payslipBudget'
import {
    PAPER_CHART,
    PaperCard,
    paperDivider,
    paperEyebrow,
    paperMoney,
    paperMoneyTone,
    paperTitle,
} from '../components/appUi'
import BlurredValue from '../components/BlurredValue'
import PayslipUploadModal from '../components/PayslipUploadModal'
import ManualPayslipModal from '../components/ManualPayslipModal'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const btnBase = 'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const fieldInput = 'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const hideNumberSpinners = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

const amountKeyDown = (onEnter) => (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
    if (e.key === 'Enter') onEnter?.(e)
}

export default function SalaryPage() {
    const { blurSensitiveValues } = useAuth()
    const [initialLoading, setInitialLoading] = useState(true)
    const [payslipLoading, setPayslipLoading] = useState(false)
    const [payslipData, setPayslipData] = useState(null)
    const [budgetSalary, setBudgetSalary] = useState(null)
    const [salarySkippedAdditional, setSalarySkippedAdditional] = useState(false)
    const [salaryPayslipLabel, setSalaryPayslipLabel] = useState(null)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)
    const [uploadModalOpen, setUploadModalOpen] = useState(false)
    const [manualModalOpen, setManualModalOpen] = useState(false)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false)
    const [deletePayslipError, setDeletePayslipError] = useState('')
    const [hasOpenAIKey, setHasOpenAIKey] = useState(false)
    const [fyData, setFyData] = useState(null)
    
    // Month/Year state - will be set from latest payslip
    const [selectedMonth, setSelectedMonth] = useState(null)
    const [selectedYear, setSelectedYear] = useState(null)
    const [latestMonth, setLatestMonth] = useState(null)
    const [latestYear, setLatestYear] = useState(null)
    const skipMonthFetchRef = useRef(false)
    
    const currentDate = new Date()
    const [fyYear, setFyYear] = useState(currentDate.getMonth() >= 3 ? currentDate.getFullYear() : currentDate.getFullYear() - 1)

    const fetchBudgetIncome = async () => {
        try {
            const res = await axios.get('/api/budget/default_user')
            if (res.data && Object.keys(res.data).length > 0) {
                setBudgetSalary(res.data.salary ?? null)
                setSalarySkippedAdditional(Boolean(res.data.salary_skipped_additional))
                setSalaryPayslipLabel(
                    payslipMonthLabel(
                        res.data.salary_payslip_year,
                        res.data.salary_payslip_month,
                        formatDateSafe,
                    ),
                )
            }
        } catch (err) {
            console.error('Failed to fetch budget income', err)
        }
    }

    // Load latest payslip, budget income, and OpenAI key status on mount
    useEffect(() => {
        loadLatestPayslip()
        fetchBudgetIncome()
        axios.get('/api/auth/user/settings/openai-key')
            .then(res => setHasOpenAIKey(res.data.has_key))
            .catch(() => {})
    }, [])

    // Load specific payslip when month/year changes (after initial load)
    useEffect(() => {
        if (!selectedMonth || !selectedYear) return
        if (skipMonthFetchRef.current) {
            skipMonthFetchRef.current = false
            return
        }
        loadPayslip(selectedYear, selectedMonth)
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
            skipMonthFetchRef.current = true
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
            setInitialLoading(false)
        }
    }

    const loadPayslip = async (year, month) => {
        setPayslipLoading(true)
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
            setPayslipLoading(false)
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
        skipMonthFetchRef.current = true
        setSelectedMonth(uploadedPayslip.month)
        setSelectedYear(uploadedPayslip.year)
        setLatestMonth(uploadedPayslip.month)
        setLatestYear(uploadedPayslip.year)
        fetchFinancialYearData()
        fetchBudgetIncome()
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
            setDeletePayslipError('')
            
            // After deletion, try to load latest payslip again
            await loadLatestPayslip()
            
            // Refresh financial year data and budget income
            fetchFinancialYearData()
            fetchBudgetIncome()
        } catch (err) {
            console.error("Failed to delete payslip", err)
            setDeletePayslipError(err.response?.data?.detail || 'Failed to delete payslip. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ]

    const budgetIncomeHint = salarySkippedAdditional
        ? `${salaryPayslipLabel || 'Last normal payslip'} · bonus excluded`
        : salaryPayslipLabel || 'Latest payslip'
    const hasBudgetIncomeSource = Boolean(salaryPayslipLabel)
    const showBudgetIncomeColumn = (budgetSalary != null && budgetSalary > 0) || hasBudgetIncomeSource

    // First visit — no month selected yet
    if (initialLoading) {
        return (
            <div className="mx-auto max-w-[1080px] space-y-8">
                <div>
                    <h1 className={paperTitle}>Payslip</h1>
                    <p className={`mt-1 ${paperEyebrow}`}>Upload a monthly PDF or enter the figures yourself.</p>
                </div>
                <PaperCard className="p-8 text-center sm:p-12" aria-busy="true">
                    <p className="text-sm text-[var(--paper-muted)]">Loading…</p>
                </PaperCard>
            </div>
        )
    }

    // Empty state - no payslips
    if (!payslipData && !selectedMonth && !selectedYear) {
        return (
            <div className="mx-auto max-w-[1080px] space-y-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className={paperTitle}>Payslip</h1>
                        <p className={`mt-1 ${paperEyebrow}`}>Upload a monthly PDF or enter the figures yourself.</p>
                    </div>
                    <Link to="/budget" className={btnGhost}>
                        <ArrowLeft className="h-4 w-4" />
                        Budget
                    </Link>
                </div>

                <PaperCard className="p-8 text-center sm:p-12">
                    <h2 className="text-xl font-semibold text-[var(--paper-ink)]">No payslips yet</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-[var(--paper-muted)]">
                        Start with this month’s figures. You can edit every line after saving.
                    </p>
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button type="button" onClick={() => setUploadModalOpen(true)} className={btnPrimary}>
                            <Upload className="h-4 w-4" />
                            Upload payslip
                        </button>
                        <button type="button" onClick={() => setManualModalOpen(true)} className={btnGhost}>
                            <PenLine className="h-4 w-4" />
                            Enter manually
                        </button>
                    </div>
                </PaperCard>

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
            <div className="mx-auto max-w-[1080px] space-y-8">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                        <p className={paperEyebrow}>Payslip</p>
                        <div className="flex items-center gap-4 text-sm">
                            <Link to="/budget" className="cursor-pointer text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)]">
                                Budget
                            </Link>
                        </div>
                    </div>
                    <MonthHeader
                        monthLabel={`${monthNames[selectedMonth - 1]} ${selectedYear}`}
                        onPrev={() => handleMonthChange(-1)}
                        onNext={() => handleMonthChange(1)}
                    />
                </div>

                {error ? <p className="text-sm text-[var(--paper-brick)]">{error}</p> : null}

                {payslipLoading ? (
                    <PaperCard className="p-8 text-center sm:p-12" aria-busy="true">
                        <p className="text-sm text-[var(--paper-muted)]">Loading…</p>
                    </PaperCard>
                ) : (
                <PaperCard className="p-8 text-center sm:p-12">
                    <h2 className="text-xl font-semibold text-[var(--paper-ink)]">No payslip this month</h2>
                    <p className="mt-2 text-sm text-[var(--paper-muted)]">
                        Add one for {monthNames[selectedMonth - 1]} {selectedYear}.
                    </p>
                    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                        <button type="button" onClick={() => setUploadModalOpen(true)} className={btnPrimary}>
                            <Upload className="h-4 w-4" />
                            Upload
                        </button>
                        <button type="button" onClick={() => setManualModalOpen(true)} className={btnGhost}>
                            <PenLine className="h-4 w-4" />
                            Enter manually
                        </button>
                    </div>
                </PaperCard>
                )}

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
    const totalDeductions =
        (payslipData.paye || 0) +
        (payslipData.uif_employee_portion || 0) +
        totalPersonalDeduct +
        totalCompanyContrib
    const hasBonus = hasAdditionalIncome(payslipData)
    const fyMonths = fyData?.months?.filter((month) => month.has_data) || []

    return (
        <div className="mx-auto max-w-[1080px] space-y-8">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                    <p className={paperEyebrow}>
                        {payslipLoading
                            ? 'Payslip'
                            : `${payslipData.company_name || 'Payslip'}${payslipData.title ? ` · ${payslipData.title}` : ''}`}
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
                        {saving ? <span className="text-xs text-[var(--paper-olive)]">Saving…</span> : null}
                        <button
                            type="button"
                            onClick={() => setUploadModalOpen(true)}
                            className="cursor-pointer text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)]"
                        >
                            Upload
                        </button>
                        <button
                            type="button"
                            onClick={() => setManualModalOpen(true)}
                            className="cursor-pointer text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)]"
                        >
                            Enter manually
                        </button>
                        <Link to="/budget" className="cursor-pointer text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)]">
                            Budget
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setDeletePayslipError('')
                                setDeleteModalOpen(true)
                            }}
                            className="cursor-pointer text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-brick)]"
                        >
                            Delete
                        </button>
                    </div>
                </div>
                <MonthHeader
                    monthLabel={`${monthNames[selectedMonth - 1]} ${selectedYear}`}
                    onPrev={() => handleMonthChange(-1)}
                    onNext={() => handleMonthChange(1)}
                    badge={isLatest ? 'Latest' : null}
                />
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmDeleteModal
                isOpen={deleteModalOpen}
                onClose={() => {
                    setDeleteModalOpen(false)
                    setDeletePayslipError('')
                }}
                onConfirm={handleDeletePayslip}
                title="Are you sure you want to delete this payslip?"
                message="This will permanently remove all payslip data for this month."
                monthYear={`${monthNames[selectedMonth - 1]} ${selectedYear}`}
                actionError={deletePayslipError}
            />

            <PayslipUploadModal
                isOpen={uploadModalOpen}
                onClose={() => setUploadModalOpen(false)}
                onSuccess={handleUploadSuccess}
                initialMonth={selectedMonth}
                initialYear={selectedYear}
                isUpdate={true}
                hasOpenAIKey={hasOpenAIKey}
            />
            <ManualPayslipModal
                isOpen={manualModalOpen}
                onClose={() => setManualModalOpen(false)}
                onSuccess={handleUploadSuccess}
                initialMonth={selectedMonth}
                initialYear={selectedYear}
            />

            {error ? <p className="text-sm text-[var(--paper-brick)]">{error}</p> : null}

            {payslipLoading ? (
                <PaperCard className="p-8 text-center sm:p-12" aria-busy="true">
                    <p className="text-sm text-[var(--paper-muted)]">Loading…</p>
                </PaperCard>
            ) : (
            <>
            <PaperCard className="overflow-hidden p-5 sm:p-7">
                <div className={`grid grid-cols-1 gap-6 ${showBudgetIncomeColumn ? 'sm:grid-cols-2' : ''}`}>
                    <div>
                        <p className={paperEyebrow}>Paid this month</p>
                        <BlurredValue>
                            <p className={`mt-2 text-4xl text-[var(--paper-ink)] ${paperMoney}`}>
                                {formatCurrency(payslipData.net_pay)}
                            </p>
                        </BlurredValue>
                        {hasBonus ? (
                            <p className="mt-4 text-sm leading-relaxed text-[var(--paper-muted)]">
                                This month includes additional income of {formatCurrency(totalAdditionalIncome)}.
                                The monthly budget uses your last payslip that did not have a bonus.
                            </p>
                        ) : null}
                    </div>
                    {showBudgetIncomeColumn ? (
                        <div>
                            <p className={paperEyebrow}>Monthly budget income</p>
                            <BlurredValue>
                                <p className={`mt-2 text-4xl text-[var(--paper-ink)] ${paperMoney}`}>
                                    {formatCurrency(budgetSalary ?? 0)}
                                </p>
                            </BlurredValue>
                            <p className="mt-4 text-sm text-[var(--paper-muted)]">{budgetIncomeHint}</p>
                        </div>
                    ) : null}
                </div>
                <div className="mt-6 space-y-5 border-t border-[var(--paper-line)] pt-5">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                        <Stat label="Gross" value={payslipData.gross_salary} tone={paperMoneyTone(1)} />
                        <Stat label="Additional income" value={totalAdditionalIncome} tone={paperMoneyTone(1)} />
                        {totalCompanyContrib > 0 ? (
                            <Stat label="Company contributions" value={totalCompanyContrib} />
                        ) : null}
                        <Stat label="Cost to company" value={totalIncome} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                        <Stat label="PAYE" value={payslipData.paye} tone={paperMoneyTone(-1)} />
                        {(payslipData.uif_employee_portion || 0) > 0 ? (
                            <Stat label="UIF" value={payslipData.uif_employee_portion} tone={paperMoneyTone(-1)} />
                        ) : null}
                        {totalPersonalDeduct > 0 ? (
                            <Stat label="Personal deductions" value={totalPersonalDeduct} tone={paperMoneyTone(-1)} />
                        ) : null}
                        <Stat label="Deductions" value={totalDeductions} tone={paperMoneyTone(-1)} />
                    </div>
                </div>
            </PaperCard>

            <PaperCard className="p-5 sm:p-7">
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
                    <div className="space-y-10">
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Earnings</h2>
                            <div className={`mt-3 ${paperDivider}`}>
                                <EditableField
                                    label="Gross salary"
                                    value={payslipData.gross_salary}
                                    onSave={(value) => handleUpdatePayslip('gross_salary', parseFloat(value))}
                                />
                                <EditableTextField
                                    label="Job title"
                                    value={payslipData.title || ''}
                                    onSave={(value) => handleUpdatePayslip('title', value)}
                                />
                                <EditableTextField
                                    label="Company"
                                    value={payslipData.company_name || ''}
                                    onSave={(value) => handleUpdatePayslip('company_name', value)}
                                />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Additional income</h2>
                            <div className="mt-3">
                                <ItemList
                                    items={additionalIncome}
                                    onAdd={handleAddAdditionalIncome}
                                    placeholder="Bonus, commission..."
                                />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Company contributions</h2>
                            <p className="mt-1 text-sm text-[var(--paper-muted)]">Counted in cost to company, not take-home.</p>
                            <div className="mt-3">
                                <ItemList
                                    items={companyContributions}
                                    onDelete={handleDeleteItem}
                                    onUpdate={handleUpdateItem}
                                    onAdd={(desc, amt) => handleAddItem(desc, amt, 'company_contribution')}
                                    placeholder="Pension, medical aid..."
                                />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-10 lg:border-l lg:border-[var(--paper-line)] lg:pl-12">
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Personal deductions</h2>
                            <div className="mt-3">
                                <ItemList
                                    items={personalDeductions}
                                    onDelete={handleDeleteItem}
                                    onUpdate={handleUpdateItem}
                                    onAdd={(desc, amt) => handleAddItem(desc, amt, 'personal_deduction')}
                                    placeholder="Medical aid, union dues..."
                                />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--paper-ink)]">Tax and statutory</h2>
                            <div className={`mt-3 ${paperDivider}`}>
                                <EditableField
                                    label="PAYE (tax)"
                                    value={payslipData.paye}
                                    onSave={(value) => handleUpdatePayslip('paye', parseFloat(value))}
                                />
                                <EditableField
                                    label="UIF (employee)"
                                    value={payslipData.uif_employee_portion}
                                    onSave={(value) => handleUpdatePayslip('uif_employee_portion', parseFloat(value))}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </PaperCard>

            {/* Financial Year Summary */}
            {fyData && fyMonths.length > 0 ? (
                <div className="space-y-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--paper-ink)]">
                                Financial year {fyData.financial_year}
                            </h2>
                            <p className={`mt-1 ${paperEyebrow}`}>
                                {fyMonths.length} month{fyMonths.length === 1 ? '' : 's'}
                            </p>
                        </div>
                        <select
                            value={fyYear}
                            onChange={(e) => setFyYear(parseInt(e.target.value))}
                            className="cursor-pointer rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2 text-sm text-[var(--paper-ink)]"
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

                    <PaperCard className="overflow-hidden">
                        <dl className="grid grid-cols-1 divide-y divide-[var(--paper-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                            <div className="p-5 sm:p-6">
                                <dt className={paperEyebrow}>YTD gross</dt>
                                <dd className={`mt-2 text-2xl text-[var(--paper-ink)] ${paperMoney}`}>
                                    <BlurredValue>{formatCurrency(fyData.total_gross_income)}</BlurredValue>
                                </dd>
                            </div>
                            <div className="p-5 sm:p-6">
                                <dt className={paperEyebrow}>YTD PAYE</dt>
                                <dd className={`mt-2 text-2xl ${paperMoney} ${paperMoneyTone(-1)}`}>
                                    <BlurredValue>{formatCurrency(fyData.total_paye)}</BlurredValue>
                                </dd>
                            </div>
                            <div className="p-5 sm:p-6">
                                <dt className={paperEyebrow}>YTD take-home</dt>
                                <dd className={`mt-2 text-2xl text-[var(--paper-ink)] ${paperMoney}`}>
                                    <BlurredValue>{formatCurrency(fyData.total_net_pay)}</BlurredValue>
                                </dd>
                            </div>
                        </dl>
                    </PaperCard>

                    {fyMonths.length >= 2 ? (
                        <PaperCard className={`p-5 sm:p-6 ${blurSensitiveValues ? 'blur-[5px] select-none' : ''}`}>
                            <h3 className="text-base font-semibold text-[var(--paper-ink)]">Monthly trend</h3>
                            <p className="mt-1 text-sm text-[var(--paper-muted)]">Take-home and PAYE</p>
                            <div className="mt-4 h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={fyMonths}>
                                        <CartesianGrid stroke="var(--paper-line)" vertical={false} />
                                        <XAxis
                                            dataKey="month_name"
                                            tick={{ fontSize: 12, fill: 'var(--paper-muted)' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis tick={{ fontSize: 12, fill: 'var(--paper-muted)' }} axisLine={false} tickLine={false} width={72} />
                                        <Tooltip content={<PaperChartTooltip />} />
                                        <Legend wrapperStyle={{ color: 'var(--paper-muted)', fontSize: 12 }} />
                                        <Line type="monotone" dataKey="net_pay" stroke={PAPER_CHART.olive} strokeWidth={2} name="Take-home" dot={false} />
                                        <Line type="monotone" dataKey="paye" stroke={PAPER_CHART.khaki} strokeWidth={2} name="PAYE" strokeDasharray="4 4" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </PaperCard>
                    ) : null}
                </div>
            ) : null}
            </>
            )}
        </div>
    )
}

function MonthHeader({ monthLabel, onPrev, onNext, badge }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onPrev} className="cursor-pointer rounded-md p-1.5 text-[var(--paper-muted)] hover:text-[var(--paper-ink)]" aria-label="Previous month">
                <ChevronLeft className="h-6 w-6" />
            </button>
            <h1 className={paperTitle}>{monthLabel}</h1>
            <button type="button" onClick={onNext} className="cursor-pointer rounded-md p-1.5 text-[var(--paper-muted)] hover:text-[var(--paper-ink)]" aria-label="Next month">
                <ChevronRight className="h-6 w-6" />
            </button>
            {badge ? <span className="text-sm text-[var(--paper-muted)]">{badge}</span> : null}
        </div>
    )
}

function Stat({ label, value, tone }) {
    return (
        <div>
            <p className={paperEyebrow}>{label}</p>
            <p className={`mt-1 text-sm font-medium tabular-nums ${tone || 'text-[var(--paper-ink)]'}`}>
                <BlurredValue>{formatCurrency(value)}</BlurredValue>
            </p>
        </div>
    )
}

function PaperChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] shadow-none">
            <p className="text-[var(--paper-muted)]">{label}</p>
            <ul className="mt-2 space-y-1">
                {payload.map((row) => (
                    <li key={row.dataKey} className="flex items-center justify-between gap-6">
                        <span className="text-[var(--paper-muted)]">{row.name}</span>
                        <span className="tabular-nums">{formatCurrency(row.value)}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function EditableField({ label, value, onSave }) {
    const [tempValue, setTempValue] = useState(value)

    useEffect(() => {
        setTempValue(value)
    }, [value])

    const handleSave = () => {
        onSave(tempValue)
    }

    return (
        <div className="flex items-center justify-between gap-2 py-3">
            <label className="min-w-0 flex-1 text-sm text-[var(--paper-ink)]">{label}</label>
            <BlurredValue as="div" className="flex w-24 shrink-0 items-center gap-1 rounded-md focus-within:ring-2 focus-within:ring-[var(--paper-accent)]/20 sm:w-28">
                <span className="text-sm font-mono text-[var(--paper-muted)]">R</span>
                <input
                    type="number"
                    inputMode="decimal"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={handleSave}
                    onWheel={(e) => e.currentTarget.blur()}
                    onKeyDown={amountKeyDown(() => handleSave())}
                    className={`${hideNumberSpinners} w-full min-w-0 border-none bg-transparent py-1 pr-1 text-right font-mono text-sm tabular-nums text-[var(--paper-ink)] outline-none sm:text-base`}
                />
            </BlurredValue>
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
        <div className="flex items-center justify-between gap-4 py-3">
            <label className="shrink-0 text-sm text-[var(--paper-ink)]">{label}</label>
            <BlurredValue as="div" className="min-w-0 flex-1">
                <input
                    type="text"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="w-full rounded-md border-none bg-transparent px-2 py-1 text-right text-sm text-[var(--paper-ink)] outline-none transition-all focus:ring-2 focus:ring-[var(--paper-accent)]/20 sm:text-base"
                    placeholder={`Enter ${label.toLowerCase()}`}
                />
            </BlurredValue>
        </div>
    )
}

function ItemList({ items, onDelete, onUpdate, onAdd, placeholder }) {
    const [newDescription, setNewDescription] = useState('')
    const [newAmount, setNewAmount] = useState('')

    const handleAdd = () => {
        if (newDescription && newAmount) {
            onAdd(newDescription, newAmount)
            setNewDescription('')
            setNewAmount('')
        }
    }

    return (
        <div className={paperDivider}>
            {items.map(item => (
                <EditableItem
                    key={item.id}
                    item={item}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                />
            ))}

            <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center">
                <input
                    placeholder={placeholder || "Add item..."}
                    className={`${fieldInput} min-h-[40px] flex-1`}
                    value={newDescription}
                    onChange={e => setNewDescription(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <BlurredValue as="div" className="relative w-full sm:w-36">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">R</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        placeholder="0.00"
                        className={`${fieldInput} ${hideNumberSpinners} pl-7 text-right tabular-nums`}
                        value={newAmount}
                        onChange={e => setNewAmount(e.target.value)}
                        onBlur={handleAdd}
                        onWheel={(e) => e.currentTarget.blur()}
                        onKeyDown={amountKeyDown(() => handleAdd())}
                    />
                </BlurredValue>
                <button type="button" onClick={handleAdd} className={btnPrimary}>
                    Add
                </button>
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
        <div className="group flex flex-row items-center gap-2 py-3">
                <input
                className="min-w-0 flex-1 rounded-md border-none bg-transparent px-2 py-1 text-sm text-[var(--paper-ink)] outline-none transition-all focus:ring-2 focus:ring-[var(--paper-accent)]/20 sm:text-base"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => description !== item.description && onUpdate?.(item.id, 'description', description)}
                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            />
            <BlurredValue as="div" className="flex w-24 shrink-0 items-center gap-1 rounded-md focus-within:ring-2 focus-within:ring-[var(--paper-accent)]/20 sm:w-28">
                <span className="text-sm font-mono text-[var(--paper-muted)]">R</span>
                <input
                    type="number"
                    inputMode="decimal"
                    className={`${hideNumberSpinners} w-full min-w-0 border-none bg-transparent py-1 pr-1 text-right font-mono text-sm tabular-nums text-[var(--paper-ink)] outline-none sm:text-base`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onBlur={() => amount !== item.amount && onUpdate?.(item.id, 'amount', amount)}
                    onWheel={(e) => e.currentTarget.blur()}
                    onKeyDown={amountKeyDown((e) => e.target.blur())}
                />
            </BlurredValue>
            {onDelete ? (
                <button
                    onClick={() => onDelete(item.id)}
                    className="cursor-pointer rounded-md p-2 text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-brick)] sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Delete item"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            ) : null}
        </div>
    )
}
