import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react'
import BlurredValue from './BlurredValue'
import { formatCurrency } from '../utils/numberFormatting'
import { paperEyebrow, paperMoney, paperMoneyTone } from './appUi'

const btnBase = 'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const fieldInput = 'w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const hideNumberSpinners = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

export default function PayslipReviewModal({ isOpen, onClose, onConfirm, extractedData, monthYear }) {
    const [title, setTitle] = useState('')
    const [companyName, setCompanyName] = useState('')
    const [grossSalary, setGrossSalary] = useState(0)
    const [paye, setPaye] = useState(0)
    const [uif, setUif] = useState(0)
    const [netPay, setNetPay] = useState(0)
    const [companyContributions, setCompanyContributions] = useState([])
    const [personalDeductions, setPersonalDeductions] = useState([])
    const [additionalIncome, setAdditionalIncome] = useState([])
    const [confirming, setConfirming] = useState(false)

    useEffect(() => {
        if (extractedData) {
            setTitle(extractedData.title || '')
            setCompanyName(extractedData.company_name || '')
            setGrossSalary(extractedData.gross_salary || 0)
            setPaye(extractedData.paye || 0)
            setUif(extractedData.uif_employee_portion || 0)
            setNetPay(extractedData.net_pay || 0)
            setCompanyContributions(extractedData.company_contributions || [])
            setPersonalDeductions(extractedData.other_deductions || [])
            setAdditionalIncome(extractedData.additional_income || [])
        }
    }, [extractedData])

    const handleConfirm = async () => {
        setConfirming(true)
        try {
            const normalizeItems = (list) => (list || []).map((item) => ({
                description: item?.description ?? '',
                amount: typeof item?.amount === 'number' ? item.amount : parseFloat(item?.amount) || 0,
            }))
            const confirmedData = {
                title,
                company_name: companyName,
                gross_salary: parseFloat(grossSalary),
                paye: parseFloat(paye),
                uif_employee_portion: parseFloat(uif),
                net_pay: parseFloat(netPay),
                company_contributions: normalizeItems(companyContributions),
                other_deductions: normalizeItems(personalDeductions),
                additional_income: normalizeItems(additionalIncome),
            }
            await onConfirm(confirmedData)
        } finally {
            setConfirming(false)
        }
    }

    const updateItem = (list, setList, index, field, value) => {
        const newList = [...list]
        newList[index][field] = field === 'amount' ? parseFloat(value) || 0 : value
        setList(newList)
    }

    const deleteItem = (list, setList, index) => {
        setList(list.filter((_, i) => i !== index))
    }

    const addItem = (list, setList) => {
        setList([...list, { description: '', amount: 0 }])
    }

    const totalAdditionalIncome = additionalIncome.reduce((sum, item) => sum + (item.amount || 0), 0)
    const totalCompanyContrib = companyContributions.reduce((sum, item) => sum + (item.amount || 0), 0)
    const totalPersonalDeduct = personalDeductions.reduce((sum, item) => sum + (item.amount || 0), 0)
    
    const costToCompany = grossSalary + totalAdditionalIncome + totalCompanyContrib
    const calculatedNetPay = grossSalary + totalAdditionalIncome - paye - uif - totalPersonalDeduct

    if (!isOpen) return null

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="payslip-review-title"
                className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)]"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--paper-line)] px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="h-6 w-6 text-[var(--paper-olive)]" aria-hidden="true" />
                        <div>
                            <h2 id="payslip-review-title" className="text-lg font-semibold text-[var(--paper-ink)]">
                                Review Extracted Data
                            </h2>
                            <p className={paperEyebrow}>
                                {monthYear} — Review and edit before saving
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center text-[var(--paper-muted)] transition-colors hover:text-[var(--paper-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={confirming}
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                {/* Content */}
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 text-[var(--paper-ink)] sm:p-6">
                    <div className="flex items-start gap-3 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
                        <div className="text-sm text-[var(--paper-muted)]">
                            <strong className="font-medium text-[var(--paper-ink)]">Please review the extracted data carefully.</strong>{' '}
                            AI extraction may not be 100% accurate. You can edit any values before confirming.
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {/* LEFT COLUMN - Input Fields */}
                        <div className="space-y-6 lg:col-span-2">
                            <Section title="Basic Information">
                                <EditField label="Job Title" value={title} onChange={setTitle} />
                                <EditField label="Company Name" value={companyName} onChange={setCompanyName} />
                                <NumericField label="Gross Salary" value={grossSalary} onChange={setGrossSalary} />
                            </Section>

                            <Section title="Additional Income">
                                <ItemList
                                    items={additionalIncome}
                                    onUpdate={(idx, field, val) => updateItem(additionalIncome, setAdditionalIncome, idx, field, val)}
                                    onDelete={(idx) => deleteItem(additionalIncome, setAdditionalIncome, idx)}
                                    onAdd={() => addItem(additionalIncome, setAdditionalIncome)}
                                    placeholder="Bonus, commission..."
                                />
                            </Section>

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

                            <Section title="Personal Deductions">
                                <ItemList
                                    items={personalDeductions}
                                    onUpdate={(idx, field, val) => updateItem(personalDeductions, setPersonalDeductions, idx, field, val)}
                                    onDelete={(idx) => deleteItem(personalDeductions, setPersonalDeductions, idx)}
                                    onAdd={() => addItem(personalDeductions, setPersonalDeductions)}
                                    placeholder="Medical aid (employee), union dues..."
                                />
                            </Section>

                            <Section title="Tax & Statutory Deductions">
                                <NumericField label="PAYE (Tax)" value={paye} onChange={setPaye} />
                                <NumericField label="UIF (Employee Portion)" value={uif} onChange={setUif} />
                            </Section>
                        </div>

                        {/* RIGHT COLUMN - Summary */}
                        <div className="lg:col-span-1">
                            <div className="sticky top-0 overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)]">
                                <div className="border-b border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4">
                                    <h3 className="font-semibold text-[var(--paper-ink)]">Summary</h3>
                                </div>
                                <div className="space-y-3 p-4 text-sm">
                                    <SummaryRow label="Gross Salary" value={grossSalary} tone="positive" />
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
                                            <span className={`${paperMoney} text-[var(--paper-ink)]`}>
                                                {formatCurrency(costToCompany)}
                                            </span>
                                        </BlurredValue>
                                    </div>
                                    
                                    <div className="my-2 border-t border-[var(--paper-line)]" />

                                    <SummaryRow label="PAYE (Tax)" value={paye} tone="negative" prefix="- " />
                                    <SummaryRow label="UIF" value={uif} tone="negative" prefix="- " />
                                    <SummaryRow label="Personal Deductions" value={totalPersonalDeduct} tone="negative" prefix="- " />

                                    <div className="my-3 border-t-2 border-[var(--paper-line)]" />

                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-[var(--paper-muted)]">
                                            Net Pay / Take Home (Editable)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-[var(--paper-muted)]">R</span>
                                            <input
                                                type="number"
                                                value={netPay}
                                                onChange={(e) => setNetPay(e.target.value)}
                                                className={`${fieldInput} ${hideNumberSpinners} pl-8 text-lg font-semibold`}
                                            />
                                        </div>
                                        
                                        {Math.abs(parseFloat(netPay) - calculatedNetPay) > 0.01 && (
                                            <div className="flex items-start gap-1 text-xs text-[var(--paper-brick)]">
                                                <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
                                                <span>
                                                    Calculated: <BlurredValue>{formatCurrency(calculatedNetPay)}</BlurredValue>
                                                    <br />Difference: <BlurredValue>{formatCurrency(Math.abs(parseFloat(netPay) - calculatedNetPay))}</BlurredValue>
                                                </span>
                                            </div>
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
                        onClick={onClose}
                        disabled={confirming}
                        className={btnGhost}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={confirming}
                        className={btnPrimary}
                    >
                        <CheckCircle className="h-4 w-4" aria-hidden="true" />
                        {confirming ? 'Saving...' : 'Confirm & Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

function Section({ title, children }) {
    return (
        <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--paper-ink)]">{title}</h3>
            <div className="space-y-3">
                {children}
            </div>
        </div>
    )
}

function EditField({ label, value, onChange }) {
    return (
        <div>
            <label className="mb-1 block text-sm text-[var(--paper-ink)]">
                {label}
            </label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
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
                    className={`${fieldInput} ${hideNumberSpinners} pl-8`}
                />
            </div>
        </div>
    )
}

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
                <div key={idx} className="group flex items-center gap-2 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-2">
                    <input
                        type="text"
                        value={item.description}
                        onChange={(e) => onUpdate(idx, 'description', e.target.value)}
                        placeholder={placeholder}
                        className={`${fieldInput} flex-1 py-1.5 text-sm`}
                    />
                    <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--paper-muted)]">R</span>
                        <input
                            type="number"
                            value={item.amount}
                            onChange={(e) => onUpdate(idx, 'amount', e.target.value)}
                            className={`${fieldInput} ${hideNumberSpinners} py-1.5 pl-6 pr-2 text-right text-sm`}
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

function SummaryRow({ label, value, tone = 'ink', prefix = '' }) {
    const toneClass =
        tone === 'positive'
            ? paperMoneyTone(1)
            : tone === 'negative'
              ? paperMoneyTone(-1)
              : 'text-[var(--paper-ink)]'

    return (
        <div className="flex items-center justify-between">
            <span className="text-[var(--paper-muted)]">{label}</span>
            <BlurredValue>
                <span className={`${paperMoney} font-medium ${toneClass}`}>
                    {prefix}{formatCurrency(value || 0)}
                </span>
            </BlurredValue>
        </div>
    )
}
