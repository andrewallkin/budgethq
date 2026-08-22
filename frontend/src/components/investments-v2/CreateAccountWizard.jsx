import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, FileSpreadsheet, Bot, X, Loader2, ShieldCheck } from 'lucide-react'
import AccountProductTypeSelect from './AccountProductTypeSelect'
import {
    listSygniaLogins,
    suggestSygniaProductType,
    testSygniaLogin,
    testSygniaLoginById,
} from '../../investments-v2/api'
import { useInvestmentsV2 } from '../../investments-v2/InvestmentsV2Provider'
import {
    WIZARD_SOURCE_KINDS,
    listPlaywrightAdapters,
} from '../../investments-v2/integrations/registry'
import { PORTFOLIO_CURRENCIES, SOURCE_IDS } from '../../investments-v2/types'

const METHOD_STEPS = ['Method']
const SHEETS_STEPS = ['Method', 'Details']
const PLAYWRIGHT_STEPS = ['Method', 'Platform', 'Connect', 'Account', 'Name']

function wizardStepsFor(sourceKind) {
    if (sourceKind === 'playwright') return PLAYWRIGHT_STEPS
    if (sourceKind === 'google_sheets') return SHEETS_STEPS
    return METHOD_STEPS
}

function formatApiError(err, fallback) {
    const detail = err.response?.data?.detail
    if (Array.isArray(detail)) {
        return detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
    }
    return detail || err.message || fallback
}

