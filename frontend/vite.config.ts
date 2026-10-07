import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The host answers unknown URLs with 404 and this page (staticwebapp.config.json responseOverrides).
// It is the app shell marked noindex, so a 404 is never indexed while the app still boots and links work.
function notFoundPage(): Plugin {
  let outDir = 'dist'
  return {
    name: 'galatayo-not-found-page',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const shell = await readFile(path.join(outDir, 'index.html'), 'utf8')
      const page = shell
        .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex,follow" />')
        .replace(/<title>[\s\S]*?<\/title>/, '<title>Page not found | GalaTayo</title>')
      await writeFile(path.join(outDir, 'not-found.html'), page)
    },
  }
}

// Routes are lazy-loaded, so admin, AI map and Leaflet code split into their own chunks on their own.
// Forcing them into named chunks pulled shared modules in with them and made every page download them.
export default defineConfig({
  plugins: [react(), tailwindcss(), notFoundPage()],
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
