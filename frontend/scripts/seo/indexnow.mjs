// IndexNow on deploy: tells Bing, Yandex, Seznam and Naver which pages are new or changed, so
// they recrawl within hours instead of weeks. Google ignores IndexNow and reads the sitemap.
//   --prepare (before deploy): compares dist/ with the live site (sitemap URLs and lastmod, plus a
//     hash of each prerendered page published as /page-hashes.json) and saves the changed URLs.
//   --submit (after deploy): sends the saved URLs to api.indexnow.org.
// Never fails the build. Add --dry-run to print without sending.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { frontendDir } from './signals.mjs'

const HOST = 'galatayo.app'
const KEY = '70c28379c852580de89d3033d9fe287a'
const siteOrigin = `https://${HOST}`
const dist = path.join(frontendDir, 'dist')
const pendingPath = path.join(frontendDir, '.indexnow-pending.json')
const MAX_URLS = 10000

const readSitemap = (xml) =>
  new Map([...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, block]) => [block.match(/<loc>([^<]+)<\/loc>/)?.[1].trim(), block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1].trim() ?? '']).filter(([loc]) => loc))

async function fetchText(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } })
    return response.ok ? await response.text() : null
  } catch {
    return null
  }
}

async function findPages(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !['assets', 'data', 'images', 'fonts', 'og'].includes(entry.name)) found.push(...(await findPages(full)))
    else if (entry.name === 'index.html') found.push(full)
  }
  return found
}

// What a crawler would see change: title, description and the visible text of the page.
function pageHash(html) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
  const root = html.slice(html.indexOf('<div id="root">')).replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  return createHash('sha1').update(`${title}\n${description}\n${root}`).digest('hex').slice(0, 16)
}

async function prepare() {
  const sitemap = readSitemap(await readFile(path.join(dist, 'sitemap.xml'), 'utf8'))
  const hashes = {}
  for (const file of await findPages(dist)) {
    const routePath = '/' + path.relative(dist, path.dirname(file)).split(path.sep).join('/')
    const loc = routePath === '/' ? `${siteOrigin}/` : `${siteOrigin}${routePath}`
    if (sitemap.has(loc)) hashes[loc] = pageHash(await readFile(file, 'utf8'))
  }
  await writeFile(path.join(dist, 'page-hashes.json'), JSON.stringify(hashes))

  const [liveSitemapXml, liveHashesJson] = await Promise.all([fetchText(`${siteOrigin}/sitemap.xml`), fetchText(`${siteOrigin}/page-hashes.json`)])
  const liveSitemap = liveSitemapXml?.includes('<urlset') ? readSitemap(liveSitemapXml) : null
  let liveHashes = null
  try {
    liveHashes = liveHashesJson ? JSON.parse(liveHashesJson) : null
  } catch {
    liveHashes = null
  }

  const reasons = { new: 0, lastmod: 0, content: 0 }
  const changed = [...sitemap.entries()]
    .filter(([loc, lastmod]) => {
      if (!liveSitemap) return true
      if (!liveSitemap.has(loc)) return (reasons.new += 1)
      if (lastmod && lastmod !== liveSitemap.get(loc)) return (reasons.lastmod += 1)
      if (liveHashes && hashes[loc] && liveHashes[loc] !== hashes[loc]) return (reasons.content += 1)
      return false
    })
    .map(([loc]) => loc)
    .slice(0, MAX_URLS)

  await writeFile(pendingPath, JSON.stringify(changed))
  console.log(
    liveSitemap
      ? `IndexNow: ${changed.length} of ${sitemap.size} URLs changed (${reasons.new} new, ${reasons.lastmod} new lastmod, ${reasons.content} new content${liveHashes ? '' : '; no live page hashes yet'}).`
      : `IndexNow: live sitemap unavailable, will submit all ${changed.length} URLs.`,
  )
  changed.slice(0, 20).forEach((loc) => console.log(`  ${loc}`))
}

async function submit(dryRun) {
  let urls = []
  try {
    urls = JSON.parse(await readFile(pendingPath, 'utf8'))
  } catch {
    console.log('IndexNow: nothing prepared.')
    return
  }
  if (!urls.length) {
    console.log('IndexNow: no changed URLs.')
    return
  }
  if (dryRun) {
    console.log(`IndexNow dry run: would submit ${urls.length} URLs.`)
    return
  }
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${siteOrigin}/${KEY}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(30000),
  })
  // 200 and 202 both mean accepted; 422 means a URL is not on the host or the key file is missing.
  console.log(`IndexNow: HTTP ${response.status} for ${urls.length} URLs.${response.ok ? '' : ` ${(await response.text()).slice(0, 200)}`}`)
}

try {
  if (process.argv.includes('--prepare')) await prepare()
  else if (process.argv.includes('--submit')) await submit(process.argv.includes('--dry-run'))
  else console.log('Usage: node scripts/seo/indexnow.mjs --prepare | --submit [--dry-run]')
} catch (error) {
  console.warn(`IndexNow skipped: ${error.message}`)
}
