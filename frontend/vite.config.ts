import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Routes are lazy-loaded, so admin, AI map and Leaflet code split into their own chunks on their own.
// Forcing them into named chunks pulled shared modules in with them and made every page download them.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@supabase/')) return 'supabase'
          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:7071',
        changeOrigin: true,
        timeout: 50_000,
        proxyTimeout: 50_000,
      },
    },
  },
})
