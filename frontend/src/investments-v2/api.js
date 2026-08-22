import axios from 'axios'
import { mapInvestmentPortfolios } from './sheetsAccounts'
import { SOURCE_IDS } from './types'

const BASE = '/api/investments-v2'

/** Map Sygnia list/detail summary fields to landing card shape. */
export function mapSygniaAccountSummary(apiAccount) {
    return {
        id: apiAccount.id,
        name: apiAccount.name,
        currencyCode: 'ZAR',
        sourceId: SOURCE_IDS.SYGNIA_PLAYWRIGHT,
        sourceLabel: 'Sygnia',
        totalValue: apiAccount.latest_portfolio_value ?? 0,
        accountCode: apiAccount.account_code,
        loginId: apiAccount.login_id,
        accountTypeName: apiAccount.account_type_name,
        accountTypeCode: apiAccount.account_type_code,
        foreignAllocation: apiAccount.foreign_allocation,
        reg28Compliant: apiAccount.reg28_compliant,
        asOfDate: apiAccount.as_of_date,
        lastSyncedAt: apiAccount.last_synced_at,
        lastSyncStatus: apiAccount.last_sync_status,
        lastSyncError: apiAccount.last_sync_error,
        productType: apiAccount.product_type,
    }
}

export async function listInvestmentPortfolios() {
    const { data } = await axios.get('/api/investments')
    return {
        accounts: mapInvestmentPortfolios(data?.portfolios),
        fx: data?.fx || null,
        baseCurrency: data?.base_currency || data?.fx?.base_currency || 'ZAR',
    }
}

export async function suggestSygniaProductType({ accountTypeName, accountTypeCode }) {
    const { data } = await axios.get(`${BASE}/sygnia/product-type-suggestion`, {
        params: {
            account_type_name: accountTypeName || undefined,
            account_type_code: accountTypeCode || undefined,
        },
    })
    return data
}

export async function updateSygniaAccount(accountId, { name, product_type }) {
    const body = {}
    if (name !== undefined) body.name = name
    if (product_type !== undefined) body.product_type = product_type
    const { data } = await axios.patch(`${BASE}/sygnia/accounts/${accountId}`, body)
    return data
}

export async function syncSygniaAccount(accountId) {
    const { data } = await axios.post(`${BASE}/sygnia/accounts/${accountId}/sync`)
    return data
}

export async function getRaSummary() {
    const { data } = await axios.get(`${BASE}/ra-summary`)
    return data
}

export async function testSygniaLogin({ username, password }) {
    const { data } = await axios.post(`${BASE}/sygnia/logins/test`, { username, password })
    return data
}

export async function listSygniaLogins() {
    const { data } = await axios.get(`${BASE}/sygnia/logins`)
    return data
}

export async function testSygniaLoginById(loginId) {
    const { data } = await axios.post(`${BASE}/sygnia/logins/${loginId}/test`)
    return data
}

export async function listSygniaAccounts() {
    const { data } = await axios.get(`${BASE}/sygnia/accounts`)
    return (data || []).map(mapSygniaAccountSummary)
}

export async function createSygniaAccount(payload) {
    const { data } = await axios.post(`${BASE}/sygnia/accounts`, payload)
    return data
}

export async function getSygniaAccount(accountId) {
    const { data } = await axios.get(`${BASE}/sygnia/accounts/${accountId}`)
    return data
}

export async function deleteSygniaAccount(accountId) {
    const { data } = await axios.delete(`${BASE}/sygnia/accounts/${accountId}`)
    return data
}

export async function getSygniaAccountHistory(accountId, range = 'all') {
    const { data } = await axios.get(`${BASE}/sygnia/accounts/${accountId}/history`, {
        params: { range },
    })
    return data
}

export async function createSygniaSnapshot(accountId, { month, portfolio_value }) {
    const { data } = await axios.post(`${BASE}/sygnia/accounts/${accountId}/snapshots`, {
        month,
        portfolio_value,
    })
    return data
}

export async function updateSygniaSnapshot(accountId, snapshotId, { month, portfolio_value }) {
    const { data } = await axios.put(
        `${BASE}/sygnia/accounts/${accountId}/snapshots/${snapshotId}`,
        { month, portfolio_value },
    )
    return data
}

export async function deleteSygniaSnapshot(accountId, snapshotId) {
    const { data } = await axios.delete(
        `${BASE}/sygnia/accounts/${accountId}/snapshots/${snapshotId}`,
    )
    return data
}

export async function createSygniaContribution(accountId, { month, amount }) {
    const { data } = await axios.post(`${BASE}/sygnia/accounts/${accountId}/contributions`, {
        month,
        amount,
    })
    return data
}

export async function updateSygniaContribution(accountId, contributionId, { month, amount }) {
    const { data } = await axios.put(
        `${BASE}/sygnia/accounts/${accountId}/contributions/${contributionId}`,
        { month, amount },
    )
    return data
}

export async function deleteSygniaContribution(accountId, contributionId) {
    const { data } = await axios.delete(
        `${BASE}/sygnia/accounts/${accountId}/contributions/${contributionId}`,
    )
    return data
}
