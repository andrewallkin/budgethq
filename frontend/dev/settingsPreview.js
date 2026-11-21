function token() {
    const payload = Buffer.from(JSON.stringify({
        sub: 'preview',
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    })).toString('base64')
    return `preview.${payload}.preview`
}

function send(res, status, body) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
}

function drain(req) {
    return new Promise((resolve) => {
        req.on('data', () => {})
        req.on('end', resolve)
        req.on('error', resolve)
    })
}

export function settingsConnectionsPreview() {
    return {
        name: 'settings-connections-preview',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const url = new URL(req.url, 'http://localhost')
                if (!url.pathname.startsWith('/api')) {
                    next()
                    return
                }
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                    await drain(req)
                }
                const path = url.pathname

                if (req.method === 'POST' && path === '/api/auth/login') {
                    send(res, 200, { access_token: token(), token_type: 'bearer' })
                    return
                }
                if (req.method === 'GET' && path === '/api/auth/config') {
                    send(res, 200, { restrict_authorized_users: false })
                    return
                }
                if (req.method === 'GET' && path === '/api/auth/user/preferences') {
                    send(res, 200, { has_investec_account: true, show_ra_under_investments: false })
                    return
                }
                if (req.method === 'PUT' && path === '/api/auth/user/preferences') {
                    send(res, 200, { has_investec_account: true, show_ra_under_investments: false })
                    return
                }
                if (req.method === 'GET' && path === '/api/auth/user/settings/openrouter-key') {
                    send(res, 200, { has_key: false })
                    return
                }
                if (req.method === 'GET' && path === '/api/auth/user/settings/external-api-key') {
                    send(res, 200, { has_key: false, prefix: '', created_at: '' })
                    return
                }
                if (req.method === 'GET' && path === '/api/auth/user/settings/external-api-key/readonly') {
                    send(res, 200, { has_key: false, prefix: '', created_at: '' })
                    return
                }
                if (req.method === 'GET' && path === '/api/investec/credentials/status') {
                    send(res, 200, {
                        is_connected: true,
                        last_synced: '2026-11-20T08:15:00',
                    })
                    return
                }
                if (req.method === 'GET' && path === '/api/auth/telegram') {
                    send(res, 200, { connected: false, allowed_user_id: null })
                    return
                }
                if (req.method === 'GET' && path === '/api/budget/default_user') {
                    send(res, 200, { budget_period_start_day: 1 })
                    return
                }
                send(res, 404, { detail: 'Settings preview does not implement this route' })
            })
        },
    }
}
