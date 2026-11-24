import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 127.0.0.1 en vez de localhost: en Windows "localhost" puede resolverse a IPv6 (::1)
    // y la primera conexión se cae con ECONNRESET
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
})