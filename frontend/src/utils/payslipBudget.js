export function additionalIncomeTotal(payslip) {
    const items = payslip?.additional_income || []
    return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
}

export function hasAdditionalIncome(payslip) {
    return additionalIncomeTotal(payslip) > 0
}

export function cashEarnings(payslip) {
    return (Number(payslip?.gross_salary) || 0) + additionalIncomeTotal(payslip)
}

export function payeShareOfEarnings(payslip) {
    const cash = cashEarnings(payslip)
    const paye = Number(payslip?.paye) || 0
    if (cash <= 0) return null
    return (paye / cash) * 100
}

export function payslipMonthLabel(year, month, formatDateSafe) {
    if (!year || !month) return null
    return formatDateSafe(`${year}-${String(month).padStart(2, '0')}-01`, {
        month: 'short',
        year: 'numeric',
    })
}
