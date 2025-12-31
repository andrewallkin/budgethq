import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Plus, Trash2, Info, ArrowLeft, Check, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function SalaryPage() {
    const [loading, setLoading] = useState(true)
    const [salaryData, setSalaryData] = useState(null)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        fetchSalary()
    }, [])

    const fetchSalary = async () => {
        try {
            const res = await axios.get('/api/salary')
            setSalaryData(res.data)
            setLoading(false)
        } catch (err) {
            console.error("Failed to fetch salary", err)
            setError("Failed to load salary data")
            setLoading(false)
        }
    }

    const handleUpdateSettings = async (field, value) => {
        setSaving(true)
        try {
            await axios.put('/api/salary', {
                [field]: value
            })
            // Optimistic update or refetch
            setSalaryData(prev => ({ ...prev, [field]: value }))
            // Refetch to get calcs
            const res = await axios.get('/api/salary')
            setSalaryData(res.data)
        } catch (err) {
            console.error("Failed to update settings", err)
        } finally {
            setSaving(false)
        }
    }

    const handleAddItem = async (name, amount, type, isFringe = false) => {
        if (!name || !amount) return
        setSaving(true)
        try {
            await axios.post('/api/salary/item', {
                name,
                amount: parseFloat(amount),
                item_type: type,
                is_fringe: isFringe
            })
            fetchSalary()
        } catch (err) {
            console.error("Failed to add item", err)
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteItem = async (itemId) => {
        setSaving(true)
        try {
            await axios.delete(`/api/salary/item/${itemId}`)
            fetchSalary()
        } catch (err) {
            console.error("Failed to delete item", err)
        } finally {
            setSaving(false)
        }
    }

    const handleUpdateItem = async (itemId, field, value) => {
        setSaving(true)
        try {
            await axios.put(`/api/salary/item/${itemId}`, {
                [field]: field === 'amount' ? parseFloat(value) || 0 : value
            })
            // Optimistic update
            setSalaryData(prev => ({
                ...prev,
                items: prev.items.map(item =>
                    item.id === itemId ? { ...item, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : item
                )
            }))
            // Refetch for calcs
            const res = await axios.get('/api/salary')
            setSalaryData(res.data)
        } catch (err) {
            console.error("Failed to update item", err)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-8">Loading...</div>
    if (error) return <div className="p-8 text-red-600">{error}</div>

    // Filter Items
    const earnings = salaryData.items.filter(i => i.item_type === 'earning')
    const preTax = salaryData.items.filter(i => i.item_type === 'deduction_pre')
    const fringeBenefits = salaryData.items.filter(i => i.item_type === 'deduction_post' && i.is_fringe)
    const postTaxDeductions = salaryData.items.filter(i => i.item_type === 'deduction_post' && !i.is_fringe)

    return (
        <div className="max-w-6xl mx-auto space-y-8 p-4 lg:p-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link to="/budget" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payslip Details</h1>
                    <p className="text-sm text-gray-500">Configure your monthly income structure for accurate tax calc.</p>
                </div>
                {saving && <span className="ml-auto text-xs text-green-600 font-medium animate-pulse">Saving...</span>}
            </div>

            <div className="grid lg:grid-cols-3 gap-8">

                {/* LEFT COLUMN: INPUTS */}
                <div className="lg:col-span-2 space-y-8">

                    {/* 1. GROSS INCOME */}
                    <SectionContainer title="Gross Income" color="blue">
                        <div className="space-y-4">
                            {/* Hardcoded Basic Salary */}
                            <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-800/30">
                                <label className="block text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300 mb-1">
                                    Basic Monthly Salary
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R</span>
                                    <input
                                        type="number"
                                        defaultValue={salaryData.basic_salary}
                                        onBlur={(e) => handleUpdateSettings('basic_salary', parseFloat(e.target.value) || 0)}
                                        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                                        className="w-full pl-8 pr-4 py-3 text-lg font-bold bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        placeholder="0.00"
                                    />
                                </div>
                                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-2">
                                    Your fixed cash salary before any deductions.
                                </p>
                            </div>

                        </div>
                    </SectionContainer>

                    {/* 2. PRE-TAX DEDUCTIONS */}
                    <SectionContainer title="Pre-Tax Deductions" color="orange" description="Pension, RA, and other deductions that reduce taxable income.">
                        <ItemList
                            items={preTax}
                            onDelete={handleDeleteItem}
                            onUpdate={handleUpdateItem}
                            onAdd={(n, a) => handleAddItem(n, a, 'deduction_pre')}
                            color="orange"
                        />
                    </SectionContainer>

                    {/* 3. FRINGE BENEFITS */}
                    <SectionContainer title="Fringe Benefits" color="purple" description="Company contributions paid on your behalf (e.g. Med Aid, Pension).">
                        <div className="space-y-4">
                            {/* Global Settings for this section */}
                            <div className="flex items-center gap-4 bg-purple-50 dark:bg-purple-900/10 p-3 rounded-lg">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-900 dark:text-white">Medical Aid Members</label>
                                    <p className="text-xs text-gray-500">Main member + dependents (used for Tax Credits)</p>
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-16 p-2 text-center rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                                    value={salaryData.medical_aid_members}
                                    onChange={(e) => handleUpdateSettings('medical_aid_members', parseInt(e.target.value) || 0)}
                                />
                            </div>

                            <ComplexItemList
                                items={fringeBenefits}
                                onAdd={(n, a) => handleAddItem(n, a, 'deduction_post', true)}
                                onDelete={handleDeleteItem}
                                onUpdate={handleUpdateItem}
                                typeLabel="Fringe"
                                color="purple"
                            />
                        </div>
                    </SectionContainer>

                    {/* 4. POST-TAX DEDUCTIONS */}
                    <SectionContainer title="Post-Tax Deductions" color="indigo" description="Union Fees, Gap Cover, etc.">
                        <ItemList
                            items={postTaxDeductions}
                            onDelete={handleDeleteItem}
                            onUpdate={handleUpdateItem}
                            onAdd={(n, a) => handleAddItem(n, a, 'deduction_post', false)}
                            color="indigo"
                        />
                    </SectionContainer>

                    {/* 5. OTHER SETTINGS */}
                    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="block text-sm font-medium text-gray-900 dark:text-white">Age</label>
                                <p className="text-xs text-gray-500">Determines tax rebates (Under 65, 65-75, 75+).</p>
                            </div>
                            <input
                                type="number"
                                min="18" max="100"
                                className="w-16 p-2 text-center rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                                defaultValue={salaryData.age}
                                onBlur={(e) => handleUpdateSettings('age', parseInt(e.target.value) || 30)}
                            />
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: SUMMARY */}
                <div className="lg:col-span-1">
                    <div className="sticky top-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-900/50 p-4 border-b border-gray-100 dark:border-gray-700">
                            <h2 className="font-bold text-gray-900 dark:text-white">Calculated Payslip</h2>
                        </div>

                        <div className="p-6 space-y-4 text-sm">
                            <SummaryRow label="Gross Income" value={salaryData.gross_income} bold isGreen />

                            <div className="flex justify-between font-medium text-gray-700 dark:text-gray-300">
                                <span>Taxable Income</span>
                                <span>{formatCurrency(salaryData.taxable_income)}</span>
                            </div>

                            <div className="border-t border-dashed border-gray-200 dark:border-gray-700 my-2"></div>

                            <SummaryRow label="PAYE (Tax)" value={salaryData.deductions.paye} isMutedRed />
                            <SummaryRow label="UIF" value={salaryData.deductions.uif} isMutedRed />
                            <SummaryRow label="Pre-Tax Deductions" value={salaryData.deductions.pre_tax} isMutedRed />

                            <SummaryRow
                                label="Post-Tax Deductions"
                                value={(salaryData.deductions.fringe_benefits_deducted || 0) + (salaryData.deductions.post_tax || 0)}
                                isMutedRed
                            />
                            {salaryData.deductions.medical_credits_applied > 0 && (
                                <div className="text-xs text-green-600 text-right mt-[-4px] mb-2">
                                    (Incl. Med Credits: {formatCurrency(salaryData.deductions.medical_credits_applied)})
                                </div>
                            )}

                            <div className="border-t-2 border-gray-100 dark:border-gray-700 my-4"></div>

                            <div className="flex justify-between items-end">
                                <span className="text-gray-500 font-medium">Net Pay</span>
                                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                    {formatCurrency(salaryData.net_pay)}
                                </span>
                            </div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 text-center text-xs text-blue-700 dark:text-blue-300 font-medium">
                            Synced to Dashboard
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Sub-components

function SectionContainer({ title, color, description, children }) {
    const colors = {
        blue: "border-l-blue-500",
        orange: "border-l-orange-500",
        purple: "border-l-purple-500",
        indigo: "border-l-indigo-500"
    }

    return (
        <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 border-l-4 ${colors[color]}`}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{title}</h2>
            {description && <p className="text-sm text-gray-500 mb-6">{description}</p>}
            <div className="mt-4">{children}</div>
        </div>
    )
}

function ItemList({ items, onDelete, onUpdate, onAdd, color = 'blue' }) {
    const [newName, setNewName] = useState('')
    const [newAmount, setNewAmount] = useState('')

    const handleAdd = () => {
        if (newName && newAmount) {
            onAdd(newName, newAmount)
            setNewName('')
            setNewAmount('')
        }
    }

    const colorClasses = {
        blue: "focus:border-blue-500 ring-blue-500/20",
        orange: "focus:border-orange-500 ring-orange-500/20",
        purple: "focus:border-purple-500 ring-purple-500/20",
        indigo: "focus:border-indigo-500 ring-indigo-500/20"
    }

    const ringClass = colorClasses[color].split(' ')[1]
    const borderClass = colorClasses[color].split(' ')[0]

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

            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 mt-2">
                <input
                    placeholder="Add item name..."
                    className={`flex-1 px-4 py-2.5 text-sm bg-gray-50/50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-xl outline-none transition-all placeholder:text-gray-400 font-medium ${borderClass} focus:ring-4 ${ringClass}`}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <div className="relative w-36">
                    <span className="absolute left-3 top-3 text-gray-400 text-sm font-mono">R</span>
                    <input
                        type="number"
                        placeholder="0.00"
                        className={`w-full pl-7 pr-3 py-2.5 text-sm bg-gray-50/50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-right transition-all placeholder:text-gray-400 font-mono ${borderClass} focus:ring-4 ${ringClass}`}
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

function ComplexItemList({ items, onDelete, onUpdate, onAdd, typeLabel, color = 'purple' }) {
    const [newName, setNewName] = useState('')
    const [newAmount, setNewAmount] = useState('')

    const handleAdd = () => {
        if (newName && newAmount) {
            onAdd(newName, newAmount)
            setNewName('')
            setNewAmount('')
        }
    }

    const colorClasses = {
        blue: "focus:border-blue-500 ring-blue-500/20",
        orange: "focus:border-orange-500 ring-orange-500/20",
        purple: "focus:border-purple-500 ring-purple-500/20",
        indigo: "focus:border-indigo-500 ring-indigo-500/20"
    }

    const ringClass = colorClasses[color].split(' ')[1]
    const borderClass = colorClasses[color].split(' ')[0]

    return (
        <div className="space-y-3">
            {/* Header for list */}
            <div className="grid grid-cols-12 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 px-4">
                <div className="col-span-8">Description</div>
                <div className="col-span-3 text-right">Amount</div>
                <div className="col-span-1"></div>
            </div>

            {items.map(item => (
                <EditableComplexItem
                    key={item.id}
                    item={item}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                />
            ))}

            <div className="grid grid-cols-12 items-center gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50 px-1">
                <div className="col-span-8">
                    <input
                        placeholder="Add benefit..."
                        className={`w-full px-4 py-2.5 text-sm bg-gray-50/50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-xl outline-none transition-all placeholder:text-gray-400 font-medium ${borderClass} focus:ring-4 ${ringClass}`}
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                </div>
                <div className="col-span-3 relative">
                    <span className="absolute left-3 top-3 text-gray-400 text-sm font-mono">R</span>
                    <input
                        type="number"
                        placeholder="0.00"
                        className={`w-full pl-7 pr-3 py-2.5 text-sm bg-gray-50/50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-xl outline-none text-right transition-all placeholder:text-gray-400 font-mono ${borderClass} focus:ring-4 ${ringClass}`}
                        value={newAmount}
                        onChange={e => setNewAmount(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                </div>
                <div className="col-span-1 text-right">
                    <button
                        onClick={handleAdd}
                        className={`p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-gray-700 transition-all`}
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <p className="text-[10px] text-center text-gray-400 mt-2 font-medium tracking-wide">
                PRESS <span className="text-gray-500 dark:text-gray-300">ENTER</span> OR CLICK <span className="text-gray-500 dark:text-gray-300">+</span> TO SAVE
            </p>
        </div>
    )
}

function EditableItem({ item, onUpdate, onDelete }) {
    const [name, setName] = useState(item.name)
    const [amount, setAmount] = useState(item.amount)

    useEffect(() => {
        setName(item.name)
        setAmount(item.amount)
    }, [item.name, item.amount])

    return (
        <div className="group flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-700/30 rounded-xl hover:bg-white dark:hover:bg-gray-700 hover:shadow-md transition-all border border-transparent hover:border-gray-100 dark:hover:border-gray-600">
            <input
                className="flex-1 bg-transparent border-none focus:ring-2 focus:ring-blue-500/20 rounded px-2 py-1 font-medium text-gray-700 dark:text-gray-200 outline-none transition-all"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name !== item.name && onUpdate(item.id, 'name', name)}
                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            />
            <div className="relative w-32">
                <span className="absolute left-2 top-1.5 text-gray-400 text-xs font-mono">R</span>
                <input
                    type="number"
                    className="w-full pl-6 pr-2 py-1 bg-transparent border-none focus:ring-2 focus:ring-blue-500/20 rounded font-mono text-gray-900 dark:text-white text-right outline-none transition-all"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onBlur={() => amount !== item.amount && onUpdate(item.id, 'amount', amount)}
                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                />
            </div>
            <button
                onClick={() => onDelete(item.id)}
                className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    )
}

function EditableComplexItem({ item, onUpdate, onDelete }) {
    const [name, setName] = useState(item.name)
    const [amount, setAmount] = useState(item.amount)

    useEffect(() => {
        setName(item.name)
        setAmount(item.amount)
    }, [item.name, item.amount])

    return (
        <div className="group grid grid-cols-12 items-center gap-2 p-2 bg-white dark:bg-gray-800/50 rounded-xl hover:shadow-lg transition-all border border-gray-100 dark:border-gray-700">
            <div className="col-span-8">
                <input
                    className="w-full bg-transparent border-none focus:ring-2 focus:ring-purple-500/20 rounded px-2 py-1 font-medium text-gray-700 dark:text-gray-200 outline-none transition-all"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => name !== item.name && onUpdate(item.id, 'name', name)}
                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                />
            </div>
            <div className="col-span-3 relative">
                <span className="absolute left-1 top-1.5 text-gray-400 text-[10px] font-mono">R</span>
                <input
                    type="number"
                    className="w-full pl-4 pr-0 py-1 bg-transparent border-none focus:ring-2 focus:ring-purple-500/20 rounded font-mono text-gray-900 dark:text-white text-right outline-none transition-all"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onBlur={() => amount !== item.amount && onUpdate(item.id, 'amount', amount)}
                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                />
            </div>
            <div className="col-span-1 text-right">
                <button
                    onClick={() => onDelete(item.id)}
                    className="p-1 px-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}

function SummaryRow({ label, value, isMutedRed, bold, isGreen }) {
    let textColorClass = ''
    if (isMutedRed) textColorClass = 'text-red-500 font-medium'
    else if (isGreen) textColorClass = 'text-green-600 dark:text-green-400 font-bold'

    return (
        <div className={`flex justify-between items-center ${bold ? 'font-bold' : ''}`}>
            <span className={isMutedRed ? 'text-gray-500' : ''}>{label}</span>
            <span className={textColorClass}>
                {isMutedRed ? '-' : ''} {formatCurrency(value)}
            </span>
        </div>
    )
}

const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val || 0)
}
