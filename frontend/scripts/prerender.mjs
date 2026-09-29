// Renders every sitemap URL in headless Chrome after `vite build` and writes the
// finished HTML to dist/<path>/index.html, so crawlers get real content without
// running JavaScript. The untouched SPA shell is kept as dist/app-shell.html for
// the navigation fallback.
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const siteOrigin = (process.env.VITE_SITE_URL || 'https://galatayo.app').replace(/\/+$/, '')
// 4173 is on the API's CORS allow list.
const port = 4173
const localOrigin = `http://localhost:${port}`
// Each page makes about one call to an API endpoint limited to 60/min per IP (area pages: 30/min).
const minMsPerPage = Number(process.env.PRERENDER_MIN_MS_PER_PAGE || 1100)
const concurrency = 3
const pageLimit = Number(process.env.PRERENDER_LIMIT || Infinity)

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

function startServer(shellHtml) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, localOrigin).pathname)
    const filePath = path.join(dist, pathname)

    if (filePath.startsWith(dist) && (await isFile(filePath))) {
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' })
      response.end(await readFile(filePath))
      return
    }

    // Like the navigationFallback: missing files 404 so the app falls back to the API.
    if (path.extname(pathname) || pathname.startsWith('/data/')) {
      response.writeHead(404)
      response.end()
      return
    }

    response.writeHead(200, { 'Content-Type': mimeTypes['.html'] })
    response.end(shellHtml)
  })

  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

async function readSitemapPaths() {
  const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8')
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1].trim()).pathname.replace(/\/+$/, '') || '/')
    .filter((value, index, all) => all.indexOf(value) === index)
}

async function snapshot(page, routePath) {
  const expectedCanonical = `${siteOrigin}${routePath === '/' ? '/' : routePath}`

  const response = await page.goto(`${localOrigin}${routePath}`, { waitUntil: 'networkidle', timeout: 60000 })
  if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`)

  await page.waitForFunction(
    (canonical) => {
      const link = document.querySelector('link[rel="canonical"]')
      const root = document.getElementById('root')
      return link?.getAttribute('href') === canonical
        && root?.querySelector('h1')
        && !root.querySelector('[aria-busy="true"], .animate-pulse')
    },
    expectedCanonical,
    { timeout: 30000 },
  ).catch(async () => {
    const state = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      h1: document.querySelector('#root h1')?.textContent?.slice(0, 40),
      busy: [...document.querySelectorAll('#root [aria-busy="true"], #root .animate-pulse')].length,
    }))
    throw new Error(`not ready ${JSON.stringify(state)}`)
  })
  await page.waitForLoadState('networkidle')

  return page.evaluate(() => {
    const root = document.getElementById('root').cloneNode(true)
    // Drop markup that only makes sense live: open dialogs, map tiles, blob images.
    root.querySelectorAll('[role="dialog"], .leaflet-container > *, script, img[src^="blob:"]').forEach((element) => element.remove())

    const headSelectors = [
      'title',
      'meta[name="description"]',
      'meta[name="robots"]',
      'link[rel="canonical"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]',
      'meta[name="google-site-verification"]',
      'meta[name="msvalidate.01"]',
      'script[type="application/ld+json"]',
    ]
    const head = headSelectors
      .flatMap((selector) => [...document.head.querySelectorAll(selector)])
      .map((element) => element.outerHTML)

    return {
      head,
      body: root.innerHTML,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || '',
    }
  })
}

function buildHtml(shellHtml, { head, body }) {
  let html = shellHtml
  // Remove the shell's generic tags; the page's own tags replace them.
  for (const pattern of [
    /<title>[\s\S]*?<\/title>\s*/,
    /<meta name="description"[^>]*>\s*/,
    /<meta name="robots"[^>]*>\s*/,
    /<meta property="og:[^"]*"[^>]*>\s*/g,
    /<meta name="twitter:[^"]*"[^>]*>\s*/g,
  ]) {
    html = html.replace(pattern, '')
  }

  html = html.replace('</head>', `    ${head.join('\n    ')}\n  </head>`)
  return html.replace(/<div id="root"><\/div>/, () => `<div id="root">${body}</div>`)
}

function buildLlmsTxt(pages) {
  const byPath = new Map(pages.map((page) => [page.routePath, page]))
  const home = byPath.get('/')
  const link = (page) => `- [${page.title.replace(/ \| GalaTayo$/, '')}](${siteOrigin}${page.routePath}): ${page.description}`
  const section = (heading, test) => {
    const matches = pages.filter((page) => test(page.routePath)).sort((a, b) => a.routePath.localeCompare(b.routePath))
    return matches.length ? [`## ${heading}`, '', ...matches.map(link), ''] : []
  }
  const placeCount = pages.filter((page) => /^\/places\/[^/]+\/[^/]+$/.test(page.routePath) && !page.routePath.startsWith('/places/categories/')).length

  return [
    '# GalaTayo',
    '',
    `> ${home?.description || 'Discover places to visit in Metro Manila by city, category, budget and vibe.'}`,
    '',
    `GalaTayo lists ${placeCount} places across Metro Manila, each with a page covering budget, best time to visit, who it suits and location. Every place is listed in the sitemap: ${siteOrigin}/sitemap.xml`,
    '',
    ...section('Guides', (routePath) => routePath.startsWith('/guides/')),
    ...section('Cities', (routePath) => /^\/places\/[^/]+$/.test(routePath) && routePath !== '/places/categories'),
    ...section('Categories', (routePath) => routePath.startsWith('/places/categories/')),
    ...section('About', (routePath) => ['/about', '/privacy', '/terms'].includes(routePath)),
  ].join('\n')
}

