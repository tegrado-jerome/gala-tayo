// Checks the prerendered pages in dist/ the way a crawler sees them: valid JSON-LD that only
// describes what is on the page, one H1, title/description/canonical/OG tags, and a sitemap
// that lists only indexable pages. Run after `npm run build && npm run prerender`.
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dist = path.join(root, 'dist')
const siteOrigin = (process.env.VITE_SITE_URL || 'https://galatayo.app').replace(/\/+$/, '')
const errors = []
const warnings = []

async function findPages(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !['assets', 'data', 'images', 'fonts', 'og'].includes(entry.name)) found.push(...(await findPages(full)))
    else if (entry.name === 'index.html') found.push(full)
  }
  return found
}

const decode = (text) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
const visibleText = (html) => decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')
const attr = (html, pattern) => html.match(pattern)?.[1]
const isAbsolute = (url) => typeof url === 'string' && /^https:\/\//.test(url)

function checkSequence(list, label, report) {
  if (!Array.isArray(list) || list.length === 0) return report(`${label} has no items`)
  list.forEach((item, index) => {
    if (item.position !== index + 1) report(`${label} item ${index + 1} has position ${item.position}`)
  })
}

function checkBlock(block, page, report) {
  const type = block['@type']
  if (block['@context'] !== 'https://schema.org') report(`${type} is missing @context https://schema.org`)
  if (!type) return report('JSON-LD block without @type')

  switch (type) {
    case 'BreadcrumbList':
      checkSequence(block.itemListElement, 'BreadcrumbList', report)
      for (const item of block.itemListElement ?? []) {
        if (!item.name || !isAbsolute(item.item)) report(`BreadcrumbList item "${item.name}" needs a name and an absolute URL`)
      }
      break
    case 'ItemList':
      checkSequence(block.itemListElement, 'ItemList', report)
      for (const item of block.itemListElement ?? []) {
        if (!isAbsolute(item.url)) report(`ItemList item "${item.name}" needs an absolute url`)
        // The list must describe links that are really on the page.
        else if (!page.body.includes(`href="${new URL(item.url).pathname}"`) && !page.body.includes(`href="${item.url}"`)) report(`ItemList links to ${item.url}, which is not linked on the page`)
      }
      if (block.numberOfItems !== undefined && block.numberOfItems !== block.itemListElement?.length) report('ItemList numberOfItems does not match its items')
      break
    case 'FAQPage':
      if (!block.mainEntity?.length) report('FAQPage has no questions')
      for (const question of block.mainEntity ?? []) {
        if (question['@type'] !== 'Question' || !question.name || !question.acceptedAnswer?.text) report('FAQPage question is missing name or acceptedAnswer.text')
        // FAQ markup is only allowed for questions and answers shown on the page.
        else if (!page.text.includes(question.name) || !page.text.includes(question.acceptedAnswer.text)) report(`FAQ "${question.name}" is not visible on the page`)
      }
      break
    case 'Organization':
      if (!block.name || !isAbsolute(block.url) || !isAbsolute(block.logo)) report('Organization needs name, url and logo')
      break
    case 'WebSite': {
      const action = block.potentialAction
      if (!block.name || !isAbsolute(block.url)) report('WebSite needs name and url')
      if (action && (!String(action.target).includes('{search_term_string}') || action['query-input'] !== 'required name=search_term_string')) report('WebSite SearchAction target or query-input is wrong')
      break
    }
    case 'CollectionPage':
    case 'AboutPage':
    case 'WebPage':
      if (!block.name || !isAbsolute(block.url)) report(`${type} needs name and an absolute url`)
      else if (block.url !== page.canonical) report(`${type} url ${block.url} differs from canonical ${page.canonical}`)
      break
    default:
      if (!block.name && !block.headline) report(`${type} has no name`)
  }
}

const pages = await findPages(dist)
const noindex = new Set()
let blockCount = 0

