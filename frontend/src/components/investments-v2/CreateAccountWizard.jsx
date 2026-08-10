import { useEffect, useState } from 'react'
import { Check, ChevronLeft, X, Loader2, ShieldCheck } from 'lucide-react'
import {
    listSygniaLogins,
    testSygniaLogin,
    testSygniaLoginById,
} from '../../investments-v2/api'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'

const STEPS = ['Connect', 'Account', 'Name']

function formatApiError(err, fallback) {
    const detail = err.response?.data?.detail
    if (Array.isArray(detail)) {
        return detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
    }
    return detail || err.message || fallback
}

export default function CreateAccountWizard({ isOpen, onClose, onCreated }) {
    const { createSygniaAccount: persistSygniaAccount } = useInvestmentsV2()

    const [step, setStep] = useState(0)
    const [savedLogins, setSavedLogins] = useState([])
    const [loadingLogins, setLoadingLogins] = useState(false)
    const [loginMode, setLoginMode] = useState('new')
    const [selectedLoginId, setSelectedLoginId] = useState(null)
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [connectionVerified, setConnectionVerified] = useState(false)
    const [testingConnection, setTestingConnection] = useState(false)
    const [testMessage, setTestMessage] = useState('')
    const [discoveredAccounts, setDiscoveredAccounts] = useState([])
    const [selectedAccountCode, setSelectedAccountCode] = useState(null)
    const [name, setName] = useState('')
    const [error, setError] = useState('')
    const [creating, setCreating] = useState(false)

    const isLastStep = step >= STEPS.length - 1
    const selectedAccount = discoveredAccounts.find(
        (a) => a.accountCode === selectedAccountCode,
    )

    useEffect(() => {
        if (!isOpen) return
        let cancelled = false
        setLoadingLogins(true)
        listSygniaLogins()
            .then((logins) => {
                if (cancelled) return
                setSavedLogins(logins || [])
                if ((logins || []).length > 0) {
                    setLoginMode('existing')
                    setSelectedLoginId(logins[0].id)
                }
            })
            .catch(() => {
                if (!cancelled) setSavedLogins([])
            })
            .finally(() => {
                if (!cancelled) setLoadingLogins(false)
            })
        return () => {
            cancelled = true
        }
    }, [isOpen])

    if (!isOpen) return null

    const clearSecrets = () => {
        setPassword('')
    }

    const reset = () => {
        setStep(0)
        setSavedLogins([])
        setLoadingLogins(false)
        setLoginMode('new')
        setSelectedLoginId(null)
        setUsername('')
        setPassword('')
        setConnectionVerified(false)
        setTestingConnection(false)
        setTestMessage('')
        setDiscoveredAccounts([])
        setSelectedAccountCode(null)
        setName('')
        setError('')
        setCreating(false)
    }

    const handleClose = () => {
        clearSecrets()
        reset()
        onClose()
    }

    const invalidateConnection = () => {
        setConnectionVerified(false)
        setTestMessage('')
        setDiscoveredAccounts([])
        setSelectedAccountCode(null)
    }

    const handleLoginModeChange = (mode) => {
        setLoginMode(mode)
        invalidateConnection()
        clearSecrets()
        setUsername('')
        setError('')
        if (mode === 'existing' && savedLogins.length > 0) {
            setSelectedLoginId(savedLogins[0].id)
        } else {
            setSelectedLoginId(null)
        }
    }

    const handleTestConnection = async () => {
        setError('')
        setTestMessage('')
        setConnectionVerified(false)
        setDiscoveredAccounts([])
        setSelectedAccountCode(null)

        if (loginMode === 'existing') {
            if (!selectedLoginId) {
                setError('Select a saved login to test')
                return
            }
        } else if (!username.trim() || !password) {
            setError('Enter username and password to test the connection')
            return
        }

        setTestingConnection(true)
        try {
            const data =
                loginMode === 'existing'
                    ? await testSygniaLoginById(selectedLoginId)
                    : await testSygniaLogin({
                          username: username.trim(),
                          password,
                      })

            if (data?.ok) {
                const accounts = data.accounts || []
                setDiscoveredAccounts(accounts)
                setConnectionVerified(true)
                const count = accounts.length
                setTestMessage(
                    data.message ||
                        (count > 0
                            ? `Connection succeeded. ${count} account(s) available to connect.`
                            : 'Connection succeeded, but no new accounts are available.'),
                )
            } else {
                setError(data?.message || 'Connection test failed.')
            }
        } catch (err) {
            setError(formatApiError(err, 'Connection test failed. Check credentials and try again.'))
        } finally {
            setTestingConnection(false)
        }
    }

    const goBack = () => {
        setError('')
        if (step === 1) {
            invalidateConnection()
        }
        if (step === 2) {
            setName('')
        }
        setStep((s) => Math.max(s - 1, 0))
    }

    const goNext = () => {
        setError('')
        if (step === 0) {
            if (!connectionVerified) {
                setError('Test the connection successfully before continuing')
                return
            }
            if (discoveredAccounts.length === 0) {
                setError('No Sygnia accounts are available to connect with this login')
                return
            }
        }
        if (step === 1) {
            if (!selectedAccountCode) {
                setError('Select a Sygnia account to connect')
                return
            }
            const account = discoveredAccounts.find((a) => a.accountCode === selectedAccountCode)
            if (account && !name.trim()) {
                const typeLabel = account.accountTypeName || account.accountTypeCode || 'Sygnia'
                setName(`${typeLabel} (${account.accountCode})`)
            }
        }
        setStep((s) => Math.min(s + 1, STEPS.length - 1))
    }

    const handleCreate = async () => {
        if (!selectedAccountCode || !name.trim()) {
            setError('Enter a display name for this account')
            return
        }

        setCreating(true)
        setError('')
        try {
            const payload = {
                account_code: selectedAccountCode,
                name: name.trim(),
            }
            if (loginMode === 'existing' && selectedLoginId) {
                payload.login_id = selectedLoginId
            } else {
                if (!username.trim() || !password) {
                    setError('Enter username and password to create this account')
                    setCreating(false)
                    return
                }
                payload.username = username.trim()
                payload.password = password
            }

            const detail = await persistSygniaAccount(payload)
            clearSecrets()
            const account = {
                id: detail.id,
                name: detail.name ?? name.trim(),
                accountCode: detail.account_code ?? selectedAccountCode,
            }
            reset()
            onClose()
            onCreated?.(account)
        } catch (err) {
            setError(formatApiError(err, 'Failed to create account'))
            setCreating(false)
        }
    }

    const canContinueFromConnect =
        connectionVerified && discoveredAccounts.length > 0 && !testingConnection
    const canContinueFromAccount = Boolean(selectedAccountCode)
    const createDisabled = creating || !name.trim()

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-account-title"
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 dark:border-gray-600 overflow-hidden"
            >
                <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2
                                id="create-account-title"
                                className="text-lg font-semibold text-gray-900 dark:text-white"
                            >
                                Connect Sygnia account
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                Sign in to Sygnia, pick an account, and run an initial sync.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <ol className="mt-5 flex items-center gap-2">
                        {STEPS.map((label, i) => {
                            const active = i === step
                            const done = i < step
                            return (
                                <li key={label} className="flex items-center gap-2 flex-1 min-w-0">
                                    <span
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                            done
                                                ? 'bg-teal-600 text-white'
                                                : active
                                                  ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200 ring-2 ring-teal-500'
                                                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                        }`}
                                    >
                                        {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                    </span>
                                    <span
                                        className={`text-xs font-medium truncate ${
                                            active || done
                                                ? 'text-gray-900 dark:text-white'
                                                : 'text-gray-400 dark:text-gray-500'
                                        }`}
                                    >
                                        {label}
                                    </span>
                                    {i < STEPS.length - 1 && (
                                        <span className="hidden sm:block flex-1 h-px bg-gray-200 dark:bg-gray-600 ml-1" />
                                    )}
                                </li>
                            )
                        })}
                    </ol>
                </div>

                <div className="px-6 py-5 min-h-[280px]">
                    {step === 0 && (
                        <div className="space-y-4">
                            {loadingLogins ? (
                                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading saved logins…
                                </div>
                            ) : savedLogins.length > 0 ? (
                                <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => handleLoginModeChange('existing')}
                                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                            loginMode === 'existing'
                                                ? 'bg-teal-600 text-white'
                                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        Saved login
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleLoginModeChange('new')}
                                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                                            loginMode === 'new'
                                                ? 'bg-teal-600 text-white'
                                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        New credentials
                                    </button>
                                </div>
                            ) : null}

                            {loginMode === 'existing' && savedLogins.length > 0 ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Saved Sygnia login
                                    </label>
                                    <select
                                        value={selectedLoginId ?? ''}
                                        onChange={(e) => {
                                            setSelectedLoginId(Number(e.target.value))
                                            invalidateConnection()
                                        }}
                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        {savedLogins.map((login) => (
                                            <option key={login.id} value={login.id}>
                                                {login.username_masked}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Username
                                        </label>
                                        <input
                                            value={username}
                                            onChange={(e) => {
                                                setUsername(e.target.value)
                                                invalidateConnection()
                                            }}
                                            autoComplete="username"
                                            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => {
                                                setPassword(e.target.value)
                                                invalidateConnection()
                                            }}
                                            autoComplete="current-password"
                                            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </>
                            )}

                            <button
                                type="button"
                                onClick={handleTestConnection}
                                disabled={
                                    testingConnection ||
                                    (loginMode === 'existing'
                                        ? !selectedLoginId
                                        : !username.trim() || !password)
                                }
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-teal-600 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {testingConnection ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Testing connection…
                                    </>
                                ) : (
                                    'Test connection'
                                )}
                            </button>

                            {testingConnection && (
                                <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-900/20 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative h-9 w-9 shrink-0">
                                            <span className="absolute inset-0 rounded-full border-2 border-teal-200 dark:border-teal-800" />
                                            <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-teal-600 animate-spin" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-teal-900 dark:text-teal-100">
                                                Signing in with Playwright
                                            </p>
                                            <p className="text-xs text-teal-800/80 dark:text-teal-200/80 mt-0.5">
                                                Running the Sygnia login flow. This can take up to a
                                                minute.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {connectionVerified && !testingConnection && (
                                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-start gap-3">
                                    <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                                            Connection verified
                                        </p>
                                        <p className="text-xs text-emerald-800/90 dark:text-emerald-200/80 mt-0.5">
                                            {testMessage ||
                                                'Choose an account on the next step.'}{' '}
                                            {loginMode === 'new'
                                                ? 'Credentials are saved when you create the account.'
                                                : 'Using saved encrypted credentials.'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                Google Sheets support is coming soon.
                            </p>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Select the Sygnia account to connect. Already-linked accounts are
                                excluded.
                            </p>
                            {discoveredAccounts.map((account) => {
                                const selected = selectedAccountCode === account.accountCode
                                const typeLabel =
                                    account.accountTypeName ||
                                    account.accountTypeCode ||
                                    'Unknown type'
                                return (
                                    <button
                                        key={account.accountCode}
                                        type="button"
                                        onClick={() => {
                                            setSelectedAccountCode(account.accountCode)
                                            setError('')
                                        }}
                                        className={`w-full text-left rounded-xl border p-4 transition-colors ${
                                            selected
                                                ? 'border-teal-500 bg-teal-50/80 dark:bg-teal-900/20 dark:border-teal-400'
                                                : 'border-gray-200 dark:border-gray-600 hover:border-teal-300 dark:hover:border-teal-600'
                                        }`}
                                    >
                                        <span className="block font-semibold text-gray-900 dark:text-white tabular-nums">
                                            {account.accountCode}
                                        </span>
                                        <span className="block text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                            {typeLabel}
                                            {account.accountTypeCode &&
                                            account.accountTypeName &&
                                            account.accountTypeCode !== account.accountTypeName
                                                ? ` · ${account.accountTypeCode}`
                                                : ''}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            {selectedAccount && (
                                <dl className="rounded-xl border border-gray-200 dark:border-gray-600 px-4 py-3 text-sm space-y-2">
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-gray-500 dark:text-gray-400">Account code</dt>
                                        <dd className="font-medium text-gray-900 dark:text-white tabular-nums">
                                            {selectedAccount.accountCode}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-gray-500 dark:text-gray-400">Type</dt>
                                        <dd className="font-medium text-gray-900 dark:text-white text-right">
                                            {selectedAccount.accountTypeName ||
                                                selectedAccount.accountTypeCode ||
                                                '—'}
                                        </dd>
                                    </div>
                                </dl>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Display name
                                </label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Sygnia RA"
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    autoFocus
                                />
                            </div>
                            {creating && (
                                <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-900/20 px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <Loader2 className="w-5 h-5 text-teal-600 animate-spin shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium text-teal-900 dark:text-teal-100">
                                                Initial sync…
                                            </p>
                                            <p className="text-xs text-teal-800/80 dark:text-teal-200/80 mt-0.5">
                                                Scraping holdings and portfolio value from Sygnia.
                                                This can take up to a minute.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={step === 0 ? handleClose : goBack}
                        disabled={testingConnection || creating}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                        {step > 0 && <ChevronLeft className="w-4 h-4" />}
                        {step === 0 ? 'Cancel' : 'Back'}
                    </button>
                    {!isLastStep ? (
                        <button
                            type="button"
                            onClick={goNext}
                            disabled={
                                testingConnection ||
                                (step === 0 && !canContinueFromConnect) ||
                                (step === 1 && !canContinueFromAccount)
                            }
                            className="px-5 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Continue
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={createDisabled}
                            className="px-5 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Initial sync…
                                </>
                            ) : (
                                'Create account'
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
