import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import {
    PaperCard,
    paperBtnPrimary,
    paperField,
    paperIconBtn,
    paperTitle,
} from './appUi'

const fieldClass = `${paperField} min-h-[44px]`
const submitClass = `${paperBtnPrimary} mt-2 w-full min-h-[44px]`
const footerLinkClass =
    'font-medium text-[var(--paper-ink)] underline decoration-[var(--paper-line)] underline-offset-2 hover:decoration-[var(--paper-muted)]'

export function AuthScreen({ title, children }) {
    return (
        <div className="app-shell paper-shell flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
            <div className="w-full max-w-[22rem] sm:max-w-sm">
                <h1 className={`mb-8 text-center ${paperTitle}`}>BudgetHQ</h1>

                <PaperCard className="p-6 sm:p-8">
                    <h2 className="text-lg font-semibold tracking-tight text-[var(--paper-ink)]">
                        {title}
                    </h2>
                    <div className="mt-6">{children}</div>
                </PaperCard>
            </div>
        </div>
    )
}

export function AuthAlert({ message }) {
    const ref = useRef(null)

    useEffect(() => {
        if (message) ref.current?.focus()
    }, [message])

    if (!message) return null

    return (
        <div
            ref={ref}
            role="alert"
            tabIndex={-1}
            className="rounded-md border border-[var(--paper-brick)]/30 bg-[var(--paper-canvas)] p-3 text-sm text-[var(--paper-brick)] outline-none"
        >
            {message}
        </div>
    )
}

export function AuthField({
    id,
    name,
    label,
    type = 'text',
    value,
    onChange,
    autoComplete,
    hint,
    error,
    required = true,
    autoFocus = false,
}) {
    const [visible, setVisible] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword && visible ? 'text' : type
    const hintId = hint ? `${id}-hint` : undefined
    const errorId = error ? `${id}-error` : undefined
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-sm text-[var(--paper-ink)]">
                {label}
            </label>
            <div className="relative">
                <input
                    id={id}
                    name={name || id}
                    type={inputType}
                    required={required}
                    autoFocus={autoFocus}
                    autoComplete={autoComplete}
                    autoCapitalize={type === 'text' ? 'none' : undefined}
                    autoCorrect={type === 'text' ? 'off' : undefined}
                    spellCheck={type === 'text' ? false : undefined}
                    value={value}
                    onChange={onChange}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    className={`${fieldClass} ${isPassword ? 'pr-11' : ''}`}
                />
                {isPassword ? (
                    <button
                        type="button"
                        onClick={() => setVisible((v) => !v)}
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        className={`${paperIconBtn} absolute right-0.5 top-1/2 -translate-y-1/2`}
                    >
                        {visible ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                    </button>
                ) : null}
            </div>
            {hint ? (
                <p id={hintId} className="mt-1.5 text-xs text-[var(--paper-muted)]">
                    {hint}
                </p>
            ) : null}
            {error ? (
                <p id={errorId} className="mt-1.5 text-xs text-[var(--paper-brick)]">
                    {error}
                </p>
            ) : null}
        </div>
    )
}

export function AuthSubmit({ loading, idleLabel, loadingLabel }) {
    return (
        <button type="submit" disabled={loading} className={submitClass}>
            {loading ? loadingLabel : idleLabel}
        </button>
    )
}

export function AuthFooter({ prompt, to, label }) {
    return (
        <p className="pt-1 text-center text-sm text-[var(--paper-muted)]">
            {prompt}{' '}
            <Link to={to} className={footerLinkClass}>
                {label}
            </Link>
        </p>
    )
}
