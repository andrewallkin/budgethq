import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
    createInvestmentPortfolio,
    createSygniaAccount as createSygniaAccountApi,
    deleteInvestmentPortfolio,
    deleteSygniaAccount as deleteSygniaAccountApi,
    getSygniaAccount,
    listInvestmentPortfolios,
    listSygniaAccounts,
    syncSygniaAccount as syncSygniaAccountApi,
    updateSygniaAccount as updateSygniaAccountApi,
} from './api'
import { getAdapter } from './integrations/registry'
import { combinedHoldingsTotal } from './sheetsAccounts'
import { SOURCE_IDS } from './types'

const InvestmentsV2Context = createContext(null)

function accountIdsMatch(left, right) {
    return String(left) === String(right)
}

export function InvestmentsV2Provider({ children }) {
    const [accounts, setAccounts] = useState([])
    const [fx, setFx] = useState(null)
    const [baseCurrency, setBaseCurrency] = useState('ZAR')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const refreshAccounts = useCallback(async () => {
        const errors = []
        let sygnia = []
        let sheets = []
        let nextFx = null
        let nextBase = 'ZAR'

        const results = await Promise.allSettled([
            listSygniaAccounts(),
            listInvestmentPortfolios(),
        ])

        if (results[0].status === 'fulfilled') {
            sygnia = results[0].value || []
        } else {
            const err = results[0].reason
            const message =
                err?.response?.data?.detail ||
                err?.message ||
                'Failed to load Sygnia accounts'
            errors.push(typeof message === 'string' ? message : 'Failed to load Sygnia accounts')
        }

        if (results[1].status === 'fulfilled') {
            sheets = results[1].value?.accounts || []
            nextFx = results[1].value?.fx || null
            nextBase =
                results[1].value?.baseCurrency ||
                nextFx?.base_currency ||
                'ZAR'
        } else {
            const err = results[1].reason
            const message =
                err?.response?.data?.detail ||
                err?.message ||
                'Failed to load Google Sheets accounts'
            errors.push(
                typeof message === 'string' ? message : 'Failed to load Google Sheets accounts',
            )
        }

        const next = [...sheets, ...sygnia]
        setAccounts(next)
        setFx(nextFx)
        setBaseCurrency(String(nextBase || 'ZAR').toUpperCase())
        setError(errors.length ? errors.join(' ') : null)
        return next
    }, [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        refreshAccounts()
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [refreshAccounts])

    const getAccount = useCallback(
        (id) => accounts.find((a) => accountIdsMatch(a.id, id)) ?? null,
        [accounts],
    )

    const removeAccount = useCallback((accountId) => {
        setAccounts((prev) => prev.filter((a) => !accountIdsMatch(a.id, accountId)))
    }, [])

    const getDetail = useCallback((account) => {
        if (!account) return null
        if (account.sourceId === SOURCE_IDS.SYGNIA_PLAYWRIGHT) {
            return null
        }
        return getAdapter(account.sourceId).getDetail(account)
    }, [])

    const fetchAccountDetail = useCallback(async (accountId) => {
        const account = getAccount(accountId)
        if (!account) {
            throw new Error('Account not found')
        }
        if (account.sourceId === SOURCE_IDS.GOOGLE_SHEETS) {
            return getAdapter(account.sourceId).getDetail(account)
        }
        return getSygniaAccount(accountId)
    }, [getAccount])

    const createSygniaAccount = useCallback(
        async (payload) => {
            const detail = await createSygniaAccountApi(payload)
            await refreshAccounts()
            return detail
        },
        [refreshAccounts],
    )

    const createSheetsAccount = useCallback(
        async ({ name, currencyCode, targetAllocationEnabled }) => {
            const account = await createInvestmentPortfolio({
                name,
                currencyCode,
                targetAllocationEnabled,
            })
            await refreshAccounts()
            return account
        },
        [refreshAccounts],
    )

    const updateAccount = useCallback(
        async (accountId, { name, product_type }) => {
            const account = getAccount(accountId)
            if (!account) {
                throw new Error('Account not found')
            }
            if (account.sourceId === SOURCE_IDS.GOOGLE_SHEETS) {
                throw new Error('Rename Google Sheets accounts from the portfolio page')
            }
            const detail = await updateSygniaAccountApi(accountId, { name, product_type })
            await refreshAccounts()
            return detail
        },
        [getAccount, refreshAccounts],
    )

    const syncPlaywrightAccounts = useCallback(
        async (accountIds) => {
            const ids = (accountIds || []).filter((id) => id != null)
            const results = []
            for (const accountId of ids) {
                try {
                    const detail = await syncSygniaAccountApi(accountId)
                    const ok = Boolean(detail?.sync?.ok)
                    results.push({
                        id: accountId,
                        ok,
                        message:
                            detail?.sync?.message ||
                            (ok ? 'Sync completed.' : 'Sync failed.'),
                        detail,
                    })
                } catch (err) {
                    const message =
                        err.response?.data?.detail || err.message || 'Failed to sync account'
                    results.push({
                        id: accountId,
                        ok: false,
                        message: typeof message === 'string' ? message : 'Failed to sync account',
                        detail: null,
                    })
                }
            }
            await refreshAccounts()
            return results
        },
        [refreshAccounts],
    )

    const deleteAccount = useCallback(
        async (accountId) => {
            const account = getAccount(accountId)
            if (!account) {
                throw new Error('Account not found')
            }
            if (account.sourceId === SOURCE_IDS.GOOGLE_SHEETS) {
                if (account.isDefaultTfsa) {
                    throw new Error('TFSA portfolio cannot be deleted')
                }
                if (account.numericId == null) {
                    throw new Error('Account not found')
                }
                await deleteInvestmentPortfolio(account.numericId)
            } else {
                await deleteSygniaAccountApi(accountId)
            }
            removeAccount(accountId)
            await refreshAccounts()
        },
        [getAccount, refreshAccounts, removeAccount],
    )

    const createAccount = useCallback(
        async ({ sourceId, name, currencyCode, targetAllocationEnabled }) => {
            if (sourceId === SOURCE_IDS.GOOGLE_SHEETS) {
                return createSheetsAccount({ name, currencyCode, targetAllocationEnabled })
            }
            if (sourceId === SOURCE_IDS.SYGNIA_PLAYWRIGHT) {
                throw new Error('Sygnia accounts must be created from the Add account wizard')
            }
            throw new Error(`Unknown source: ${sourceId}`)
        },
        [createSheetsAccount],
    )

    const value = useMemo(() => {
        const holdings = combinedHoldingsTotal(accounts, fx)
        return {
            accounts,
            loading,
            error,
            refreshAccounts,
            removeAccount,
            createAccount,
            createSygniaAccount,
            createSheetsAccount,
            updateAccount,
            syncPlaywrightAccounts,
            deleteAccount,
            getAccount,
            getDetail,
            fetchAccountDetail,
            totalHoldings: holdings.total,
            baseCurrency,
            fx,
            fxNote: holdings.fxNote,
            holdingsOmitted: holdings.omitted,
        }
    }, [
        accounts,
        fx,
        baseCurrency,
        loading,
        error,
        refreshAccounts,
        removeAccount,
        createAccount,
        createSygniaAccount,
        createSheetsAccount,
        updateAccount,
        syncPlaywrightAccounts,
        deleteAccount,
        getAccount,
        getDetail,
        fetchAccountDetail,
    ])

    return (
        <InvestmentsV2Context.Provider value={value}>
            {children}
        </InvestmentsV2Context.Provider>
    )
}

export function useInvestmentsV2() {
    const ctx = useContext(InvestmentsV2Context)
    if (!ctx) {
        throw new Error('useInvestmentsV2 must be used within InvestmentsV2Provider')
    }
    return ctx
}

export function useInvestmentsV2Optional() {
    return useContext(InvestmentsV2Context)
}
