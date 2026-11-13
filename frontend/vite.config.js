import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticPayslipPreview } from './dev/staticPayslipPreview.js'

const hmrClientPort = Number(process.env.HMR_CLIENT_PORT || '')
const staticPreview = process.env.STATIC_PAYSLIP_PREVIEW === '1'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), staticPreview ? staticPayslipPreview() : null].filter(Boolean),
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
        ...(staticPreview
            ? {}
            : {
                proxy: {
                    '/api': {
                        target: 'http://backend:8000',
                        changeOrigin: true,
                    },
                },
            }),
    }
})
