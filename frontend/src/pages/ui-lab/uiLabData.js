export const BUDGET_COLORS = {
    Needs: '#B91C1C',
    Wants: '#1D4ED8',
    Savings: '#15803D',
    Unallocated: '#B45309',
}

export const OVERVIEW_COLORS = ['#0D9488', '#2563EB', '#16A34A', '#F59E0B', '#7C3AED']

export function monthlyTotal(items) {
    return items
        .filter((item) => item.cadence === 'monthly')
        .reduce((sum, item) => sum + item.amount, 0)
}

export function budgetSplit({ netIncome, needs, wants, savings }) {
    const totalNeeds = monthlyTotal(needs)
    const totalWants = monthlyTotal(wants)
    const totalSavings = monthlyTotal(savings)
    const remaining = netIncome - totalNeeds - totalWants - totalSavings
    const pct = (value) => (netIncome === 0 ? 0 : (value / netIncome) * 100)
    return [
        { name: 'Needs', value: totalNeeds, percentage: pct(totalNeeds) },
        { name: 'Wants', value: totalWants, percentage: pct(totalWants) },
        { name: 'Savings', value: totalSavings, percentage: pct(totalSavings) },
        { name: 'Unallocated', value: Math.max(0, remaining), percentage: pct(Math.max(0, remaining)) },
    ].filter((slice) => slice.value > 0)
}

export function investmentTotal(accounts) {
    return accounts.reduce((sum, account) => sum + account.totalValue, 0)
}

export const labBudget = {
    periodLabel: '22 Jul - 21 Aug',
    netIncome: 48500,
    payslip: {
        companyName: 'Example Ltd',
        grossSalary: 72000,
        paye: 18200,
        netPay: 48500,
    },
    needs: [
        { name: 'Rent', amount: 12000, cadence: 'monthly', category: 'Housing' },
        { name: 'Groceries', amount: 4500, cadence: 'monthly', category: 'Food' },
        { name: 'Medical aid', amount: 1800, cadence: 'monthly', category: 'Healthcare' },
        { name: 'Transport', amount: 2200, cadence: 'monthly', category: 'Transport' },
        { name: 'Car insurance', amount: 8400, cadence: 'annual', category: 'Insurance' },
    ],
    wants: [
        { name: 'Dining out', amount: 2500, cadence: 'monthly', category: 'Lifestyle' },
        { name: 'Streaming', amount: 350, cadence: 'monthly', category: 'Subscriptions' },
    ],
    savings: [
        { name: 'TFSA', amount: 5000, cadence: 'monthly', category: 'Investments' },
        { name: 'Emergency fund', amount: 3000, cadence: 'monthly', category: 'Savings' },
    ],
}

export const labInvestments = {
    totalHoldings: 1123800,
    accounts: [
        {
            id: 'lab-ra',
            name: 'Sygnia RA',
            accountCode: 'SG-00-1234',
            accountTypeName: 'Retirement annuity',
            lastSyncStatus: 'ok',
            totalValue: 842000,
            asOfDate: '2026-08-21',
        },
        {
            id: 'lab-tfsa',
            name: 'Sygnia TFSA',
            accountCode: 'SG-00-5678',
            accountTypeName: 'Tax-free savings',
            lastSyncStatus: 'ok',
            totalValue: 186400,
            asOfDate: '2026-08-21',
        },
        {
            id: 'lab-off',
            name: 'Sygnia Offshore',
            accountCode: 'SG-00-9012',
            accountTypeName: 'Offshore investment',
            lastSyncStatus: 'ok',
            totalValue: 95400,
            asOfDate: '2026-08-21',
        },
    ],
}

export const labHome = {
    budget: {
        grossSalary: labBudget.payslip.grossSalary,
        netIncome: labBudget.netIncome,
        periodLabel: labBudget.periodLabel,
        remaining:
            labBudget.netIncome
            - monthlyTotal(labBudget.needs)
            - monthlyTotal(labBudget.wants)
            - monthlyTotal(labBudget.savings),
        split: budgetSplit(labBudget),
        totalBudgeted:
            monthlyTotal(labBudget.needs)
            + monthlyTotal(labBudget.wants)
            + monthlyTotal(labBudget.savings),
    },
    investments: {
        totalValue: labInvestments.totalHoldings,
        baseCurrency: 'ZAR',
        portfolios: [
            { name: 'Sygnia RA', value: 842000 },
            { name: 'Sygnia TFSA', value: 186400 },
            { name: 'Sygnia Offshore', value: 95400 },
        ],
    },
    emergency: {
        currentFund: 84000,
        monthlyDeposit: 3000,
        targetValue: 123000,
        progress: 68,
    },
    accounts: {
        totalBalance: 63200,
        count: 2,
        lastSyncedLabel: '21 Aug',
        rows: [
            { name: 'Investec Private', value: 45200 },
            { name: 'Manual cash', value: 18000 },
        ],
    },
}
