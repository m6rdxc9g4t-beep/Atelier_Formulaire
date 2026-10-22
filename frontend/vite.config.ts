// Vite : interface des formulaires. En développement, /api est relayé vers le backend (127.0.0.1:3300, ou ATELIER_API_URL).
// Ports (suite Atelier) : interface 5177, aperçu 4177, API + interface compilée 3300. strictPort : échec explicite en cas de conflit.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.ATELIER_API_URL ?? 'http://127.0.0.1:3300'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5177,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  preview: {
    host: '127.0.0.1',
    port: 4177,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
})
