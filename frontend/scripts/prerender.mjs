// Renders every sitemap URL in headless Chrome after `vite build` and writes the
// finished HTML to dist/<path>/index.html, so crawlers get real content without
// running JavaScript. The untouched SPA shell is kept as dist/app-shell.html for
// the navigation fallback.
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { renderPreviewCard } from './seo/og-card.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const siteOrigin = (process.env.VITE_SITE_URL || 'https://galatayo.app').replace(/\/+$/, '')
// 4173 is on the API's CORS allow list; PRERENDER_PORT lets a second run share the machine.
const port = Number(process.env.PRERENDER_PORT || 4173)
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

/** Empty answers for a place's reviews and comments (GET only), so the render does not hit the API for them. */
function communityStubFor(pathname) {
  if (/\/places\/[^/]+\/reviews$/.test(pathname)) return { average_rating: null, review_count: 0, current_member_review: null }
  if (/\/places\/[^/]+\/comments$/.test(pathname)) return { comments: [] }
  return null
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

// Guides and tools live in the frontend, so their URLs are added here rather than by the API sitemap.
async function readFrontendPaths() {
  const guides = JSON.parse(await readFile(path.join(root, 'src/data/seoGuides.json'), 'utf8'))
  // Gala Today posts are committed daily into src/data/galaToday.json by the SEO daily workflow.
  const todayPosts = JSON.parse(await readFile(path.join(root, 'src/data/galaToday.json'), 'utf8'))
  return ['/saan-tayo', '/gala-tayo-meaning', '/cookies', '/copyright', '/disclaimer', '/long-weekends-2027-philippines', '/guides', ...guides.map((guide) => `/guides/${guide.slug}`), '/today', ...todayPosts.map((post) => `/today/${post.slug}`)]
}

// Hidden places and cities with no places yet open by link but stay out of the sitemap. They are
// written too (they render noindex), so the host serves 200 + noindex rather than a 404.
async function readNoindexExtraPaths() {
  try {
    const paths = JSON.parse(await readFile(path.join(dist, 'data', 'prerender-noindex-paths.json'), 'utf8'))
    return Array.isArray(paths) ? paths.filter((value) => typeof value === 'string' && value.startsWith('/places/')) : []
  } catch {
    return []
  }
}

const locFor = (routePath) => `${siteOrigin}${routePath === '/' ? '/' : routePath}`

// The sitemap should list only pages that rendered as indexable.
// URLs the host 301s (staticwebapp.config.json) must never be listed: Search Console flags them
// as "Page with redirect".
async function readRedirectedPaths() {
  const config = JSON.parse(await readFile(path.join(dist, 'staticwebapp.config.json'), 'utf8'))
  return new Set((config.routes ?? []).filter((route) => route.redirect).map((route) => route.route))
}

/** A sitemap URL is listable only when it is the exact final URL: no host redirect, no trailing slash. */
function isListable(loc, redirectedPaths) {
  try {
    const url = new URL(loc)
    if (url.origin !== siteOrigin || url.search || url.hash) return false
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) return false
    return !redirectedPaths.has(url.pathname)
  } catch {
    return false
  }
}

async function writeSitemap(addedPaths, droppedPaths) {
  const sitemapPath = path.join(dist, 'sitemap.xml')
  let sitemap = await readFile(sitemapPath, 'utf8')
  const dropped = new Set(droppedPaths.map(locFor))
  const redirectedPaths = await readRedirectedPaths()
  const removed = []
  sitemap = sitemap.replace(/\s*<url>\s*<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g, (block, loc) => {
    if (dropped.has(loc.trim())) return ''
    if (isListable(loc.trim(), redirectedPaths)) return block
    removed.push(loc.trim())
    return ''
  })
  removed.forEach((loc) => console.log(`  redirects, left out of sitemap: ${loc}`))
  const additions = addedPaths
    .filter((routePath) => !dropped.has(locFor(routePath)) && isListable(locFor(routePath), redirectedPaths))
    .map((routePath) => `  <url>\n    <loc>${locFor(routePath)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`)
  sitemap = sitemap.replace('</urlset>', `${additions.join('')}</urlset>`)
  await writeFile(sitemapPath, sitemap)
}

