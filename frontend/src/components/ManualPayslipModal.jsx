import { useState, useEffect } from 'react'
import { X, PenLine, Plus, Trash2, AlertCircle } from 'lucide-react'
import axios from 'axios'
import BlurredValue from './BlurredValue'
import { formatCurrency } from '../utils/numberFormatting'

export default function ManualPayslipModal({ isOpen, onClose, onSuccess, initialMonth, initialYear }) {
    const currentDate = new Date()
    const [month, setMonth] = useState(initialMonth || currentDate.getMonth() + 1)
    const [year, setYear] = useState(initialYear || currentDate.getFullYear())
    const [title, setTitle] = useState('')
    const [companyName, setCompanyName] = useState('')
    const [grossSalary, setGrossSalary] = useState('')
    const [paye, setPaye] = useState('')
    const [uif, setUif] = useState('')
    const [netPay, setNetPay] = useState('')
    const [companyContributions, setCompanyContributions] = useState([])
    const [personalDeductions, setPersonalDeductions] = useState([])
    const [additionalIncome, setAdditionalIncome] = useState([])
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    // Reset form whenever modal opens
    useEffect(() => {
        if (isOpen) {
            setMonth(initialMonth || currentDate.getMonth() + 1)
            setYear(initialYear || currentDate.getFullYear())
            setTitle('')
            setCompanyName('')
            setGrossSalary('')
            setPaye('')
            setUif('')
            setNetPay('')
            setCompanyContributions([])
            setPersonalDeductions([])
            setAdditionalIncome([])
            setError('')
        }
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    // Derived totals (live summary)
    const grossVal = parseFloat(grossSalary) || 0
    const payeVal = parseFloat(paye) || 0
    const uifVal = parseFloat(uif) || 0
    const netPayVal = parseFloat(netPay) || 0
    const totalAdditionalIncome = additionalIncome.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
    const totalCompanyContrib = companyContributions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
    const totalPersonalDeduct = personalDeductions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
    const costToCompany = grossVal + totalAdditionalIncome + totalCompanyContrib
    const calculatedNetPay = grossVal + totalAdditionalIncome - payeVal - uifVal - totalPersonalDeduct

    const updateItem = (list, setList, index, field, value) => {
        const newList = [...list]
        newList[index] = { ...newList[index], [field]: value }
        setList(newList)
    }

    const deleteItem = (list, setList, index) => {
        setList(list.filter((_, i) => i !== index))
    }

    const addItem = (list, setList) => {
        setList([...list, { description: '', amount: '' }])
    }

    const handleClose = () => {
        if (!submitting) onClose()
    }

    const handleSubmit = async () => {
        if (!grossSalary || !paye || !uif || !netPay) {
            setError('Please fill in all required fields: Gross Salary, PAYE, UIF, and Net Pay.')
            return
        }

        setSubmitting(true)
        setError('')

        const normalize = (list) =>
            list.map((item) => ({
                description: item.description || '',
                amount: parseFloat(item.amount) || 0,
            }))

        try {
            const response = await axios.post('/api/payslip/manual-entry', {
                year,
                month,
                title: title || null,
                company_name: companyName || null,
                gross_salary: parseFloat(grossSalary),
                paye: parseFloat(paye),
                uif_employee_portion: parseFloat(uif),
                net_pay: parseFloat(netPay),
                company_contributions: normalize(companyContributions),
                personal_deductions: normalize(personalDeductions),
                additional_income: normalize(additionalIncome),
            })

            if (onSuccess) onSuccess(response.data)
            onClose()
        } catch (err) {
            const detail = err.response?.data?.detail
            if (err.response?.status === 409) {
                setError(detail || 'A payslip already exists for this month. Delete it first or upload a replacement.')
            } else {
                setError(detail || 'Failed to save payslip. Please try again.')
            }
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen) return null

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ]
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-5xl w-full mx-4 sm:mx-auto max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
                    <div className="flex items-center gap-3">
                        <PenLine className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Enter Payslip Manually
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Fill in your payslip details directly
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        disabled={submitting}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-900 dark:text-red-200">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* LEFT COLUMN */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Month & Year */}
                            <Section title="Month & Year">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                            Month
                                        </label>
                                        <select
                                            value={month}
                                            onChange={(e) => setMonth(parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        >
                                            {monthNames.map((name, idx) => (
                                                <option key={idx + 1} value={idx + 1}>{name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                            Year
                                        </label>
                                        <select
                                            value={year}
                                            onChange={(e) => setYear(parseInt(e.target.value))}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                        >
                                            {years.map((y) => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </Section>

                            {/* Basic Info */}
                            <Section title="Basic Information">
                                <EditField
                                    label="Job Title"
                                    value={title}
                                    onChange={setTitle}
                                    placeholder="e.g. Software Engineer"
                                />
                                <EditField
                                    label="Company Name"
                                    value={companyName}
                                    onChange={setCompanyName}
                                    placeholder="e.g. Acme Corp"
                                />
                                <NumericField label="Gross Salary *" value={grossSalary} onChange={setGrossSalary} />
                            </Section>

                            {/* Additional Income */}
                            <Section title="Additional Income">
                                <ItemList
                                    items={additionalIncome}
                                    onUpdate={(idx, field, val) => updateItem(additionalIncome, setAdditionalIncome, idx, field, val)}
                                    onDelete={(idx) => deleteItem(additionalIncome, setAdditionalIncome, idx)}
                                    onAdd={() => addItem(additionalIncome, setAdditionalIncome)}
                                    placeholder="Bonus, commission..."
                                />
                            </Section>

                            {/* Company Contributions */}
                            <Section title="Company Contributions">
                                <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <p className="text-sm text-purple-900 dark:text-purple-100 font-medium">
                                        ℹ️ Company contributions increase Cost to Company
                                    </p>
                                    <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                                        These are paid by your employer (not to you) but increase your taxable income.
                                    </p>
                                </div>
                                <ItemList
                                    items={companyContributions}
                                    onUpdate={(idx, field, val) => updateItem(companyContributions, setCompanyContributions, idx, field, val)}
                                    onDelete={(idx) => deleteItem(companyContributions, setCompanyContributions, idx)}
                                    onAdd={() => addItem(companyContributions, setCompanyContributions)}
                                    placeholder="Pension, medical aid..."
                                />
                            </Section>

                            {/* Personal Deductions */}
                            <Section title="Personal Deductions">
                                <ItemList
                                    items={personalDeductions}
                                    onUpdate={(idx, field, val) => updateItem(personalDeductions, setPersonalDeductions, idx, field, val)}
                                    onDelete={(idx) => deleteItem(personalDeductions, setPersonalDeductions, idx)}
                                    onAdd={() => addItem(personalDeductions, setPersonalDeductions)}
                                    placeholder="Medical aid (employee), union dues..."
                                />
                            </Section>

                            {/* Tax & Statutory */}
                            <Section title="Tax & Statutory Deductions">
                                <NumericField label="PAYE (Tax) *" value={paye} onChange={setPaye} />
                                <NumericField label="UIF Employee Portion *" value={uif} onChange={setUif} />
                            </Section>
                        </div>

                        {/* RIGHT COLUMN - Summary */}
                        <div className="lg:col-span-1">
                            <div className="sticky top-0 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 border-b border-gray-200 dark:border-gray-700">
                                    <h3 className="font-bold text-gray-900 dark:text-white">Summary</h3>
                                </div>
                                <div className="p-4 space-y-3 text-sm">
                                    <SummaryRow label="Gross Salary" value={grossVal} isGreen />
                                    <SummaryRow label="Additional Income" value={totalAdditionalIncome} isGreen />

                                    <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>

                                    {totalCompanyContrib > 0 && (
                                        <div className="space-y-1">
                                            <SummaryRow label="Company Contributions" value={totalCompanyContrib} isInfo />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 italic pl-1">
                                                (Paid by employer, increases taxable income)
                                            </p>
                                            <div className="border-t border-dashed border-gray-300 dark:border-gray-600 my-2"></div>
                                        </div>
                                    )}

                                    <div className="flex justify-between text-purple-700 dark:text-purple-400 font-semibold">
                                        <span>Cost to Company</span>
                                        <BlurredValue><span>{formatCurrency(costToCompany)}</span></BlurredValue>
                                    </div>

                                    <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>

                                    <SummaryRow label="PAYE (Tax)" value={payeVal} isRed />
                                    <SummaryRow label="UIF" value={uifVal} isRed />
                                    <SummaryRow label="Personal Deductions" value={totalPersonalDeduct} isRed />

                                    <div className="border-t-2 border-gray-200 dark:border-gray-700 my-3"></div>

                                    {/* Net Pay — editable */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                                            Net Pay / Take Home *
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R</span>
                                            <input
                                                type="number"
                                                value={netPay}
                                                onChange={(e) => setNetPay(e.target.value)}
                                                placeholder="0.00"
                                                className="w-full pl-8 pr-3 py-2 text-lg font-bold border-2 border-blue-500 dark:border-blue-400 rounded-lg bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        {/* Warn if entered net pay differs from calculated */}
                                        {netPay && Math.abs(netPayVal - calculatedNetPay) > 0.01 && (
                                            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                                                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                                <span>
                                                    Calculated: <BlurredValue>{formatCurrency(calculatedNetPay)}</BlurredValue>
                                                    <br />Difference: <BlurredValue>{formatCurrency(Math.abs(netPayVal - calculatedNetPay))}</BlurredValue>
                                                </span>
                                            </div>
                                        )}

                                        {/* Show calculated as hint when field is empty */}
                                        {!netPay && calculatedNetPay > 0 && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Calculated: <BlurredValue>{formatCurrency(calculatedNetPay)}</BlurredValue>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        <PenLine className="w-4 h-4" />
                        {submitting ? 'Saving...' : 'Save Payslip'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Sub-components

function Section({ title, children }) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
            <div className="space-y-3">
                {children}
            </div>
        </div>
    )
}

function EditField({ label, value, onChange, placeholder }) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {label}
            </label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
        </div>
    )
}

function NumericField({ label, value, onChange }) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {label}
            </label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R</span>
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
            </div>
        </div>
    )
}

function ItemList({ items, onUpdate, onDelete, onAdd, placeholder }) {
    if (items.length === 0) {
        return (
            <div className="text-center py-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No items</p>
                <button
                    onClick={onAdd}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1 mx-auto"
                >
                    <Plus className="w-3 h-3" />
                    Add Item
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg group">
                    <input
                        type="text"
                        value={item.description}
                        onChange={(e) => onUpdate(idx, 'description', e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded text-gray-900 dark:text-white"
                    />
                    <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">R</span>
                        <input
                            type="number"
                            value={item.amount}
                            onChange={(e) => onUpdate(idx, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-6 pr-2 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded text-right text-gray-900 dark:text-white"
                        />
                    </div>
                    <button
                        onClick={() => onDelete(idx)}
                        className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ))}
            <button
                onClick={onAdd}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1"
            >
                <Plus className="w-3 h-3" />
                Add Item
            </button>
        </div>
    )
}

function SummaryRow({ label, value, isGreen, isRed, isInfo }) {
    let colorClass = ''
    if (isGreen) colorClass = 'text-green-600 dark:text-green-400'
    else if (isRed) colorClass = 'text-red-600 dark:text-red-400'
    else if (isInfo) colorClass = 'text-purple-600 dark:text-purple-400'

    return (
        <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
            <BlurredValue><span className={`font-medium ${colorClass}`}>
                {isRed && '- '}{formatCurrency(value || 0)}
            </span></BlurredValue>
        </div>
    )
}
