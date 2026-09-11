import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthAlert, AuthField, AuthFooter, AuthScreen, AuthSubmit } from '../components/AuthScreen'

export default function Login() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    const { login } = useAuth()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            await login(username, password)
            navigate('/')
        } catch (err) {
            setError(err.response?.data?.detail || 'Could not sign in. Check your username and password.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthScreen title="Sign in">
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
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                <AuthSubmit loading={loading} idleLabel="Sign in" loadingLabel="Signing in…" />

                <AuthFooter prompt="Don't have an account?" to="/register" label="Create one" />
            </form>
        </AuthScreen>
    )
}
