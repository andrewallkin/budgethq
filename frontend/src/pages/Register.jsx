import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthAlert, AuthField, AuthFooter, AuthScreen, AuthSubmit } from '../components/AuthScreen'

export default function Register() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [fieldError, setFieldError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    const { register } = useAuth()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setFieldError('')

        if (password !== confirmPassword) {
            setFieldError('Passwords do not match')
            return
        }

        if (password.length < 6) {
            setFieldError('Password must be at least 6 characters')
            return
        }

        setLoading(true)

        try {
            await register(username, password)
            navigate('/')
        } catch (err) {
            setError(err.response?.data?.detail || 'Could not create your account. Try a different username.')
        } finally {
            setLoading(false)
        }
    }

    const passwordHint = 'At least 6 characters'
    const passwordFieldError = fieldError.includes('6 characters') ? fieldError : ''
    const confirmFieldError = fieldError.includes('match') ? fieldError : ''

    return (
        <AuthScreen title="Create an account">
            <form className="space-y-4" onSubmit={handleSubmit}>
                <AuthAlert message={error} />

                <AuthField
                    id="username"
                    label="Username"
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />

                <AuthField
                    id="password"
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    hint={passwordFieldError ? undefined : passwordHint}
                    error={passwordFieldError}
                    value={password}
                    onChange={(e) => {
                        setPassword(e.target.value)
                        setFieldError('')
                    }}
                />

                <AuthField
                    id="confirm-password"
                    name="confirm-password"
                    label="Confirm password"
                    type="password"
                    autoComplete="new-password"
                    error={confirmFieldError}
                    value={confirmPassword}
                    onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        setFieldError('')
                    }}
                />

                <AuthSubmit loading={loading} idleLabel="Create account" loadingLabel="Creating account…" />

                <AuthFooter prompt="Already have an account?" to="/login" label="Sign in" />
            </form>
        </AuthScreen>
    )
}
