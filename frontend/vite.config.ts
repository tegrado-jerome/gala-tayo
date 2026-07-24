import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function removeAdminAiMapsModulepreload(): Plugin {
  return {
    name: 'remove-admin-ai-maps-modulepreload',
    transformIndexHtml(html) {
      return html.replace(
        /<link rel="modulepreload"[^>]*href="\/assets\/admin-[^"]*"[^>]*>/g,
        '',
      ).replace(
        /<link rel="modulepreload"[^>]*href="\/assets\/ai-maps-[^"]*"[^>]*>/g,
        '',
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    removeAdminAiMapsModulepreload(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            if (id.includes('/src/pages/admin/')) return 'admin'
            if (id.includes('/src/pages/AskAiMapPage') || id.includes('/src/components/MapView') || id.includes('/src/utils/askAiMap')) return 'ai-maps'
            return undefined
          }

          if (id.includes('@supabase/supabase-js') || id.includes('@supabase/')) return 'supabase'
          if (id.includes('leaflet') || id.includes('react-leaflet')) return 'maps'
          if (id.includes('react-markdown') || id.includes('remark-gfm') || id.includes('micromark') || id.includes('unified')) return 'markdown'
          if (id.includes('@fortawesome')) return 'icons'
          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
        timeout: 50_000,
        proxyTimeout: 50_000,
      },
    },
  },
})