async function main() {
  const indexPath = path.join(dist, 'index.html')
  const shellPath = path.join(dist, 'app-shell.html')
  // Re-runs start from the pristine shell, not a previously prerendered index.html.
  if (!(await isFile(shellPath))) await copyFile(indexPath, shellPath)
  const shellHtml = await readFile(shellPath, 'utf8')

  if (!shellHtml.includes('<div id="root"></div>')) {
    throw new Error('dist/index.html has no empty <div id="root"></div> to fill')
  }

  const routes = (await readSitemapPaths()).slice(0, pageLimit)
  const server = await startServer(shellHtml)
  const browser = await chromium.launch({ channel: process.env.PRERENDER_CHROME_CHANNEL || 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', serviceWorkers: 'block' })
  // A decided consent hides the cookie wall and keeps analytics off during the render.
  await context.addInitScript(() => localStorage.setItem('galatayo-cookie-consent', 'rejected'))
  // The production API rejects localhost origins, so fetch API calls from Node and add CORS.
  const apiBaseUrl = process.env.VITE_API_BASE_URL
  if (apiBaseUrl) {
    await context.route(`${new URL(apiBaseUrl).origin}/**`, async (route) => {
      const response = await route.fetch({ headers: { ...route.request().headers(), origin: siteOrigin } })
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': localOrigin } })
    })
  }
  const failures = []
  const pages = []
  const queue = routes.map((routePath) => ({ routePath, attempt: 1 }))
  let rendered = 0
  let nextStartAt = 0

  async function worker() {
    const page = await context.newPage()

    for (let job = queue.shift(); job; job = queue.shift()) {
      // Space page starts across all workers to stay under the API rate limit.
      const startAt = Math.max(Date.now(), nextStartAt)
      nextStartAt = startAt + minMsPerPage
      await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()))

      try {
        const result = await snapshot(page, job.routePath)
        if (result.robots.includes('noindex')) throw new Error(`page is noindex (${result.robots})`)

        const outputPath = job.routePath === '/' ? indexPath : path.join(dist, job.routePath, 'index.html')
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, buildHtml(shellHtml, result))
        pages.push({ routePath: job.routePath, title: result.title, description: result.description })
        rendered += 1
      } catch (error) {
        if (job.attempt < 2) {
          queue.push({ ...job, attempt: job.attempt + 1 })
        } else {
          failures.push(`${job.routePath}: ${error.message.split('\n')[0]}`)
        }
      }
    }

    await page.close()
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  await browser.close()
  server.close()

  await writeFile(path.join(dist, 'llms.txt'), buildLlmsTxt(pages))
  console.log(`Prerendered ${rendered}/${routes.length} pages.`)
  failures.forEach((failure) => console.warn(`  skipped ${failure}`))

  // Skipped pages still work through the SPA fallback; only fail when most pages broke.
  if (rendered < routes.length * 0.8) {
    process.exitCode = 1
  }
}

await main()
