import { createContext, useState, useEffect, useContext, useRef } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    const logoutTimerRef = useRef(null)

    const clearLogoutTimer = () => {
        if (logoutTimerRef.current) {
            clearTimeout(logoutTimerRef.current)
            logoutTimerRef.current = null
        }
    }

    const logout = () => {
        localStorage.removeItem('token')
        delete axios.defaults.headers.common['Authorization']
        setUser(null)
        clearLogoutTimer()
    }

    const scheduleLogout = (exp) => {
        // exp is in seconds since epoch (standard JWT)
        const expiresAt = exp * 1000
        const now = Date.now()
        const timeout = expiresAt - now

        // If already expired or exp is invalid, logout immediately
        if (!Number.isFinite(timeout) || timeout <= 0) {
            logout()
            return
        }

        clearLogoutTimer()
        logoutTimerRef.current = setTimeout(() => {
            logout()
        }, timeout)
    }

    useEffect(() => {
        const token = localStorage.getItem('token')
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]))
                // If token is already expired, clear it
                if (payload.exp && payload.exp * 1000 <= Date.now()) {
                    localStorage.removeItem('token')
                } else {
                    setUser({ username: payload.sub })
                    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
                    if (payload.exp) {
                        scheduleLogout(payload.exp)
                    }
                }
            } catch (e) {
                localStorage.removeItem('token')
            }
        }
        setLoading(false)

        return () => {
            clearLogoutTimer()
        }
    }, [])

    const login = async (username, password) => {
        const formData = new FormData()
        formData.append('username', username)
        formData.append('password', password)

        const res = await axios.post('/api/auth/login', formData)
        const { access_token } = res.data

        localStorage.setItem('token', access_token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

        const payload = JSON.parse(atob(access_token.split('.')[1]))
        setUser({ username: payload.sub })
        if (payload.exp) {
            scheduleLogout(payload.exp)
        }
    }

    const register = async (username, password) => {
        const res = await axios.post('/api/auth/register', { username, password })
        const { access_token } = res.data

        localStorage.setItem('token', access_token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

        const payload = JSON.parse(atob(access_token.split('.')[1]))
        setUser({ username: payload.sub })
        if (payload.exp) {
            scheduleLogout(payload.exp)
        }
    }

    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response?.status === 401) {
                    // Token expired or invalid - auto logout
                    logout()
                }
                return Promise.reject(error)
            }
        )

        // Cleanup interceptor on unmount
        return () => axios.interceptors.response.eject(interceptor)
    }, [])

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
