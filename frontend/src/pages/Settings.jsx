import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { ArrowRight, CheckCircle, RefreshCw, XCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import ConfirmModal from '../components/ConfirmModal'
import {
    PaperCard,
    paperBtnDanger,
    paperBtnGhost,
    paperBtnPrimary,
    paperDivider,
    paperEyebrow,
    paperField,
    paperSegment,
    paperTitle,
} from '../components/appUi'
import { useAutoClearingMessage } from '../hooks/useAutoClearingMessage'
import { fetchAuthConfig } from '../utils/authConfig'
import { formatDateSafe } from '../utils/numberFormatting'

const SECTIONS = [
    { id: 'account', label: 'Account' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'connections', label: 'Connections' },
]

const HISTORICAL_MONTHS = [1, 3, 6]

function sectionFromHash() {
    const id = window.location.hash.replace('#', '')
    return SECTIONS.some((section) => section.id === id) ? id : 'account'
}

function AlertBanner({ tone = 'error', children }) {
    if (!children) return null
    const isError = tone === 'error'
    return (
        <p
            role={isError ? 'alert' : 'status'}
            className={`rounded-md border px-3 py-2 text-sm ${
                isError
                    ? 'border-[var(--paper-brick)]/30 bg-[var(--paper-brick)]/8 text-[var(--paper-brick)]'
                    : 'border-[var(--paper-olive)]/30 bg-[var(--paper-olive)]/10 text-[var(--paper-olive)]'
            }`}
        >
            {children}
        </p>
    )
}

function FieldHint({ id, children }) {
    return (
        <p id={id} className="mt-1.5 text-xs text-[var(--paper-muted)]">
            {children}
        </p>
    )
}

function PaperSwitch({ checked, onChange, labelledBy, describedBy }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            onClick={() => onChange(!checked)}
            className={[
                'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/40',
                checked
                    ? 'border-[var(--paper-ink)] bg-[var(--paper-ink)]'
                    : 'border-[var(--paper-line)] bg-[var(--paper-canvas)]',
            ].join(' ')}
        >
            <span
                aria-hidden="true"
                className={[
                    'inline-block h-[18px] w-[18px] rounded-full transition-transform duration-200 motion-reduce:transition-none',
                    checked
                        ? 'translate-x-[22px] bg-[var(--paper-card)]'
                        : 'translate-x-1 bg-[var(--paper-muted)]',
                ].join(' ')}
            />
        </button>
    )
}

function ToggleRow({ title, description, checked, onChange }) {
    const uid = useId()
    const titleId = `${uid}-title`
    const descId = `${uid}-desc`

    return (
        <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0">
                <p id={titleId} className="text-sm font-medium text-[var(--paper-ink)]">
                    {title}
                </p>
                <p id={descId} className="mt-1 text-sm leading-relaxed text-[var(--paper-muted)]">
                    {description}
                </p>
            </div>
            <PaperSwitch
                checked={checked}
                onChange={onChange}
                labelledBy={titleId}
                describedBy={descId}
            />
        </div>
    )
}