for (const file of pages) {
  const html = await readFile(file, 'utf8')
  const routePath = '/' + path.relative(dist, path.dirname(file)).split(path.sep).join('/')
  const expectedCanonical = routePath === '/' ? `${siteOrigin}/` : `${siteOrigin}${routePath}`
  const report = (message) => errors.push(`${routePath}: ${message}`)
  const warn = (message) => warnings.push(`${routePath}: ${message}`)
  const body = html.slice(html.indexOf('<div id="root">'))
  const page = { body, text: visibleText(body), canonical: attr(html, /<link rel="canonical" href="([^"]+)"/) }

  const robots = attr(html, /<meta name="robots" content="([^"]+)"/) ?? ''
  if (robots.includes('noindex')) noindex.add(expectedCanonical)

  const titles = html.match(/<title>[\s\S]*?<\/title>/g) ?? []
  if (titles.length !== 1) report(`has ${titles.length} <title> tags`)
  const title = decode(titles[0]?.replace(/<\/?title>/g, '') ?? '')
  if (title.length > 70) warn(`title is ${title.length} characters`)

  const description = decode(attr(html, /<meta name="description" content="([^"]*)"/) ?? '')
  if (!description) report('has no meta description')
  else if (description.length > 160) report(`description is ${description.length} characters`)

  if (page.canonical !== expectedCanonical) report(`canonical is ${page.canonical}, expected ${expectedCanonical}`)
  if (!/<html lang="[a-z]{2}/.test(html)) report('html has no lang')
  for (const property of ['og:title', 'og:description', 'og:url', 'og:image']) {
    if (!html.includes(`property="${property}"`)) report(`has no ${property}`)
  }
  const ogImage = attr(html, /<meta property="og:image" content="([^"]+)"/)
  if (ogImage?.startsWith(`${siteOrigin}/og/`)) {
    const imageFile = path.join(dist, new URL(ogImage).pathname)
    if (!(await stat(imageFile).catch(() => null))) report(`og:image ${ogImage} was not generated`)
  }

  const h1Count = (body.match(/<h1[\s>]/g) ?? []).length
  if (!robots.includes('noindex') && h1Count !== 1) report(`has ${h1Count} <h1> tags`)
  const imagesWithoutAlt = (body.match(/<img(?![^>]*\balt=)[^>]*>/g) ?? []).length
  if (imagesWithoutAlt) report(`${imagesWithoutAlt} images have no alt attribute`)

  for (const match of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    blockCount += 1
    let data
    try {
      data = JSON.parse(match[1])
    } catch (error) {
      report(`invalid JSON-LD: ${error.message}`)
      continue
    }
    for (const block of Array.isArray(data) ? data : [data]) {
      // A @graph shares one @context across its nodes.
      const nodes = block['@graph'] ? block['@graph'].map((node) => ({ '@context': block['@context'], ...node })) : [block]
      nodes.forEach((node) => checkBlock(node, page, report))
    }
  }
}

// The sitemap should list every indexable guide and nothing that is noindex.
const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8')
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim())
const duplicateLocs = locs.filter((loc, index) => locs.indexOf(loc) !== index)
if (duplicateLocs.length) errors.push(`sitemap: duplicate URLs ${duplicateLocs.slice(0, 5).join(', ')}`)
locs.filter((loc) => noindex.has(loc)).forEach((loc) => errors.push(`sitemap: lists noindex page ${loc}`))
const guides = JSON.parse(await readFile(path.join(root, 'src/data/seoGuides.json'), 'utf8'))
for (const guide of guides) {
  const loc = `${siteOrigin}/guides/${guide.slug}`
  const prerendered = pages.some((file) => file.endsWith(path.join('guides', guide.slug, 'index.html')))
  if (prerendered && !noindex.has(loc) && !locs.includes(loc)) errors.push(`sitemap: missing indexable guide ${loc}`)
  if (noindex.has(loc)) warnings.push(`guide ${guide.slug} is noindex (fewer than 4 gala-worthy places)`)
}

warnings.forEach((message) => console.warn(`warn  ${message}`))
errors.forEach((message) => console.error(`error ${message}`))
console.log(`Checked ${pages.length} pages and ${blockCount} JSON-LD blocks: ${errors.length} errors, ${warnings.length} warnings.`)
if (errors.length) process.exitCode = 1
