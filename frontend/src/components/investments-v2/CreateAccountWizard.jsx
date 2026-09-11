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
import { ModalPortal } from '../appUi'

const btnBase =
    'inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btnBase} bg-[var(--paper-ink)] text-[var(--paper-card)] hover:opacity-90`
const btnGhost = `${btnBase} border border-[var(--paper-line)] bg-[var(--paper-card)] text-[var(--paper-ink)] hover:bg-[var(--paper-canvas)]`
const fieldInput =
    'min-h-[40px] w-full rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-3 py-2.5 text-sm text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20'
const checkboxInput =
    'mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--paper-line)] text-[var(--paper-ink)] accent-[var(--paper-ink)] focus:ring-2 focus:ring-[var(--paper-accent)]/20'

function selectableCardClass(selected) {
    return `w-full cursor-pointer text-left rounded-md border p-4 transition-colors ${
        selected
            ? 'border-[var(--paper-accent)] bg-[var(--paper-canvas)]'
            : 'border-[var(--paper-line)] hover:border-[var(--paper-accent)]'
    }`
}

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
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-account-title"
                className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)]"
            >
                <div className="shrink-0 border-b border-[var(--paper-line)] px-6 pt-5 pb-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2
                                id="create-account-title"
                                className="text-lg font-semibold text-[var(--paper-ink)]"
                            >
                                {wizardTitle}
                            </h2>
                            <p className="mt-0.5 text-sm text-[var(--paper-muted)]">
                                {wizardSubtitle}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-md text-[var(--paper-muted)] transition-colors hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <p className="mt-4 text-xs font-medium text-[var(--paper-muted)]">
                        Step {step + 1} of {wizardSteps.length}
                    </p>
                    <ol className="mt-2 flex items-center gap-2">
                        {wizardSteps.map((label, i) => {
                            const active = i === step
                            const done = i < step
                            return (
                                <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
                                    <span
                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                            done
                                                ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                                : active
                                                  ? 'bg-[var(--paper-canvas)] text-[var(--paper-ink)] ring-2 ring-[var(--paper-accent)]/30'
                                                  : 'bg-[var(--paper-canvas)] text-[var(--paper-muted)]'
                                        }`}
                                    >
                                        {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                                    </span>
                                    <span
                                        className={`truncate text-xs font-medium ${
                                            active || done
                                                ? 'text-[var(--paper-ink)]'
                                                : 'text-[var(--paper-muted)]'
                                        }`}
                                    >
                                        {label}
                                    </span>
                                    {i < wizardSteps.length - 1 && (
                                        <span className="ml-1 hidden h-px flex-1 bg-[var(--paper-line)] sm:block" />
                                    )}
                                </li>
                            )
                        })}
                    </ol>
                </div>

                <div className="min-h-[280px] flex-1 overflow-y-auto px-6 py-5 text-[var(--paper-ink)]">
                    {stepLabel === 'Method' && (
                        <div className="space-y-3">
                            <p className="text-sm text-[var(--paper-muted)]">
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
                                        className={selectableCardClass(selected)}
                                    >
                                        <span className="flex items-start gap-3">
                                            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--paper-ink)]" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-semibold text-[var(--paper-ink)]">
                                                    {kind.label}
                                                </span>
                                                <span className="mt-0.5 block text-sm text-[var(--paper-muted)]">
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
                                <label
                                    htmlFor="wizard-sheets-name"
                                    className="mb-1 block text-sm font-medium text-[var(--paper-ink)]"
                                >
                                    Account name
                                </label>
                                <input
                                    id="wizard-sheets-name"
                                    value={sheetsName}
                                    onChange={(e) => setSheetsName(e.target.value)}
                                    placeholder="e.g. USD brokerage"
                                    className={fieldInput}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="wizard-sheets-currency"
                                    className="mb-1 block text-sm font-medium text-[var(--paper-ink)]"
                                >
                                    Currency
                                </label>
                                <select
                                    id="wizard-sheets-currency"
                                    value={sheetsCurrency}
                                    onChange={(e) => setSheetsCurrency(e.target.value)}
                                    className={fieldInput}
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
                                <p className="mt-1.5 text-xs text-[var(--paper-muted)]">
                                    A Google Sheet tab is created for this account when you save.
                                </p>
                            </div>
                            <label className="flex cursor-pointer select-none items-start gap-3 text-sm text-[var(--paper-ink)]">
                                <input
                                    type="checkbox"
                                    className={checkboxInput}
                                    checked={sheetsTrackAllocation}
                                    onChange={(e) => setSheetsTrackAllocation(e.target.checked)}
                                />
                                <span>
                                    <span className="font-medium text-[var(--paper-ink)]">
                                        Track target allocation
                                    </span>
                                    <span className="mt-0.5 block text-xs text-[var(--paper-muted)]">
                                        Show target weights and rebalance helpers on this account.
                                        You can change this later.
                                    </span>
                                </span>
                            </label>
                        </div>
                    )}

                    {stepLabel === 'Platform' && (
                        <div className="space-y-3">
                            <p className="text-sm text-[var(--paper-muted)]">
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
                                        className={selectableCardClass(selected)}
                                    >
                                        <span className="block font-semibold text-[var(--paper-ink)]">
                                            {adapter.label}
                                        </span>
                                        <span className="mt-0.5 block text-sm text-[var(--paper-muted)]">
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
                                <div className="flex items-center gap-2 text-sm text-[var(--paper-muted)]">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading saved logins…
                                </div>
                            ) : savedLogins.length > 0 ? (
                                <div className="flex gap-1 rounded-md bg-[var(--paper-canvas)] p-1">
                                    <button
                                        type="button"
                                        onClick={() => handleLoginModeChange('existing')}
                                        className={`min-h-[40px] flex-1 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--paper-accent)]/20 ${
                                            loginMode === 'existing'
                                                ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                                : 'text-[var(--paper-muted)] hover:text-[var(--paper-ink)]'
                                        }`}
                                    >
                                        Saved login
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleLoginModeChange('new')}
                                        className={`min-h-[40px] flex-1 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--paper-accent)]/20 ${
                                            loginMode === 'new'
                                                ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                                : 'text-[var(--paper-muted)] hover:text-[var(--paper-ink)]'
                                        }`}
                                    >
                                        New credentials
                                    </button>
                                </div>
                            ) : null}

                            {loginMode === 'existing' && savedLogins.length > 0 ? (
                                <div>
                                    <label
                                        htmlFor="wizard-saved-login"
                                        className="mb-1 block text-sm font-medium text-[var(--paper-ink)]"
                                    >
                                        Saved Sygnia login
                                    </label>
                                    <select
                                        id="wizard-saved-login"
                                        value={selectedLoginId ?? ''}
                                        onChange={(e) => {
                                            setSelectedLoginId(Number(e.target.value))
                                            invalidateConnection()
                                        }}
                                        className={fieldInput}
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
                                        <label
                                            htmlFor="wizard-username"
                                            className="mb-1 block text-sm font-medium text-[var(--paper-ink)]"
                                        >
                                            Username
                                        </label>
                                        <input
                                            id="wizard-username"
                                            value={username}
                                            onChange={(e) => {
                                                setUsername(e.target.value)
                                                invalidateConnection()
                                            }}
                                            autoComplete="username"
                                            className={fieldInput}
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="wizard-password"
                                            className="mb-1 block text-sm font-medium text-[var(--paper-ink)]"
                                        >
                                            Password
                                        </label>
                                        <input
                                            id="wizard-password"
                                            type="password"
                                            value={password}
                                            onChange={(e) => {
                                                setPassword(e.target.value)
                                                invalidateConnection()
                                            }}
                                            autoComplete="current-password"
                                            className={fieldInput}
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
                                className={`${btnGhost} w-full`}
                            >
                                {testingConnection ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Testing connection…
                                    </>
                                ) : (
                                    'Test connection'
                                )}
                            </button>

                            {testingConnection && (
                                <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative h-9 w-9 shrink-0">
                                            <span className="absolute inset-0 rounded-full border-2 border-[var(--paper-line)]" />
                                            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--paper-ink)]" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-[var(--paper-ink)]">
                                                Signing in with Playwright
                                            </p>
                                            <p className="mt-0.5 text-xs text-[var(--paper-muted)]">
                                                Running the Sygnia login flow. This can take up to a
                                                minute.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {connectionVerified && !testingConnection && (
                                <div className="flex items-start gap-3 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] px-4 py-3">
                                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--paper-olive)]" />
                                    <div>
                                        <p className="text-sm font-medium text-[var(--paper-olive)]">
                                            Connection verified
                                        </p>
                                        <p className="mt-0.5 text-xs text-[var(--paper-muted)]">
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
                            <p className="text-sm text-[var(--paper-muted)]">
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
                                        className={selectableCardClass(selected)}
                                    >
                                        <span className="block font-semibold tabular-nums text-[var(--paper-ink)]">
                                            {account.accountCode}
                                        </span>
                                        <span className="mt-0.5 block text-sm text-[var(--paper-muted)]">
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
                                <dl className="space-y-2 rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] px-4 py-3 text-sm">
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[var(--paper-muted)]">Account code</dt>
                                        <dd className="font-medium tabular-nums text-[var(--paper-ink)]">
                                            {selectedAccount.accountCode}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[var(--paper-muted)]">Type</dt>
                                        <dd className="text-right font-medium text-[var(--paper-ink)]">
                                            {selectedAccount.accountTypeName ||
                                                selectedAccount.accountTypeCode ||
                                                '—'}
                                        </dd>
                                    </div>
                                </dl>
                            )}
                            <div>
                                <label
                                    htmlFor="wizard-display-name"
                                    className="mb-1 block text-sm font-medium text-[var(--paper-ink)]"
                                >
                                    Display name
                                </label>
                                <input
                                    id="wizard-display-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Sygnia RA"
                                    className={fieldInput}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="wizard-product-type"
                                    className="mb-1 block text-sm font-medium text-[var(--paper-ink)]"
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
                                    <p className="mt-1.5 text-xs text-[var(--paper-muted)]">
                                        Suggested from Sygnia: {selectedAccount.accountTypeName}. You
                                        can change this before creating the account.
                                    </p>
                                )}
                            </div>
                            {creating && (
                                <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--paper-ink)]" />
                                        <div>
                                            <p className="text-sm font-medium text-[var(--paper-ink)]">
                                                Initial sync…
                                            </p>
                                            <p className="mt-0.5 text-xs text-[var(--paper-muted)]">
                                                Scraping holdings and portfolio value from Sygnia.
                                                This can take up to a minute.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <p role="alert" className="mt-4 text-sm text-[var(--paper-brick)]">
                            {error}
                        </p>
                    )}
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--paper-line)] bg-[var(--paper-card)] px-6 py-4">
                    <button
                        type="button"
                        onClick={step === 0 ? handleClose : goBack}
                        disabled={testingConnection || creating}
                        className={btnGhost}
                    >
                        {step > 0 && <ChevronLeft className="h-4 w-4" />}
                        {step === 0 ? 'Cancel' : 'Back'}
                    </button>
                    {!isLastStep ? (
                        <button
                            type="button"
                            onClick={goNext}
                            disabled={continueDisabled}
                            className={btnPrimary}
                        >
                            Continue
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={createDisabled}
                            className={btnPrimary}
                        >
                            {creating ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
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
        </ModalPortal>
    )
}