function StatusPill({ ok, label }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${
                ok
                    ? 'border-[var(--paper-olive)]/25 bg-[var(--paper-olive)]/10 text-[var(--paper-olive)]'
                    : 'border-[var(--paper-line)] bg-[var(--paper-canvas)] text-[var(--paper-muted)]'
            }`}
        >
            {ok ? (
                <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {label}
        </span>
    )
}

function ConnectionStatusPanel({ ok, loading = false, title, detail, actions }) {
    return (
        <div
            role="status"
            aria-atomic="true"
            className={[
                'rounded-md border p-4',
                loading
                    ? 'border-[var(--paper-line)] bg-[var(--paper-canvas)]'
                    : ok
                      ? 'border-[var(--paper-olive)]/30 bg-[var(--paper-olive)]/10'
                      : 'border-[var(--paper-line)] bg-[var(--paper-canvas)]',
            ].join(' ')}
        >
            <div className="flex items-start gap-3">
                {loading ? (
                    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-[var(--paper-line)]" aria-hidden="true" />
                ) : ok ? (
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--paper-olive)]" aria-hidden="true" />
                ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--paper-muted)]" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--paper-ink)]">{title}</p>
                    {detail ? (
                        <p className="mt-1 text-sm leading-relaxed text-[var(--paper-muted)]">{detail}</p>
                    ) : null}
                </div>
            </div>
            {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
    )
}

function SectionNav({ active, onChange }) {
    return (
        <nav className="-mx-1 overflow-x-auto px-1" aria-label="Settings sections">
            <div className={`${paperSegment} w-max min-w-full`}>
                {SECTIONS.map((section) => {
                    const isActive = section.id === active
                    return (
                        <button
                            key={section.id}
                            type="button"
                            onClick={() => onChange(section.id)}
                            aria-current={isActive ? 'page' : undefined}
                            className={[
                                'inline-flex min-h-10 min-w-[7rem] flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper-accent)]/40',
                                isActive
                                    ? 'bg-[var(--paper-ink)] text-[var(--paper-card)]'
                                    : 'text-[var(--paper-muted)] hover:bg-[var(--paper-canvas)] hover:text-[var(--paper-ink)]',
                            ].join(' ')}
                        >
                            {section.label}
                        </button>
                    )
                })}
            </div>
        </nav>
    )
}

export default function Settings() {
    const {
        user,
        showInvestecNav,
        updateInvestecNavPreference,
        showRaUnderInvestments,
        updateRaUnderInvestmentsPreference,
        blurSensitiveValues,
        setBlurSensitiveValues,
    } = useAuth()

    const [section, setSection] = useState(sectionFromHash)

    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordFieldError, setPasswordFieldError] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useAutoClearingMessage(8000)
    const [loading, setLoading] = useState(false)

    const [username, setUsername] = useState('')
    const [usernameError, setUsernameError] = useState('')
    const [usernameSuccess, setUsernameSuccess] = useAutoClearingMessage(8000)
    const [usernameLoading, setUsernameLoading] = useState(false)
    const [restrictAuthorizedUsers, setRestrictAuthorizedUsers] = useState(true)

    const [openaiApiKey, setOpenaiApiKey] = useState('')
    const [hasApiKey, setHasApiKey] = useState(false)
    const [apiKeyChecked, setApiKeyChecked] = useState(false)
    const [replacingApiKey, setReplacingApiKey] = useState(false)
    const [apiKeyError, setApiKeyError] = useState('')
    const [apiKeySuccess, setApiKeySuccess] = useAutoClearingMessage(8000)
    const [apiKeyLoading, setApiKeyLoading] = useState(false)

    const [connectionStatus, setConnectionStatus] = useState(null)
    const [credentials, setCredentials] = useState({
        client_id: '',
        client_secret: '',
        api_key: '',
    })
    const [investecSaving, setInvestecSaving] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [investecError, setInvestecError] = useState('')
    const [investecSuccess, setInvestecSuccess] = useAutoClearingMessage(8000)
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
    const [showDeleteApiKeyConfirm, setShowDeleteApiKeyConfirm] = useState(false)
    const [showChangePasswordConfirm, setShowChangePasswordConfirm] = useState(false)
    const [syncingHistorical, setSyncingHistorical] = useState(null)
    const [syncSuccess, setSyncSuccess] = useAutoClearingMessage(8000)

    const [budgetPeriodStartDay, setBudgetPeriodStartDay] = useState(1)
    const [budgetPeriodLoading, setBudgetPeriodLoading] = useState(false)
    const [budgetPeriodSaving, setBudgetPeriodSaving] = useState(false)
    const [budgetPeriodError, setBudgetPeriodError] = useState('')
    const [budgetPeriodSuccess, setBudgetPeriodSuccess] = useAutoClearingMessage(8000)

    const usernameHintId = useId()
    const passwordConfirmErrorId = useId()
    const apiKeyHintId = useId()
    const periodHintId = useId()

    useEffect(() => {
        if (user?.username) setUsername(user.username)
    }, [user])

    useEffect(() => {
        fetchAuthConfig().then((config) => {
            setRestrictAuthorizedUsers(config.restrict_authorized_users)
        })
    }, [])

    useEffect(() => {
        const checkApiKey = async () => {
            try {
                const response = await axios.get('/api/auth/user/settings/openai-key')
                setHasApiKey(response.data.has_key)
            } catch (err) {
                console.error('Failed to check API key status', err)
            } finally {
                setApiKeyChecked(true)
            }
        }
        checkApiKey()
    }, [])

    const fetchConnectionStatus = async () => {
        try {
            const response = await axios.get('/api/investec/credentials/status')
            setConnectionStatus(response.data)
        } catch {
            setConnectionStatus({ is_connected: false })
        }
    }

    useEffect(() => {
        fetchConnectionStatus()
    }, [])

    useEffect(() => {
        const fetchBudgetPeriod = async () => {
            setBudgetPeriodLoading(true)
            try {
                const response = await axios.get('/api/budget/default_user')
                setBudgetPeriodStartDay(response.data.budget_period_start_day ?? 1)
            } catch {
                setBudgetPeriodStartDay(1)
            } finally {
                setBudgetPeriodLoading(false)
            }
        }
        fetchBudgetPeriod()
    }, [])

    useEffect(() => {
        const onHash = () => setSection(sectionFromHash())
        window.addEventListener('hashchange', onHash)
        return () => window.removeEventListener('hashchange', onHash)
    }, [])

    const goToSection = (id) => {
        setSection(id)
        const nextHash = `#${id}`
        if (window.location.hash !== nextHash) {
            window.history.replaceState(null, '', nextHash)
        }
    }

    const handleBudgetPeriodSave = async (e) => {
        e.preventDefault()
        setBudgetPeriodError('')
        setBudgetPeriodSuccess('')
        setBudgetPeriodSaving(true)
        try {
            await axios.patch('/api/budget/default_user', {
                budget_period_start_day: Math.max(1, Math.min(31, budgetPeriodStartDay)) || 1,
            })
            setBudgetPeriodSuccess('Budget period saved')
        } catch (err) {
            setBudgetPeriodError(err.response?.data?.detail || 'Failed to save budget period')
        } finally {
            setBudgetPeriodSaving(false)
        }
    }

    const handleInvestecConnect = async (e) => {
        e.preventDefault()
        setInvestecError('')
        setInvestecSuccess('')
        setInvestecSaving(true)

        try {
            await axios.post('/api/investec/credentials', credentials)
            setInvestecSuccess('Connected to Investec. Syncing accounts…')
            setCredentials({ client_id: '', client_secret: '', api_key: '' })
            await axios.post('/api/investec/accounts/sync')
            await fetchConnectionStatus()
            await updateInvestecNavPreference(true)
        } catch (err) {
            setInvestecError(err.response?.data?.detail || 'Could not connect. Check the credentials and try again.')
        } finally {
            setInvestecSaving(false)
        }
    }

    const handleInvestecDisconnect = async () => {
        setInvestecError('')
        setInvestecSuccess('')
        setInvestecSaving(true)

        try {
            await axios.delete('/api/investec/credentials')
            setInvestecSuccess('Disconnected from Investec')
            await fetchConnectionStatus()
        } catch (err) {
            setInvestecError(err.response?.data?.detail || 'Failed to disconnect')
        } finally {
            setInvestecSaving(false)
        }
    }

    const handleSyncNow = async () => {
        setInvestecError('')
        setInvestecSuccess('')
        setSyncing(true)

        try {
            await axios.post('/api/investec/accounts/sync')
            setInvestecSuccess('Accounts synced')
            await fetchConnectionStatus()
        } catch (err) {
            setInvestecError(err.response?.data?.detail || 'Failed to sync accounts')
        } finally {
            setSyncing(false)
        }
    }

    const handleHistoricalSync = async (months) => {
        setInvestecError('')
        setSyncSuccess('')
        setSyncingHistorical(months)

        try {
            const response = await axios.post('/api/investec/transactions/sync-historical', { months })
            setSyncSuccess(
                `Synced ${response.data.new_transactions} transactions from the last ${months} month(s) (${response.data.categorized} categorized by rules)`,
            )
        } catch (err) {
            setInvestecError(err.response?.data?.detail || 'Failed to sync historical transactions')
        } finally {
            setSyncingHistorical(null)
        }
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')
        setPasswordFieldError('')

        if (newPassword !== confirmPassword) {
            setPasswordFieldError('New passwords do not match')
            return
        }

        if (newPassword.length < 6) {
            setPasswordFieldError('Password must be at least 6 characters')
            return
        }

        setShowChangePasswordConfirm(true)
    }

    const doChangePassword = async () => {
        setLoading(true)

        try {
            await axios.post('/api/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword,
            })
            setSuccess('Password changed')
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setPasswordFieldError('')
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to change password')
        } finally {
            setLoading(false)
        }
    }

    const handleSaveApiKey = async (e) => {
        e.preventDefault()
        setApiKeyError('')
        setApiKeySuccess('')

        if (!openaiApiKey.trim()) {
            setApiKeyError('API key cannot be empty')
            return
        }

        setApiKeyLoading(true)

        try {
            await axios.put('/api/auth/user/settings/openai-key', {
                api_key: openaiApiKey,
            })
            setApiKeySuccess('OpenAI API key saved')
            setHasApiKey(true)
            setOpenaiApiKey('')
            setReplacingApiKey(false)
        } catch (err) {
            setApiKeyError(err.response?.data?.detail || 'Failed to save API key')
        } finally {
            setApiKeyLoading(false)
        }
    }

    const doDeleteApiKey = async () => {
        setApiKeyError('')
        setApiKeySuccess('')
        setApiKeyLoading(true)

        try {
            await axios.delete('/api/auth/user/settings/openai-key')
            setApiKeySuccess('OpenAI API key removed')
            setHasApiKey(false)
            setOpenaiApiKey('')
            setReplacingApiKey(false)
        } catch (err) {
            setApiKeyError(err.response?.data?.detail || 'Failed to delete API key')
        } finally {
            setApiKeyLoading(false)
        }
    }

    const handleUsernameChange = async (e) => {
        e.preventDefault()
        setUsernameError('')
        setUsernameSuccess('')

        if (!username.trim()) {
            setUsernameError('Username cannot be empty')
            return
        }

        if (username === user?.username) {
            setUsernameError('That is already your username')
            return
        }

        setUsernameLoading(true)

        try {
            await axios.put('/api/auth/user/username', {
                username: username.trim(),
            })
            setUsernameSuccess('Username updated. Sign in again for it to take effect.')
        } catch (err) {
            setUsernameError(err.response?.data?.detail || 'Failed to update username')
        } finally {
            setUsernameLoading(false)
        }
    }

    const investecConnected = Boolean(connectionStatus?.is_connected)
    const lastSyncedLabel = connectionStatus?.last_synced
        ? formatDateSafe(connectionStatus.last_synced, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : null

    return (
        <div className="mx-auto max-w-[1080px] space-y-8">
            <header className="space-y-4">
                <div>
                    <h1 className={paperTitle}>Settings</h1>
                    <p className={`mt-1 ${paperEyebrow}`}>Account, preferences, and connections</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusPill ok={Boolean(user?.username)} label={user?.username || 'Signed in'} />
                    <StatusPill ok={blurSensitiveValues} label={blurSensitiveValues ? 'Amounts hidden' : 'Amounts visible'} />
                    <StatusPill
                        ok={investecConnected}
                        label={investecConnected ? 'Banking connected' : showInvestecNav ? 'Banking not connected' : 'Banking hidden'}
                    />
                    <StatusPill ok={hasApiKey} label={hasApiKey ? 'Payslip AI ready' : 'Payslip AI needs a key'} />
                </div>
                <SectionNav active={section} onChange={goToSection} />
            </header>

            {section === 'account' ? (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <PaperCard className="p-5 sm:p-6">
                        <p className={paperEyebrow}>Username</p>
                        <p className="mt-2 text-sm leading-relaxed text-[var(--paper-muted)]">
                            Used to sign in. Changing it requires a new login.
                        </p>
                        <form onSubmit={handleUsernameChange} className="mt-5 space-y-3">
                            <AlertBanner>{usernameError}</AlertBanner>
                            <AlertBanner tone="success">{usernameSuccess}</AlertBanner>
                            <div>
                                <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                    Username
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                        id="username"
                                        type="text"
                                        autoComplete="username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        aria-describedby={restrictAuthorizedUsers ? usernameHintId : undefined}
                                        aria-invalid={Boolean(usernameError)}
                                        className={`${paperField} flex-1`}
                                    />
                                    <button
                                        type="submit"
                                        disabled={usernameLoading || username === user?.username}
                                        className={paperBtnPrimary}
                                    >
                                        {usernameLoading ? 'Saving…' : 'Save'}
                                    </button>
                                </div>
                                {restrictAuthorizedUsers ? (
                                    <FieldHint id={usernameHintId}>Must be in the authorized users list.</FieldHint>
                                ) : null}
                            </div>
                        </form>
                    </PaperCard>

                    <PaperCard className="p-5 sm:p-6">
                        <p className={paperEyebrow}>Password</p>
                        <p className="mt-2 text-sm leading-relaxed text-[var(--paper-muted)]">
                            Use a new password of at least 6 characters.
                        </p>
                        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
                            <AlertBanner>{error}</AlertBanner>
                            <AlertBanner tone="success">{success}</AlertBanner>
                            <div>
                                <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                    Current password
                                </label>
                                <input
                                    id="current-password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className={paperField}
                                />
                            </div>
                            <div>
                                <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                    New password
                                </label>
                                <input
                                    id="new-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    value={newPassword}
                                    onChange={(e) => {
                                        setNewPassword(e.target.value)
                                        setPasswordFieldError('')
                                    }}
                                    aria-invalid={Boolean(passwordFieldError)}
                                    className={paperField}
                                />
                            </div>
                            <div>
                                <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                    Confirm new password
                                </label>
                                <input
                                    id="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => {
                                        setConfirmPassword(e.target.value)
                                        setPasswordFieldError('')
                                    }}
                                    aria-invalid={Boolean(passwordFieldError)}
                                    aria-describedby={passwordFieldError ? passwordConfirmErrorId : undefined}
                                    className={paperField}
                                />
                                {passwordFieldError ? (
                                    <p id={passwordConfirmErrorId} role="alert" className="mt-1.5 text-sm text-[var(--paper-brick)]">
                                        {passwordFieldError}
                                    </p>
                                ) : null}
                            </div>
                            <button type="submit" disabled={loading} className={`${paperBtnPrimary} w-full`}>
                                {loading ? 'Changing…' : 'Change password'}
                            </button>
                        </form>
                    </PaperCard>
                </div>
            ) : null}

            {section === 'preferences' ? (
                <div className="space-y-5">
                    <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
                        <PaperCard className="p-5 sm:p-6">
                            <p className={paperEyebrow}>Display</p>
                            <div className={`mt-4 ${paperDivider}`}>
                                <ToggleRow
                                    title="Blur amounts"
                                    description="Hide balances and amounts when sharing your screen."
                                    checked={blurSensitiveValues}
                                    onChange={setBlurSensitiveValues}
                                />
                                <ToggleRow
                                    title="RA tools under Investments"
                                    description="Show RA Performance and the RA tax calculator on Investments and Home."
                                    checked={showRaUnderInvestments}
                                    onChange={updateRaUnderInvestmentsPreference}
                                />
                            </div>
                        </PaperCard>

                        <PaperCard className="p-5 sm:p-6">
                            <p className={paperEyebrow}>Budget period</p>
                            <p id={periodHintId} className="mt-2 text-sm leading-relaxed text-[var(--paper-muted)]">
                                Day of the month the period starts. Day 22 runs from the 22nd to the 21st of the next month.
                            </p>
                            {budgetPeriodLoading ? (
                                <p className="mt-5 text-sm text-[var(--paper-muted)]">Loading…</p>
                            ) : (
                                <form onSubmit={handleBudgetPeriodSave} className="mt-5">
                                    <label htmlFor="budget-period-start" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                        Period start day
                                    </label>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <input
                                            id="budget-period-start"
                                            type="number"
                                            min={1}
                                            max={31}
                                            value={budgetPeriodStartDay}
                                            onChange={(e) => setBudgetPeriodStartDay(parseInt(e.target.value, 10) || 1)}
                                            aria-describedby={periodHintId}
                                            className="h-10 w-16 shrink-0 rounded-md border border-[var(--paper-line)] bg-[var(--paper-card)] px-2 text-center text-sm font-medium tabular-nums text-[var(--paper-ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--paper-accent)]/20"
                                        />
                                        <span className="text-sm text-[var(--paper-muted)]">of each month</span>
                                        <button type="submit" disabled={budgetPeriodSaving} className={paperBtnPrimary}>
                                            {budgetPeriodSaving ? 'Saving…' : 'Save'}
                                        </button>
                                    </div>
                                </form>
                            )}
                            {budgetPeriodError ? (
                                <p role="alert" className="mt-2 text-sm text-[var(--paper-brick)]">
                                    {budgetPeriodError}
                                </p>
                            ) : null}
                            {budgetPeriodSuccess ? (
                                <p role="status" className="mt-2 text-sm text-[var(--paper-olive)]">
                                    {budgetPeriodSuccess}
                                </p>
                            ) : null}
                        </PaperCard>
                    </div>

                    <PaperCard className="overflow-hidden">
                        <Link
                            to="/category-guide"
                            className="group flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition-colors duration-200 hover:bg-[var(--paper-canvas)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--paper-accent)]/20 sm:px-6"
                        >
                            <div>
                                <p className="text-sm font-medium text-[var(--paper-ink)]">Category guide</p>
                                <p className="mt-0.5 text-sm text-[var(--paper-muted)]">Shared categories for budget and banking</p>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--paper-muted)] transition-colors group-hover:text-[var(--paper-ink)]" aria-hidden="true" />
                        </Link>
                    </PaperCard>
                </div>
            ) : null}

            {section === 'connections' ? (
                <div className="space-y-5">
                    <PaperCard className="p-5 sm:p-6">
                        <p className={paperEyebrow}>Investec banking</p>
                        <p className="mt-2 text-sm leading-relaxed text-[var(--paper-muted)]">
                            Sync accounts and transactions from Investec Programmable Banking.
                        </p>

                        <div className="mt-5 space-y-4">
                            <AlertBanner>{investecError}</AlertBanner>
                            <AlertBanner tone="success">{investecSuccess}</AlertBanner>

                            {connectionStatus === null ? (
                                <ConnectionStatusPanel
                                    loading
                                    title="Checking connection…"
                                    detail="Looking up your Investec credentials."
                                />
                            ) : investecConnected ? (
                                <>
                                    <ConnectionStatusPanel
                                        ok
                                        title="Banking is connected"
                                        detail={
                                            lastSyncedLabel
                                                ? `Last synced ${lastSyncedLabel}.`
                                                : 'Credentials are stored. Sync to pull the latest transactions.'
                                        }
                                        actions={
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handleSyncNow}
                                                    disabled={syncing}
                                                    className={paperBtnGhost}
                                                >
                                                    <RefreshCw
                                                        className={`h-3.5 w-3.5 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`}
                                                        aria-hidden="true"
                                                    />
                                                    {syncing ? 'Syncing' : 'Sync now'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowDisconnectConfirm(true)}
                                                    className={paperBtnDanger}
                                                >
                                                    Disconnect
                                                </button>
                                            </>
                                        }
                                    />

                                    <div>
                                        <p className="text-sm font-medium text-[var(--paper-ink)]">Import past transactions</p>
                                        <p className="mt-1 mb-3 text-sm text-[var(--paper-muted)]">
                                            Pull history for Budget Analysis. This can take a minute.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {HISTORICAL_MONTHS.map((months) => {
                                                const busy = syncingHistorical === months
                                                return (
                                                    <button
                                                        key={months}
                                                        type="button"
                                                        onClick={() => handleHistoricalSync(months)}
                                                        disabled={Boolean(syncingHistorical)}
                                                        className={paperBtnGhost}
                                                    >
                                                        {busy ? 'Syncing…' : `Last ${months} month${months > 1 ? 's' : ''}`}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        {syncSuccess ? (
                                            <p role="status" className="mt-2 text-sm text-[var(--paper-olive)]">
                                                {syncSuccess}
                                            </p>
                                        ) : null}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <ConnectionStatusPanel
                                        title="Banking is not connected"
                                        detail="Add your Programmable Banking credentials to import accounts and transactions."
                                    />
                                    <form onSubmit={handleInvestecConnect} className="space-y-3">
                                        <div>
                                            <label htmlFor="investec-client-id" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                                Client ID
                                            </label>
                                            <input
                                                id="investec-client-id"
                                                type="password"
                                                autoComplete="off"
                                                value={credentials.client_id}
                                                onChange={(e) => setCredentials({ ...credentials, client_id: e.target.value })}
                                                required
                                                className={paperField}
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="investec-client-secret" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                                Client secret
                                            </label>
                                            <input
                                                id="investec-client-secret"
                                                type="password"
                                                autoComplete="off"
                                                value={credentials.client_secret}
                                                onChange={(e) => setCredentials({ ...credentials, client_secret: e.target.value })}
                                                required
                                                className={paperField}
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="investec-api-key" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                                API key
                                            </label>
                                            <input
                                                id="investec-api-key"
                                                type="password"
                                                autoComplete="off"
                                                value={credentials.api_key}
                                                onChange={(e) => setCredentials({ ...credentials, api_key: e.target.value })}
                                                required
                                                className={paperField}
                                            />
                                        </div>
                                        <button type="submit" disabled={investecSaving} className={`${paperBtnPrimary} w-full`}>
                                            {investecSaving ? 'Connecting…' : 'Connect account'}
                                        </button>
                                    </form>
                                    <div className="rounded-md border border-[var(--paper-line)] bg-[var(--paper-canvas)] p-4">
                                        <p className="text-sm font-medium text-[var(--paper-ink)]">Where to find credentials</p>
                                        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-[var(--paper-muted)]">
                                            <li>Log in to Investec Online Banking</li>
                                            <li>Open Programmable Banking</li>
                                            <li>Create or use an existing API key</li>
                                            <li>Copy the Client ID, secret, and API key</li>
                                        </ol>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="mt-5 border-t border-[var(--paper-line)] pt-1">
                            <ToggleRow
                                title="Show Banking in the sidebar"
                                description="Adds Investec Banking to navigation. Connecting an account turns this on automatically."
                                checked={showInvestecNav}
                                onChange={updateInvestecNavPreference}
                            />
                        </div>
                    </PaperCard>

                    <PaperCard className="p-5 sm:p-6">
                        <p className={paperEyebrow}>Payslip extraction</p>
                        <p id={apiKeyHintId} className="mt-2 text-sm leading-relaxed text-[var(--paper-muted)]">
                            Encrypted OpenAI key used to read uploaded payslips.{' '}
                            <a
                                href="https://platform.openai.com/api-keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--paper-ink)] underline decoration-[var(--paper-line)] underline-offset-2 hover:decoration-[var(--paper-ink)]"
                            >
                                Get a key on OpenAI Platform
                            </a>
                            .
                        </p>

                        <div className="mt-5 space-y-4">
                            <AlertBanner>{apiKeyError}</AlertBanner>
                            <AlertBanner tone="success">{apiKeySuccess}</AlertBanner>

                            {!apiKeyChecked ? (
                                <ConnectionStatusPanel
                                    loading
                                    title="Checking API key…"
                                    detail="Looking up whether an OpenAI key is stored on this account."
                                />
                            ) : hasApiKey ? (
                                <ConnectionStatusPanel
                                    ok
                                    title="API key is saved"
                                    detail="An encrypted OpenAI key is stored on this account. Payslip uploads can be extracted automatically."
                                    actions={
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setReplacingApiKey((open) => !open)
                                                    setApiKeyError('')
                                                }}
                                                className={paperBtnGhost}
                                            >
                                                {replacingApiKey ? 'Cancel replace' : 'Replace key'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowDeleteApiKeyConfirm(true)}
                                                disabled={apiKeyLoading}
                                                className={paperBtnDanger}
                                            >
                                                Remove key
                                            </button>
                                        </>
                                    }
                                />
                            ) : (
                                <ConnectionStatusPanel
                                    title="No API key saved"
                                    detail="Payslip extraction is unavailable until you add an OpenAI API key."
                                />
                            )}

                            {apiKeyChecked && (!hasApiKey || replacingApiKey) ? (
                                <form onSubmit={handleSaveApiKey} className="space-y-3">
                                    <div>
                                        <label htmlFor="openai-api-key" className="mb-1.5 block text-sm font-medium text-[var(--paper-ink)]">
                                            {hasApiKey ? 'New API key' : 'API key'}
                                        </label>
                                        <input
                                            id="openai-api-key"
                                            type="password"
                                            autoComplete="off"
                                            required
                                            value={openaiApiKey}
                                            onChange={(e) => setOpenaiApiKey(e.target.value)}
                                            placeholder="sk-…"
                                            aria-describedby={apiKeyHintId}
                                            className={paperField}
                                        />
                                    </div>
                                    <button type="submit" disabled={apiKeyLoading} className={`${paperBtnPrimary} w-full`}>
                                        {apiKeyLoading ? 'Saving…' : hasApiKey ? 'Save new key' : 'Save key'}
                                    </button>
                                </form>
                            ) : null}
                        </div>
                    </PaperCard>
                </div>
            ) : null}

            <ConfirmModal
                isOpen={showDisconnectConfirm}
                onClose={() => setShowDisconnectConfirm(false)}
                onConfirm={handleInvestecDisconnect}
                title="Disconnect Investec?"
                message="This will permanently delete ALL Investec data. This action cannot be undone."
                details={[
                    'API credentials (Client ID, Secret, API Key)',
                    'All bank accounts',
                    'All transactions',
                    'All categorization rules',
                ]}
                confirmText="Disconnect"
                cancelText="Cancel"
                variant="danger"
            />

            <ConfirmModal
                isOpen={showDeleteApiKeyConfirm}
                onClose={() => setShowDeleteApiKeyConfirm(false)}
                onConfirm={doDeleteApiKey}
                title="Remove OpenAI API Key?"
                message="Your encrypted API key will be permanently deleted. You will no longer be able to extract payslip data automatically."
                confirmText="Remove Key"
                cancelText="Cancel"
                variant="danger"
            />

            <ConfirmModal
                isOpen={showChangePasswordConfirm}
                onClose={() => setShowChangePasswordConfirm(false)}
                onConfirm={doChangePassword}
                title="Change Password?"
                message="Are you sure you want to change your password? You will need to use the new password on your next login."
                confirmText="Change Password"
                cancelText="Cancel"
                variant="warning"
            />
        </div>
    )
}
