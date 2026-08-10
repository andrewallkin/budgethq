import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
    createSygniaAccount as createSygniaAccountApi,
    deleteSygniaAccount as deleteSygniaAccountApi,
    getSygniaAccount,
    listSygniaAccounts,
} from './api'
import { getAdapter } from './integrations/registry'
import { SOURCE_IDS } from './types'

const InvestmentsV2Context = createContext(null)

function accountIdsMatch(left, right) {
    return String(left) === String(right)
}

export function InvestmentsV2Provider({ children }) {
    const [accounts, setAccounts] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const refreshAccounts = useCallback(async () => {
        setError(null)
        try {
            const next = await listSygniaAccounts()
            setAccounts(next)
            return next
        } catch (err) {
            const message =
                err.response?.data?.detail ||
                err.message ||
                'Failed to load investment accounts'
            setError(typeof message === 'string' ? message : 'Failed to load investment accounts')
            throw err
        }
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

    const value = useMemo(
        () => ({
            accounts,
            loading,
            error,
            refreshAccounts,
            createAccount,
            createSygniaAccount,
            deleteAccount,
            getAccount,
            getDetail,
            fetchAccountDetail,
            totalHoldings: accounts.reduce((sum, a) => sum + (a.totalValue || 0), 0),
        }),
        [
            accounts,
            loading,
            error,
            refreshAccounts,
            createAccount,
            createSygniaAccount,
            deleteAccount,
            getAccount,
            getDetail,
            fetchAccountDetail,
        ],
    )

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
