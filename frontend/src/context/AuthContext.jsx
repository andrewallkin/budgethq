import { createContext, useState, useEffect, useContext } from 'react'
import axios from 'axios'

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const token = localStorage.getItem('token')
        if (token) {
            // Decode token to get username (simple implementation)
            // In a real app, you might validate the token with the backend
            try {
                const payload = JSON.parse(atob(token.split('.')[1]))
                setUser({ username: payload.sub })
                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
            } catch (e) {
                localStorage.removeItem('token')
            }
        }
        setLoading(false)
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
    }

    const register = async (username, password) => {
        const res = await axios.post('/api/auth/register', { username, password })
        const { access_token } = res.data

        localStorage.setItem('token', access_token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

        const payload = JSON.parse(atob(access_token.split('.')[1]))
        setUser({ username: payload.sub })
    }

    const logout = () => {
        localStorage.removeItem('token')
        delete axios.defaults.headers.common['Authorization']
        setUser(null)
    }

    // Setup axios interceptor to handle token expiration
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
