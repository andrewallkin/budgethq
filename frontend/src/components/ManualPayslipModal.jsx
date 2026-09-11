import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, PenLine, Plus, Trash2, AlertCircle } from 'lucide-react'
import axios from 'axios'
import BlurredValue from './BlurredValue'
import { formatCurrency } from '../utils/numberFormatting'
import { paperEyebrow, paperMoney, paperMoneyTone } from './appUi'

const btnBase = 'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const fieldInput = 'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const hideNumberSpinners = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

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

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="manual-payslip-title"
                className="mx-4 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] sm:mx-auto"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <PenLine className="h-5 w-5 text-[var(--paper-muted)]" aria-hidden="true" />
                        <div>
                            <h2 id="manual-payslip-title" className="text-lg font-semibold text-[var(--paper-ink)]">
                                Enter Payslip Manually
                            </h2>
                            <p className={paperEyebrow}>
                                Fill in your payslip details directly
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close"
                        disabled={submitting}
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                {/* Content */}
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 text-[var(--paper-ink)] sm:p-6">
                    {/* Error */}
                    {error && (
                        <div
                            role="alert"
                            className="flex items-start gap-3 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4"
                        >
                            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--paper-brick)]" aria-hidden="true" />
                            <p className="text-sm text-[var(--paper-brick)]">{error}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {/* LEFT COLUMN */}
                        <div className="space-y-6 lg:col-span-2">
                            {/* Month & Year */}
                            <Section title="Month & Year">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-1 block text-sm text-[var(--paper-ink)]">
                                            Month
                                        </label>
                                        <select
                                            value={month}
                                            onChange={(e) => setMonth(parseInt(e.target.value))}
                                            className={fieldInput}
                                        >
                                            {monthNames.map((name, idx) => (
                                                <option key={idx + 1} value={idx + 1}>{name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm text-[var(--paper-ink)]">
                                            Year
                                        </label>
                                        <select
                                            value={year}
                                            onChange={(e) => setYear(parseInt(e.target.value))}
                                            className={fieldInput}
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
                                <div className="mb-3 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-3">
                                    <p className="text-sm font-medium text-[var(--paper-ink)]">
                                        Company contributions increase Cost to Company
                                    </p>
                                    <p className="mt-1 text-xs text-[var(--paper-muted)]">
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
                            <div className="sticky top-0 rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)]">
                                <div className="border-b border-[var(--paper-line)] p-4">
                                    <h3 className="font-semibold text-[var(--paper-ink)]">Summary</h3>
                                </div>
                                <div className="space-y-3 p-4 text-sm">
                                    <SummaryRow label="Gross Salary" value={grossVal} tone="positive" />
                                    <SummaryRow label="Additional Income" value={totalAdditionalIncome} tone="positive" />

                                    <div className="my-2 border-t border-[var(--paper-line)]" />

                                    {totalCompanyContrib > 0 && (
                                        <div className="space-y-1">
                                            <SummaryRow label="Company Contributions" value={totalCompanyContrib} tone="ink" />
                                            <p className="pl-1 text-xs italic text-[var(--paper-muted)]">
                                                (Paid by employer, increases taxable income)
                                            </p>
                                            <div className="my-2 border-t border-dashed border-[var(--paper-line)]" />
                                        </div>
                                    )}

                                    <div className="flex justify-between font-semibold text-[var(--paper-ink)]">
                                        <span>Cost to Company</span>
                                        <BlurredValue>
                                            <span className={paperMoney}>{formatCurrency(costToCompany)}</span>
                                        </BlurredValue>
                                    </div>

                                    <div className="my-2 border-t border-[var(--paper-line)]" />

                                    <SummaryRow label="PAYE (Tax)" value={payeVal} tone="negative" />
                                    <SummaryRow label="UIF" value={uifVal} tone="negative" />
                                    <SummaryRow label="Personal Deductions" value={totalPersonalDeduct} tone="negative" />

                                    <div className="my-3 border-t-2 border-[var(--paper-line)]" />

                                    {/* Net Pay — editable */}
                                    <div className="space-y-2">
                                        <label className="block text-sm text-[var(--paper-ink)]">
                                            Net Pay / Take Home *
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-[var(--paper-muted)]">R</span>
                                            <input
                                                type="number"
                                                value={netPay}
                                                onChange={(e) => setNetPay(e.target.value)}
                                                placeholder="0.00"
                                                className={`${fieldInput} ${hideNumberSpinners} pl-8 text-base font-semibold`}
                                            />
                                        </div>

                                        {/* Warn if entered net pay differs from calculated */}
                                        {netPay && Math.abs(netPayVal - calculatedNetPay) > 0.01 && (
                                            <div className="flex items-start gap-1 text-xs text-[var(--paper-muted)]">
                                                <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
                                                <span>
                                                    Calculated: <BlurredValue>{formatCurrency(calculatedNetPay)}</BlurredValue>
                                                    <br />
                                                    Difference:{' '}
                                                    <BlurredValue>
                                                        <span className="text-[var(--paper-brick)]">
                                                            {formatCurrency(Math.abs(netPayVal - calculatedNetPay))}
                                                        </span>
                                                    </BlurredValue>
                                                </span>
                                            </div>
                                        )}

                                        {/* Show calculated as hint when field is empty */}
                                        {!netPay && calculatedNetPay > 0 && (
                                            <p className="text-xs text-[var(--paper-muted)]">
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
                <div className="flex items-center justify-end gap-3 border-t border-[var(--paper-line)] bg-[var(--paper-card)] px-5 py-4 sm:px-6">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={submitting}
                        className={btnGhost}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className={btnPrimary}
                    >
                        <PenLine className="h-4 w-4" aria-hidden="true" />
                        {submitting ? 'Saving...' : 'Save Payslip'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

// Sub-components

function Section({ title, children }) {
    return (
        <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--paper-ink)]">{title}</h3>
            <div className="space-y-3">
                {children}
            </div>
        </div>
    )
}

function EditField({ label, value, onChange, placeholder }) {
    return (
        <div>
            <label className="mb-1 block text-sm text-[var(--paper-ink)]">
                {label}
            </label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={fieldInput}
            />
        </div>
    )
}

function NumericField({ label, value, onChange }) {
    return (
        <div>
            <label className="mb-1 block text-sm text-[var(--paper-ink)]">
                {label}
            </label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--paper-muted)]">R</span>
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="0.00"
                    className={`${fieldInput} ${hideNumberSpinners} pl-8`}
                />
            </div>
        </div>
    )
}

const itemFieldInput = 'rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-2 py-1.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'

function ItemList({ items, onUpdate, onDelete, onAdd, placeholder }) {
    if (items.length === 0) {
        return (
            <div className="py-4 text-center">
                <p className="mb-2 text-sm text-[var(--paper-muted)]">No items</p>
                <button
                    type="button"
                    onClick={onAdd}
                    className="mx-auto inline-flex min-h-[40px] items-center gap-1 text-xs font-medium text-[var(--paper-ink)] hover:underline"
                >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Add Item
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {items.map((item, idx) => (
                <div key={idx} className="group flex items-center gap-2 rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] p-2">
                    <input
                        type="text"
                        value={item.description}
                        onChange={(e) => onUpdate(idx, 'description', e.target.value)}
                        placeholder={placeholder}
                        className={`${itemFieldInput} flex-1`}
                    />
                    <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--paper-muted)]">R</span>
                        <input
                            type="number"
                            value={item.amount}
                            onChange={(e) => onUpdate(idx, 'amount', e.target.value)}
                            placeholder="0.00"
                            className={`${itemFieldInput} ${hideNumberSpinners} w-full pl-6 pr-2 text-right`}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => onDelete(idx)}
                        aria-label="Remove item"
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-[var(--paper-muted)] opacity-0 transition-opacity hover:text-[var(--paper-brick)] group-hover:opacity-100"
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={onAdd}
                className="inline-flex min-h-[40px] items-center gap-1 text-xs font-medium text-[var(--paper-ink)] hover:underline"
            >
                <Plus className="h-3 w-3" aria-hidden="true" />
                Add Item
            </button>
        </div>
    )
}

function SummaryRow({ label, value, tone = 'muted' }) {
    let valueClass = 'text-[var(--paper-ink)]'
    if (tone === 'positive') valueClass = paperMoneyTone(1)
    else if (tone === 'negative') valueClass = paperMoneyTone(-1)

    return (
        <div className="flex items-center justify-between">
            <span className="text-[var(--paper-muted)]">{label}</span>
            <BlurredValue>
                <span className={`${paperMoney} ${valueClass}`}>
                    {tone === 'negative' && '- '}{formatCurrency(value || 0)}
                </span>
            </BlurredValue>
        </div>
    )
}