export default function CreateAccountWizard({ isOpen, onClose, onCreated }) {
    const {
        createSygniaAccount: persistSygniaAccount,
        createSheetsAccount: persistSheetsAccount,
    } = useInvestmentsV2()

    const [step, setStep] = useState(0)
    const [sourceKind, setSourceKind] = useState(null)
    const [platformId, setPlatformId] = useState(null)
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
    const [sheetsName, setSheetsName] = useState('')
    const [sheetsCurrency, setSheetsCurrency] = useState('')
    const [sheetsTrackAllocation, setSheetsTrackAllocation] = useState(true)
    const [productType, setProductType] = useState(null)
    const [error, setError] = useState('')
    const [creating, setCreating] = useState(false)
    const userPickedProductType = useRef(false)

    const wizardSteps = wizardStepsFor(sourceKind)
    const stepLabel = wizardSteps[step]
    const playwrightAdapters = listPlaywrightAdapters()
    const selectedAccount = discoveredAccounts.find(
        (a) => a.accountCode === selectedAccountCode,
    )

    useEffect(() => {
        if (!isOpen || stepLabel !== 'Connect' || platformId !== SOURCE_IDS.SYGNIA_PLAYWRIGHT) {
            return
        }
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
    }, [isOpen, stepLabel, platformId])

    useEffect(() => {
        userPickedProductType.current = false
    }, [selectedAccountCode])

    useEffect(() => {
        if (stepLabel !== 'Name' || !selectedAccount) return
        let cancelled = false
        suggestSygniaProductType({
            accountTypeName: selectedAccount.accountTypeName,
            accountTypeCode: selectedAccount.accountTypeCode,
        })
            .then((data) => {
                if (!cancelled && data?.product_type && !userPickedProductType.current) {
                    setProductType(data.product_type)
                }
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [stepLabel, selectedAccount])

    if (!isOpen) return null

    const clearSecrets = () => {
        setPassword('')
    }

    const reset = () => {
        setStep(0)
        setSourceKind(null)
        setPlatformId(null)
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
        setSheetsName('')
        setSheetsCurrency('')
        setSheetsTrackAllocation(true)
        setProductType(null)
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

    const handleSourceKindChange = (nextKind) => {
        setSourceKind(nextKind)
        setError('')
        if (nextKind !== 'playwright') {
            setPlatformId(null)
            invalidateConnection()
        }
    }

    const goBack = () => {
        setError('')
        if (stepLabel === 'Connect') {
            invalidateConnection()
        }
        if (stepLabel === 'Name') {
            setName('')
            setProductType(null)
        }
        setStep((s) => Math.max(s - 1, 0))
    }

    const goNext = () => {
        setError('')
        if (stepLabel === 'Method') {
            if (!sourceKind) {
                setError('Choose Playwright or Google Sheets')
                return
            }
        }
        if (stepLabel === 'Platform') {
            if (!platformId) {
                setError('Select a platform to connect')
                return
            }
        }
        if (stepLabel === 'Connect') {
            if (!connectionVerified) {
                setError('Test the connection successfully before continuing')
                return
            }
            if (discoveredAccounts.length === 0) {
                setError('No Sygnia accounts are available to connect with this login')
                return
            }
        }
        if (stepLabel === 'Account') {
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
        setStep((s) => Math.min(s + 1, wizardSteps.length - 1))
    }

    const handleCreate = async () => {
        setCreating(true)
        setError('')
        try {
            if (sourceKind === 'google_sheets') {
                if (!sheetsName.trim() || !sheetsCurrency) {
                    setError('Enter a name and currency for this account')
                    setCreating(false)
                    return
                }
                const account = await persistSheetsAccount({
                    name: sheetsName.trim(),
                    currencyCode: sheetsCurrency,
                    targetAllocationEnabled: sheetsTrackAllocation,
                })
                reset()
                onClose()
                onCreated?.(account)
                return
            }

            if (!selectedAccountCode || !name.trim()) {
                setError('Enter a display name for this account')
                setCreating(false)
                return
            }
            if (!productType) {
                setError('Choose a product type for this account')
                setCreating(false)
                return
            }

            const payload = {
                account_code: selectedAccountCode,
                name: name.trim(),
                product_type: productType,
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
                sourceId: SOURCE_IDS.SYGNIA_PLAYWRIGHT,
            }
            reset()
            onClose()
            onCreated?.(account)
        } catch (err) {
            setError(formatApiError(err, 'Failed to create account'))
            setCreating(false)
        }
    }

    const canContinueFromMethod = sourceKind === 'playwright' || sourceKind === 'google_sheets'
    const canContinueFromPlatform = Boolean(platformId)
    const canContinueFromConnect =
        connectionVerified && discoveredAccounts.length > 0 && !testingConnection
    const canContinueFromAccount = Boolean(selectedAccountCode)
    const createDisabled =
        creating ||
        (sourceKind === 'google_sheets'
            ? !sheetsName.trim() || !sheetsCurrency
            : !name.trim() || !productType)
    const isLastStep = stepLabel === 'Name' || stepLabel === 'Details'
    const continueDisabled =
        testingConnection ||
        (stepLabel === 'Method' && !canContinueFromMethod) ||
        (stepLabel === 'Platform' && !canContinueFromPlatform) ||
        (stepLabel === 'Connect' && !canContinueFromConnect) ||
        (stepLabel === 'Account' && !canContinueFromAccount)

    const wizardTitle =
        platformId === SOURCE_IDS.SYGNIA_PLAYWRIGHT
            ? 'Connect Sygnia account'
            : sourceKind === 'google_sheets'
              ? 'Add Google Sheets account'
              : 'Add account'
    const wizardSubtitle =
        platformId === SOURCE_IDS.SYGNIA_PLAYWRIGHT
            ? 'Sign in to Sygnia, pick an account, and run an initial sync.'
            : sourceKind === 'playwright'
              ? 'Choose a broker or platform to connect with Playwright.'
              : sourceKind === 'google_sheets'
                ? 'Name the account and choose its currency. A sheet tab is created automatically.'
                : 'Choose how this account should sync.'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-account-title"
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-xl w-full border border-gray-200 dark:border-gray-600 overflow-hidden"
            >
                <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2
                                id="create-account-title"
                                className="text-lg font-semibold text-gray-900 dark:text-white"
                            >
                                {wizardTitle}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                {wizardSubtitle}
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
                        {wizardSteps.map((label, i) => {
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
                                    {i < wizardSteps.length - 1 && (
                                        <span className="hidden sm:block flex-1 h-px bg-gray-200 dark:bg-gray-600 ml-1" />
                                    )}
                                </li>
                            )
                        })}
                    </ol>
                </div>

                <div className="px-6 py-5 min-h-[280px]">
                    {stepLabel === 'Method' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Accounts can sync through Playwright automation or a Google Sheet.
                            </p>
                            {WIZARD_SOURCE_KINDS.map((kind) => {
                                const selected = sourceKind === kind.id
                                const Icon = kind.id === 'playwright' ? Bot : FileSpreadsheet
                                return (
                                    <button
                                        key={kind.id}
                                        type="button"
                                        onClick={() => handleSourceKindChange(kind.id)}
                                        className={`w-full text-left rounded-xl border p-4 transition-colors ${
                                            selected
                                                ? 'border-teal-500 bg-teal-50/80 dark:bg-teal-900/20 dark:border-teal-400'
                                                : 'border-gray-200 dark:border-gray-600 hover:border-teal-300 dark:hover:border-teal-600'
                                        }`}
                                    >
                                        <span className="flex items-start gap-3">
                                            <Icon className="w-5 h-5 mt-0.5 shrink-0 text-teal-700 dark:text-teal-300" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-semibold text-gray-900 dark:text-white">
                                                    {kind.label}
                                                </span>
                                                <span className="block text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {kind.description}
                                                </span>
                                            </span>
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {stepLabel === 'Details' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Account name
                                </label>
                                <input
                                    value={sheetsName}
                                    onChange={(e) => setSheetsName(e.target.value)}
                                    placeholder="e.g. USD brokerage"
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="wizard-sheets-currency"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    Currency
                                </label>
                                <select
                                    id="wizard-sheets-currency"
                                    value={sheetsCurrency}
                                    onChange={(e) => setSheetsCurrency(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="" disabled>
                                        Select currency
                                    </option>
                                    {PORTFOLIO_CURRENCIES.map((code) => (
                                        <option key={code} value={code}>
                                            {code}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                    A Google Sheet tab is created for this account when you save.
                                </p>
                            </div>
                            <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                    checked={sheetsTrackAllocation}
                                    onChange={(e) => setSheetsTrackAllocation(e.target.checked)}
                                />
                                <span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        Track target allocation
                                    </span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        Show target weights and rebalance helpers on this account.
                                        You can change this later.
                                    </span>
                                </span>
                            </label>
                        </div>
                    )}

                    {stepLabel === 'Platform' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Select the broker or platform to connect. More options can be added
                                later.
                            </p>
                            {playwrightAdapters.map((adapter) => {
                                const selected = platformId === adapter.id
                                return (
                                    <button
                                        key={adapter.id}
                                        type="button"
                                        onClick={() => {
                                            setPlatformId(adapter.id)
                                            invalidateConnection()
                                            setError('')
                                        }}
                                        className={`w-full text-left rounded-xl border p-4 transition-colors ${
                                            selected
                                                ? 'border-teal-500 bg-teal-50/80 dark:bg-teal-900/20 dark:border-teal-400'
                                                : 'border-gray-200 dark:border-gray-600 hover:border-teal-300 dark:hover:border-teal-600'
                                        }`}
                                    >
                                        <span className="block font-semibold text-gray-900 dark:text-white">
                                            {adapter.label}
                                        </span>
                                        <span className="block text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                            {adapter.description}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {stepLabel === 'Connect' && (
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
                        </div>
                    )}

                    {stepLabel === 'Account' && (
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

                    {stepLabel === 'Name' && (
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
                            <div>
                                <label
                                    htmlFor="wizard-product-type"
                                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    Product type
                                </label>
                                <AccountProductTypeSelect
                                    id="wizard-product-type"
                                    value={productType}
                                    onChange={(value) => {
                                        userPickedProductType.current = true
                                        setProductType(value)
                                    }}
                                    disabled={creating}
                                />
                                {selectedAccount?.accountTypeName && (
                                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                        Suggested from Sygnia: {selectedAccount.accountTypeName}. You
                                        can change this before creating the account.
                                    </p>
                                )}
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
                            disabled={continueDisabled}
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
