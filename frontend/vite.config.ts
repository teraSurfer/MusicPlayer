import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: { '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Same origin as the API base URL, so XHR uploads are not subject to CORS in jsdom.
    environmentOptions: { jsdom: { url: 'http://localhost:8000/' } },
    env: { VITE_API_BASE_URL: 'http://localhost:8000' },
  },
})
