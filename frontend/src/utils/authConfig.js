import axios from 'axios'

const DEFAULT_AUTH_CONFIG = { restrict_authorized_users: true }

export async function fetchAuthConfig() {
    try {
        const res = await axios.get('/api/auth/config')
        return res.data
    } catch {
        return DEFAULT_AUTH_CONFIG
    }
}