async function snapshot(page, routePath) {
  const expectedCanonical = `${siteOrigin}${routePath === '/' ? '/' : routePath}`

  const response = await page.goto(`${localOrigin}${routePath}`, { waitUntil: 'networkidle', timeout: 60000 })
  if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`)
  // A page that sends the app somewhere else (old slug, moved city) is a redirect, not a sitemap page.
  const landedPath = new URL(page.url()).pathname.replace(/\/+$/, '') || '/'
  if (landedPath !== routePath) throw Object.assign(new Error(`redirects to ${landedPath}`), { redirected: true })

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
    const lateLanding = new URL(page.url()).pathname.replace(/\/+$/, '') || '/'
    if (lateLanding !== routePath) throw Object.assign(new Error(`redirects to ${lateLanding}`), { redirected: true })
    const state = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      h1: document.querySelector('#root h1')?.textContent?.slice(0, 40),
      busy: [...document.querySelectorAll('#root [aria-busy="true"], #root .animate-pulse')].length,
    }))
    throw new Error(`not ready ${JSON.stringify(state)}`)
  })
  await page.waitForLoadState('networkidle')

  return page.evaluate(() => {
    const liveRoot = document.getElementById('root')
    // Inputs for the page's preview card: the hero or first listed photo, the H1 and the place count.
    const photo = [...liveRoot.querySelectorAll('.m-hero img, ol img, ul img, main img')].find((image) => /^https?:/.test(image.currentSrc || image.src))
    const count = [...liveRoot.querySelectorAll('li, span, p, div')].find((element) => element.children.length <= 1 && /^\d[\d,]* places?$/.test(element.textContent.trim()))
    const card = {
      title: liveRoot.querySelector('h1')?.textContent.trim() || document.title,
      area: liveRoot.querySelector('.m-facts li')?.textContent.trim() || '',
      count: count?.textContent.trim() || '',
      photoUrl: photo ? photo.currentSrc || photo.src : null,
    }
    const root = liveRoot.cloneNode(true)
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
      // CSS chunks the route loaded at runtime; without them the first paint is unstyled and shifts.
      'link[rel="stylesheet"]',
    ]
    const head = headSelectors
      .flatMap((selector) => [...document.head.querySelectorAll(selector)])
      .map((element) => element.outerHTML)

    return {
      card,
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

  // The shell already links its own stylesheet; add only the route's extra ones.
  const tags = head.filter((tag) => !tag.startsWith('<link') || !html.includes(tag.match(/href="([^"]+)"/)?.[1] ?? tag))
  // Marks a finished page: index.html hides the welcome splash and main.tsx keeps this HTML on screen until the app is ready.
  html = html.replace('<html lang="en-PH">', '<html lang="en-PH" data-prerendered>')
  // The finished HTML paints without JavaScript, so public/boot.js starts the app after first paint.
  const preloads = [...html.matchAll(/\s*<link rel="modulepreload" crossorigin href="([^"]+)">/g)]
  for (const match of preloads) html = html.replace(match[0], '')
  html = html.replace(
    /<script type="module" crossorigin src="([^"]+)"><\/script>/,
    (_, entry) => `<script defer src="/boot.js" data-entry="${entry}" data-preload="${preloads.map((match) => match[1]).join(' ')}"></script>`,
  )
  html = html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
  return html.replace(/<div id="root"><\/div>/, () => `<div id="root">${body}</div>`)
}

const defaultOgImage = `${siteOrigin}/images/og/galatayo-og.jpg`

const cardKickers = { guides: 'GalaTayo guide', places: 'GalaTayo · Places' }

/** Saves a page's preview card; if drawing fails, the page's tags point back to the default image. */
async function writePreviewCard(cardPage, imagePath, result) {
  const kind = imagePath.split('/')[2]
  try {
    await renderPreviewCard(cardPage, {
      fontDir: path.join(dist, 'fonts'),
      title: result.card.title,
      kicker: [cardKickers[kind] ?? 'GalaTayo', kind === 'guides' ? result.card.area : ''].filter(Boolean).join(' · '),
      footnote: result.card.count && !result.card.count.startsWith('0 ') ? `${result.card.count} · budget per head` : 'Budget per head on every pick',
      photoUrl: result.card.photoUrl,
    }, path.join(dist, decodeURIComponent(imagePath)))
    return result.head
  } catch (error) {
    console.warn(`  preview card failed for ${imagePath}: ${error.message.split('\n')[0]}`)
    return result.head.map((tag) => tag.replaceAll(`${siteOrigin}${imagePath}`, defaultOgImage))
  }
}

function buildLlmsTxt(pages) {
  const byPath = new Map(pages.map((page) => [page.routePath, page]))
  const home = byPath.get('/')
  const link = (page) => `- [${page.title.replace(/ \| GalaTayo$/, '')}](${siteOrigin}${page.routePath}): ${page.description}`
  const section = (heading, test) => {
    const matches = pages.filter((page) => test(page.routePath)).sort((a, b) => a.routePath.localeCompare(b.routePath))
    return matches.length ? [`## ${heading}`, '', ...matches.map(link), ''] : []
  }
  const placeCount = pages.filter((page) => /^\/places\/[^/]+\/[^/]+$/.test(page.routePath)).length

  return [
    '# GalaTayo (Gala Tayo)',
    '',
    `> ${home?.description || 'Discover the best places to visit around the Philippines by city, vibe and budget.'}`,
    '',
    "GalaTayo, also written \"Gala Tayo\" (Filipino for \"let's go out\"), is a free place discovery and planning app for the best places around the Philippines, built in the Philippines and live since July 2026.",
    '',
    `GalaTayo lists ${placeCount} places around the Philippines, each with a page covering budget, best time to visit, who it suits and location. Every place is listed in the sitemap: ${siteOrigin}/sitemap.xml`,
    '',
    '## How places are curated',
    '',
    '- Only the best: every place is scored on real evidence (editorial lists, Philippine travel apps, Reddit threads, social buzz, review volume, Michelin) plus how well it fits a day out. Plain eateries, chains, ordinary malls and hotels are left out of lists, search, AI picks and the sitemap; their pages still open by link but are marked noindex.',
    '- Dining that stays is destination-level: Michelin and top restaurants, iconic food experiences, food markets and food streets.',
    "- No fake reviews: ratings and reviews come only from real visitors. Team notes are labelled \"Editor's note\" and never count as a review or rating, so a place with no visitor reviews shows no rating.",
    '- Photos are credited with author, licence and source on each place page, with a takedown route for owners.',
    '- Guides list only places that pass the quality check, ranked best first. A guide with fewer than 4 such places is noindex until it fills up.',
    `- Full editorial standards: ${siteOrigin}/about#curation`,
    '',
    '## How to cite GalaTayo',
    '',
    '- Name: GalaTayo (also written "Gala Tayo").',
    `- Link to the specific place page (${siteOrigin}/places/<city>/<place>) or guide (${siteOrigin}/guides/<guide>) the fact came from, not the home page.`,
    '- Budgets are starting prices per head in Philippine pesos; say "according to GalaTayo" and link the page.',
    '- Contact for corrections: officialgalatayo@gmail.com',
    '',
    ...section('Tools', (routePath) => routePath === '/saan-tayo'),
    ...section('Guides', (routePath) => routePath.startsWith('/guides') || routePath.startsWith('/long-weekends')),
    ...section("Today's Plan (daily trend picks)", (routePath) => routePath.startsWith('/today')),
    ...section('Cities and regions', (routePath) => /^\/places\/[^/]+$/.test(routePath)),
    ...section('About', (routePath) => ['/about', '/gala-tayo-meaning', '/privacy', '/terms', '/cookies', '/copyright', '/disclaimer'].includes(routePath)),
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
  // The live site serves app-shell.html with 200 only for app screens (/home, /search, /login...),
  // and with 404 for everything else, so its raw HTML can say noindex without JavaScript.
  // Prerendered pages drop this tag in buildHtml and carry their own.
  await writeFile(shellPath, shellHtml.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex,follow" />'))

  const sitemapPaths = await readSitemapPaths()
  const addedPaths = (await readFrontendPaths()).filter((routePath) => !sitemapPaths.includes(routePath))
  const routes = [...sitemapPaths, ...addedPaths].slice(0, pageLimit)
  const extraPaths = (await readNoindexExtraPaths()).filter((routePath) => !routes.includes(routePath)).slice(0, Math.max(0, pageLimit - routes.length))
  const extraSet = new Set(extraPaths)
  const server = await startServer(shellHtml)
  const browser = await chromium.launch({ channel: process.env.PRERENDER_CHROME_CHANNEL || 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', serviceWorkers: 'block' })
  // A decided consent hides the cookie wall and keeps analytics off during the render.
  await context.addInitScript(() => localStorage.setItem('galatayo-cookie-consent', 'rejected'))
  // The production API rejects localhost origins, so fetch API calls from Node and add CORS.
  const apiBaseUrl = process.env.VITE_API_BASE_URL
  if (apiBaseUrl) {
    await context.route(`${new URL(apiBaseUrl).origin}/**`, async (route) => {
      // Reviews and comments load again in the visitor's browser, so skip them here to save Redis reads per build.
      const communityStub = route.request().method() === 'GET' && communityStubFor(new URL(route.request().url()).pathname)
      if (communityStub) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': localOrigin }, body: JSON.stringify(communityStub) })
      const response = await route.fetch({ headers: { ...route.request().headers(), origin: siteOrigin } })
      await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': localOrigin } })
    })
  }
  const failures = []
  const redirectedRoutes = []
  const noindexPaths = []
  const pages = []
  const queue = [...routes, ...extraPaths].map((routePath) => ({ routePath, attempt: 1 }))
  let rendered = 0
  let nextStartAt = 0

  async function worker() {
    const page = await context.newPage()
    const cardPage = await context.newPage()

    for (let job = queue.shift(); job; job = queue.shift()) {
      // Space page starts across all workers to stay under the API rate limit.
      const startAt = Math.max(Date.now(), nextStartAt)
      nextStartAt = startAt + minMsPerPage
      await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()))

      try {
        const result = await snapshot(page, job.routePath)
        // Pages that point og:image at /og/... get their card drawn here.
        const cardPath = result.head.join('\n').match(new RegExp(`property="og:image" content="${siteOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/og/[^"]+\\.jpg)"`))?.[1]
        if (cardPath) {
          result.head = await writePreviewCard(cardPage, cardPath, result)
        }
        // Noindex pages are still written so crawlers see the noindex tag without running JavaScript.
        const outputPath = job.routePath === '/' ? indexPath : path.join(dist, job.routePath, 'index.html')
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, buildHtml(shellHtml, result))
        if (result.robots.includes('noindex')) {
          noindexPaths.push(job.routePath)
          continue
        }
        pages.push({ routePath: job.routePath, title: result.title, description: result.description })
        rendered += 1
      } catch (error) {
        if (error.redirected) {
          redirectedRoutes.push(job.routePath)
        } else if (job.attempt < 2) {
          queue.push({ ...job, attempt: job.attempt + 1 })
        } else {
          failures.push(`${job.routePath}: ${error.message.split('\n')[0]}`)
        }
      }
    }

    await page.close()
    await cardPage.close()
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  await browser.close()
  server.close()

  await writeFile(path.join(dist, 'llms.txt'), buildLlmsTxt(pages))
  await writeSitemap(addedPaths, [...noindexPaths, ...redirectedRoutes])
  redirectedRoutes.forEach((routePath) => console.log(`  app redirect, left out of sitemap: ${routePath}`))
  console.log(`Prerendered ${rendered}/${routes.length} pages, plus ${noindexPaths.filter((routePath) => extraSet.has(routePath)).length}/${extraPaths.length} noindex link-only pages.`)
  noindexPaths.filter((routePath) => !extraSet.has(routePath)).forEach((routePath) => console.log(`  noindex, left out of sitemap: ${routePath}`))
  failures.forEach((failure) => console.warn(`  skipped ${failure}`))

  // Skipped pages still work through the SPA fallback; only fail when most sitemap pages broke.
  if (rendered < (routes.length - redirectedRoutes.length - noindexPaths.filter((routePath) => !extraSet.has(routePath)).length) * 0.8) {
    process.exitCode = 1
  }
}

await main()
