import { useState, useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Edit2, Plus, Trash2 } from 'lucide-react'
import BlurredValue from './BlurredValue'
import { formatCurrency } from '../utils/numberFormatting'

export default function PayslipReviewModal({ isOpen, onClose, onConfirm, extractedData, monthYear }) {
    const [title, setTitle] = useState('')
    const [companyName, setCompanyName] = useState('')
    const [grossSalary, setGrossSalary] = useState(0)
    const [paye, setPaye] = useState(0)
    const [uif, setUif] = useState(0)
    const [netPay, setNetPay] = useState(0)  // Editable
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
            setNetPay(extractedData.net_pay || 0)  // Use AI-extracted net pay
            setCompanyContributions(extractedData.company_contributions || [])
            setPersonalDeductions(extractedData.other_deductions || [])
            setAdditionalIncome(extractedData.additional_income || [])
        }
    }, [extractedData])

    const handleConfirm = async () => {
        setConfirming(true)
        try {
            // Normalize list items so backend always gets { description, amount }
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
                net_pay: parseFloat(netPay),  // Send user-confirmed net pay
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

    // Calculate totals for display
    const totalAdditionalIncome = additionalIncome.reduce((sum, item) => sum + (item.amount || 0), 0)
    const totalCompanyContrib = companyContributions.reduce((sum, item) => sum + (item.amount || 0), 0)
    const totalPersonalDeduct = personalDeductions.reduce((sum, item) => sum + (item.amount || 0), 0)
    
    // Cost to Company includes company contributions (what employer pays)
    const costToCompany = grossSalary + totalAdditionalIncome + totalCompanyContrib
    
    // Taxable income includes company contributions
    const taxableIncome = grossSalary + totalAdditionalIncome + totalCompanyContrib
    
    // Net Pay calculation: Company contributions are NOT added to net pay
    // They're paid directly by the company, not received by the employee
    const calculatedNetPay = grossSalary + totalAdditionalIncome - paye - uif - totalPersonalDeduct

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-5xl w-full mx-4 sm:mx-auto max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Review Extracted Data
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {monthYear} - Review and edit before saving
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        disabled={confirming}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-900 dark:text-blue-200">
                            <strong>Please review the extracted data carefully.</strong> AI extraction may not be 100% accurate. 
                            You can edit any values before confirming.
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* LEFT COLUMN - Input Fields */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Basic Info */}
                            <Section title="Basic Information">
                                <EditField label="Job Title" value={title} onChange={setTitle} />
                                <EditField label="Company Name" value={companyName} onChange={setCompanyName} />
                                <NumericField label="Gross Salary" value={grossSalary} onChange={setGrossSalary} />
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

                            {/* Tax Info */}
                            <Section title="Tax & Statutory Deductions">
                                <NumericField label="PAYE (Tax)" value={paye} onChange={setPaye} />
                                <NumericField label="UIF (Employee Portion)" value={uif} onChange={setUif} />
                            </Section>
                        </div>

                        {/* RIGHT COLUMN - Summary */}
                        <div className="lg:col-span-1">
                            <div className="sticky top-0 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                                <div className="bg-gray-50 dark:bg-gray-900/50 p-4 border-b border-gray-200 dark:border-gray-700">
                                    <h3 className="font-bold text-gray-900 dark:text-white">Summary</h3>
                                </div>
                                <div className="p-4 space-y-3 text-sm">
                                    {/* Income Section */}
                                    <SummaryRow label="Gross Salary" value={grossSalary} isGreen />
                                    <SummaryRow label="Additional Income" value={totalAdditionalIncome} isGreen />
                                    
                                    <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                                    
                                    {/* Company Contributions - Informational */}
                                    {totalCompanyContrib > 0 && (
                                        <div className="space-y-1">
                                            <SummaryRow label="Company Contributions" value={totalCompanyContrib} isInfo />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 italic pl-1">
                                                (Paid by employer, increases taxable income)
                                            </p>
                                            <div className="border-t border-dashed border-gray-300 dark:border-gray-600 my-2"></div>
                                        </div>
                                    )}
                                    
                                    {/* Cost to Company */}
                                    <div className="flex justify-between text-purple-700 dark:text-purple-400 font-semibold">
                                        <span>Cost to Company</span>
                                        <BlurredValue><span>{formatCurrency(costToCompany)}</span></BlurredValue>
                                    </div>
                                    
                                    <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>

                                    {/* Deductions */}
                                    <SummaryRow label="PAYE (Tax)" value={paye} isRed />
                                    <SummaryRow label="UIF" value={uif} isRed />
                                    <SummaryRow label="Personal Deductions" value={totalPersonalDeduct} isRed />

                                    <div className="border-t-2 border-gray-200 dark:border-gray-700 my-3"></div>

                                    {/* Editable Net Pay */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                                            Net Pay / Take Home (Editable)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R</span>
                                            <input
                                                type="number"
                                                value={netPay}
                                                onChange={(e) => setNetPay(e.target.value)}
                                                className="w-full pl-8 pr-3 py-2 text-lg font-bold border-2 border-blue-500 dark:border-blue-400 rounded-lg bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        
                                        {/* Show calculated value for comparison */}
                                        {Math.abs(parseFloat(netPay) - calculatedNetPay) > 0.01 && (
                                            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                                                <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
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
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <button
                        onClick={onClose}
                        disabled={confirming}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={confirming}
                        className="px-6 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        <CheckCircle className="w-4 h-4" />
                        {confirming ? 'Saving...' : 'Confirm & Save'}
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

function EditField({ label, value, onChange }) {
    return (
        <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {label}
            </label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
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
