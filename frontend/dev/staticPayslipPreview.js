import fs from 'node:fs'

const BONUS = /bonus|back\s*pay|commission/i

function readSlips() {
    const file = process.env.STATIC_PAYSLIP_FIXTURE
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    return rows.map((slip, index) => toPayslip(slip, index + 1))
}

function bonusTotal(slip) {
    return (slip.additional_income || []).reduce((sum, item) => {
        if (BONUS.test(item.description || '') && Number(item.amount) > 0) {
            return sum + Number(item.amount)
        }
        return sum
    }, 0)
}

function toPayslip(slip, id) {
    let itemId = id * 100
    const items = [
        ...(slip.company_contributions || []).map((item) => ({
            id: ++itemId,
            description: item.description,
            amount: item.amount,
            item_type: 'company_contribution',
        })),
        ...(slip.other_deductions || []).map((item) => ({
            id: ++itemId,
            description: item.description,
            amount: item.amount,
            item_type: 'personal_deduction',
        })),
    ]
    const additional = (slip.additional_income || []).map((item) => ({
        id: ++itemId,
        description: item.description,
        amount: item.amount,
    }))
    const now = '2026-11-13T12:00:00'
    return {
        id,
        year: slip.year,
        month: slip.month,
        title: slip.title,
        company_name: slip.company_name,
        gross_salary: slip.gross_salary,
        paye: slip.paye,
        uif_employee_portion: slip.uif_employee_portion,
        net_pay: slip.net_pay,
        gcs_file_path: null,
        uploaded_at: now,
        created_at: now,
        updated_at: now,
        items,
        additional_income: additional,
    }
}

function budgetIncome(slips) {
    const sorted = [...slips].sort((a, b) => b.year - a.year || b.month - a.month)
    const latest = sorted[0]
    let chosen = latest
    if (latest && bonusTotal(latest) > 0) {
        chosen = sorted.find((slip) => bonusTotal(slip) <= 0) || latest
    }
    const skipped = Boolean(latest) && bonusTotal(latest) > 0 && bonusTotal(chosen) <= 0
    return {
        salary: chosen ? chosen.net_pay : 0,
        salary_payslip_year: chosen?.year ?? null,
        salary_payslip_month: chosen?.month ?? null,
        salary_skipped_additional: skipped,
        needs: [],
        wants: [],
        savings: [],
        budget_period_start_day: 1,
    }
}

function financialYear(slips, startYear) {
    const months = []
    for (let month = 3; month <= 12; month += 1) months.push([startYear, month])
    for (let month = 1; month <= 2; month += 1) months.push([startYear + 1, month])
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    let totals = { gross: 0, paye: 0, uif: 0, net: 0, company: 0, personal: 0, additional: 0 }
    const rows = months.map(([year, month]) => {
        const slip = slips.find((item) => item.year === year && item.month === month)
        if (!slip) {
            return {
                year, month, month_name: monthNames[month - 1],
                gross_salary: 0, paye: 0, uif: 0, net_pay: 0,
                company_contributions: 0, personal_deductions: 0, additional_income: 0,
                has_data: false,
            }
        }
        const company = slip.items.filter((item) => item.item_type === 'company_contribution').reduce((sum, item) => sum + item.amount, 0)
        const personal = slip.items.filter((item) => item.item_type === 'personal_deduction').reduce((sum, item) => sum + item.amount, 0)
        const additional = slip.additional_income.reduce((sum, item) => sum + item.amount, 0)
        totals = {
            gross: totals.gross + slip.gross_salary,
            paye: totals.paye + slip.paye,
            uif: totals.uif + slip.uif_employee_portion,
            net: totals.net + slip.net_pay,
            company: totals.company + company,
            personal: totals.personal + personal,
            additional: totals.additional + additional,
        }
        return {
            year, month, month_name: monthNames[month - 1],
            gross_salary: slip.gross_salary,
            paye: slip.paye,
            uif: slip.uif_employee_portion,
            net_pay: slip.net_pay,
            company_contributions: company,
            personal_deductions: personal,
            additional_income: additional,
            has_data: true,
        }
    })
    return {
        financial_year: `${startYear}/${String(startYear + 1).slice(2)}`,
        start_year: startYear,
        total_gross_income: totals.gross,
        total_paye: totals.paye,
        total_uif: totals.uif,
        total_net_pay: totals.net,
        total_company_contributions: totals.company,
        total_personal_deductions: totals.personal,
        total_additional_income: totals.additional,
        months: rows,
    }
}

function token() {
    const payload = Buffer.from(JSON.stringify({
        sub: 'preview',
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    })).toString('base64')
    return `preview.${payload}.preview`
}

function send(res, status, body) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
}

export function staticPayslipPreview() {
    return {
        name: 'static-payslip-preview',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    await new Promise((resolve) => {
                        req.on('data', () => {})
                        req.on('end', resolve)
                        req.on('error', resolve)
                    })
                }
                const url = new URL(req.url, 'http://localhost')
                if (!url.pathname.startsWith('/api')) {
                    next()
                    return
                }
                const slips = readSlips()
                const latest = [...slips].sort((a, b) => b.year - a.year || b.month - a.month)[0]
                const path = url.pathname

                if (req.method === 'POST' && path === '/api/auth/login') {
                    send(res, 200, { access_token: token(), token_type: 'bearer' })
                    return
                }
                if (req.method === 'GET' && path === '/api/auth/user/preferences') {
                    send(res, 200, { has_investec_account: false, show_ra_under_investments: false })
                    return
                }
                if (req.method === 'GET' && path === '/api/auth/user/settings/openrouter-key') {
                    send(res, 200, { has_key: true })
                    return
                }
                if (req.method === 'GET' && path === '/api/payslip/latest') {
                    send(res, 200, latest)
                    return
                }
                const fy = path.match(/^\/api\/payslip\/financial-year\/(\d+)$/)
                if (req.method === 'GET' && fy) {
                    send(res, 200, financialYear(slips, Number(fy[1])))
                    return
                }
                const one = path.match(/^\/api\/payslip\/(\d+)\/(\d+)$/)
                if (req.method === 'GET' && one) {
                    const slip = slips.find((item) => item.year === Number(one[1]) && item.month === Number(one[2]))
                    if (!slip) {
                        send(res, 404, { detail: 'Payslip not found' })
                        return
                    }
                    send(res, 200, slip)
                    return
                }
                if (path === '/api/budget/default_user' && (req.method === 'GET' || req.method === 'POST')) {
                    send(res, 200, budgetIncome(slips))
                    return
                }
                if (req.method === 'GET' && path === '/api/portfolio') {
                    send(res, 200, [])
                    return
                }
                if (req.method === 'GET' && path === '/api/budget/period/current') {
                    send(res, 200, { from_date: '2026-11-01', to_date: '2026-11-30' })
                    return
                }
                send(res, 404, { detail: 'Preview API does not implement this route' })
            })
        },
    }
}
