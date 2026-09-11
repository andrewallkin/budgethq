import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const hmrClientPort = Number(process.env.HMR_CLIENT_PORT || '')

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
        ...(hmrClientPort
            ? { hmr: { clientPort: hmrClientPort } }
            : {}),
        watch: {
            usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
        },
        proxy: {
            '/api': {
                target: 'http://backend:8000',
                changeOrigin: true,
            }
        }
    }
})
