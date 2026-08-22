import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
    createSygniaAccount as createSygniaAccountApi,
    deleteSygniaAccount as deleteSygniaAccountApi,
    getSygniaAccount,
    listInvestmentPortfolios,
    listSygniaAccounts,
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
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const refreshAccounts = useCallback(async () => {
        const errors = []
        let sygnia = []
        let sheets = []
        let nextFx = null

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

    const updateAccount = useCallback(
        async (accountId, { name, product_type }) => {
            const account = getAccount(accountId)
            if (!account) {
                throw new Error('Account not found')
            }
            if (account.sourceId === SOURCE_IDS.GOOGLE_SHEETS) {
                throw new Error('Google Sheets accounts are not available yet')
            }
            const detail = await updateSygniaAccountApi(accountId, { name, product_type })
            await refreshAccounts()
            return detail
        },
        [getAccount, refreshAccounts],
    )

    const deleteAccount = useCallback(
        async (accountId) => {
            const account = getAccount(accountId)
            if (!account) {
                throw new Error('Account not found')
            }
            if (account.sourceId === SOURCE_IDS.GOOGLE_SHEETS) {
                throw new Error('Google Sheets accounts are not available yet')
            }
            await deleteSygniaAccountApi(accountId)
            await refreshAccounts()
        },
        [getAccount, refreshAccounts],
    )

    /** @deprecated Task 7 — use createSygniaAccount with account_code + credentials. */
    const createAccount = useCallback(
        async ({ sourceId, name, currencyCode }) => {
            if (sourceId === SOURCE_IDS.GOOGLE_SHEETS) {
                throw new Error('Google Sheets accounts are not available yet')
            }
            if (sourceId === SOURCE_IDS.SYGNIA_PLAYWRIGHT) {
                throw new Error(
                    'Sygnia connect requires account selection after login (Task 7 wizard flow)',
                )
            }
            throw new Error(`Unknown source: ${sourceId}`)
        },
        [],
    )

    const value = useMemo(() => {
        const holdings = combinedHoldingsTotal(accounts, fx)
        return {
            accounts,
            loading,
            error,
            refreshAccounts,
            createAccount,
            createSygniaAccount,
            updateAccount,
            deleteAccount,
            getAccount,
            getDetail,
            fetchAccountDetail,
            totalHoldings: holdings.total,
            fxNote: holdings.fxNote,
            holdingsOmitted: holdings.omitted,
        }
    }, [
        accounts,
        fx,
        loading,
        error,
        refreshAccounts,
        createAccount,
        createSygniaAccount,
        updateAccount,
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
