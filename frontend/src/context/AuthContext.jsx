import { createContext, useState, useEffect, useContext, useRef } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [showInvestecNav, setShowInvestecNav] = useState(() => {
        const saved = localStorage.getItem('showInvestecNav')
        return saved ? JSON.parse(saved) : false
    })
    const [showRaUnderInvestments, setShowRaUnderInvestments] = useState(() => {
        const saved = localStorage.getItem('showRaUnderInvestments')
        return saved ? JSON.parse(saved) : false
    })
    const [blurSensitiveValues, setBlurSensitiveValuesState] = useState(() => {
        const saved = localStorage.getItem('blurSensitiveValues')
        return saved ? JSON.parse(saved) : false
    })

    const logoutTimerRef = useRef(null)
    const investecNavRef = useRef(showInvestecNav)
    const raUnderInvestmentsRef = useRef(showRaUnderInvestments)

    useEffect(() => {
        investecNavRef.current = showInvestecNav
    }, [showInvestecNav])

    useEffect(() => {
        raUnderInvestmentsRef.current = showRaUnderInvestments
    }, [showRaUnderInvestments])

    const setBlurSensitiveValues = (value) => {
        setBlurSensitiveValuesState(value)
        localStorage.setItem('blurSensitiveValues', JSON.stringify(value))
    }

    const clearLogoutTimer = () => {
        if (logoutTimerRef.current) {
            clearTimeout(logoutTimerRef.current)
            logoutTimerRef.current = null
        }
    }

    const logout = () => {
        localStorage.removeItem('token')
        localStorage.removeItem('showInvestecNav')
        localStorage.removeItem('showRaUnderInvestments')
        delete axios.defaults.headers.common['Authorization']
        setUser(null)
        setShowInvestecNav(false)
        setShowRaUnderInvestments(false)
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

    const fetchAndApplyPreferences = async () => {
        try {
            const response = await axios.get('/api/auth/user/preferences')
            const investec = response.data.has_investec_account
            const ra = response.data.show_ra_under_investments
            setShowInvestecNav(investec)
            setShowRaUnderInvestments(ra)
            investecNavRef.current = investec
            raUnderInvestmentsRef.current = ra
            localStorage.setItem('showInvestecNav', JSON.stringify(investec))
            localStorage.setItem('showRaUnderInvestments', JSON.stringify(ra))
        } catch (err) {
            // Silently ignore — preferences are non-critical
        }
    }

    const updateInvestecNavPreference = async (value) => {
        setShowInvestecNav(value)
        investecNavRef.current = value
        localStorage.setItem('showInvestecNav', JSON.stringify(value))
        try {
            await axios.put('/api/auth/user/preferences', {
                has_investec_account: value,
                show_ra_under_investments: raUnderInvestmentsRef.current,
            })
        } catch (err) {
            // Best-effort — local state is already updated
        }
    }

    const updateRaUnderInvestmentsPreference = async (value) => {
        setShowRaUnderInvestments(value)
        raUnderInvestmentsRef.current = value
        localStorage.setItem('showRaUnderInvestments', JSON.stringify(value))
        try {
            await axios.put('/api/auth/user/preferences', {
                has_investec_account: investecNavRef.current,
                show_ra_under_investments: value,
            })
        } catch (err) {
            // Best-effort — local state is already updated
        }
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
                    fetchAndApplyPreferences()
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
        await fetchAndApplyPreferences()
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
        await fetchAndApplyPreferences()
    }

    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            (error) => {
                if (error.response?.status === 401) {
                    // Token expired or invalid — auto logout
                    logout()
                }
                return Promise.reject(error)
            }
        )

        // Cleanup interceptor on unmount
        return () => axios.interceptors.response.eject(interceptor)
    }, [])

    return (
        <AuthContext.Provider
            value={{
                user,
                login,
                register,
                logout,
                loading,
                showInvestecNav,
                updateInvestecNavPreference,
                showRaUnderInvestments,
                updateRaUnderInvestmentsPreference,
                blurSensitiveValues,
                setBlurSensitiveValues,
            }}
        >
            {!loading && children}
        </AuthContext.Provider>
    )
}
