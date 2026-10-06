// Weekly: reads Search Console and GA4 for the last 28 days (with movers against the 28 days
// before), saves search queries for the guide picker and the keyword engine, checks Core Web
// Vitals with PageSpeed Insights, and writes the traffic part of the weekly SEO report. The
// Google parts skip cleanly when the service account secret is not set. Run: node report.mjs [--no-psi]
import { findSearchConsoleSite, getAccessToken, listSitemaps, readCredentials, runGa4Report, searchAnalytics } from './google.mjs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { frontendDir, readJson, report, writeJson } from './signals.mjs'

const DOMAIN = 'galatayo.app'
const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
const table = (header, rows) => (rows.length ? [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n') : '_No data yet._')
const pct = (value) => `${(value * 100).toFixed(1)}%`

async function searchConsoleSection(token) {
  const site = await findSearchConsoleSite(token, DOMAIN)
  if (!site) return '## Google Search\n\nThe service account is not a user on the Search Console property yet.'

  const range = { startDate: day(30), endDate: day(2) }
  const guidePageFilter = { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: '/guides/' }] }] }
  const [totals, queries, pages, sitemaps, guideRows] = await Promise.all([
    searchAnalytics(token, site, { ...range }),
    searchAnalytics(token, site, { ...range, dimensions: ['query'], rowLimit: 250 }),
    searchAnalytics(token, site, { ...range, dimensions: ['page'], rowLimit: 10 }),
    listSitemaps(token, site),
    searchAnalytics(token, site, { ...range, dimensions: ['page', 'query'], rowLimit: 1000, ...guidePageFilter }),
  ])
  const queryRows = (queries.rows ?? []).map((row) => ({ query: row.keys[0], clicks: row.clicks, impressions: row.impressions, position: row.position }))
  const movers = await moversSection(token, site, range)
  const guides = await guidePerformance(guideRows.rows ?? [])
  await writeJson('search-console.json', { range, queries: queryRows, guides: guides.map(({ slug, goodFor, category, impressions, clicks }) => ({ slug, goodFor, category, impressions, clicks })) })

  const total = totals.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  const strikingDistance = queryRows.filter((row) => row.position >= 8 && row.position <= 20 && row.impressions >= 5).slice(0, 10)
  return [
    `## Google Search (${range.startDate} to ${range.endDate})`,
    table(['Clicks', 'Impressions', 'CTR', 'Avg position'], [[total.clicks, total.impressions, pct(total.ctr), total.position.toFixed(1)]]),
    '### Top searches',
    table(['Search', 'Clicks', 'Impressions', 'Position'], queryRows.slice(0, 10).map((row) => [row.query, row.clicks, row.impressions, row.position.toFixed(1)])),
    '### Almost on page 1 (position 8 to 20)',
    table(['Search', 'Impressions', 'Position'], strikingDistance.map((row) => [row.query, row.impressions, row.position.toFixed(1)])),
    movers,
    '### Top pages',
    table(['Page', 'Clicks', 'Impressions'], (pages.rows ?? []).map((row) => [row.keys[0].replace(`https://${DOMAIN}`, ''), row.clicks, row.impressions])),
    '### How each guide is doing',
    table(
      ['Guide', 'Added', 'Clicks', 'Impressions', 'Position', 'Top search'],
      guides.filter((guide) => guide.impressions > 0).map((guide) => [`/guides/${guide.slug}`, guide.addedAt ?? '-', guide.clicks, guide.impressions, guide.position.toFixed(1), guide.topQuery]),
    ),
    `${guides.filter((guide) => guide.impressions === 0).length} of ${guides.length} guides have not shown in Google yet. New pages usually take 2 to 8 weeks.`,
    '### Sitemaps',
    table(['Sitemap', 'Last read', 'Errors', 'Warnings'], (sitemaps.sitemap ?? []).map((entry) => [entry.path, entry.lastDownloaded?.slice(0, 10) ?? '-', entry.errors ?? 0, entry.warnings ?? 0])),
  ].join('\n\n')
}

// Totals Search Console rows per guide page, so each guide's keywords can be judged by real traffic.
async function guidePerformance(rows) {
  const guides = JSON.parse(await readFile(path.join(frontendDir, 'src/data/seoGuides.json'), 'utf8'))
  return guides
    .map((guide) => {
      const own = rows.filter((row) => row.keys[0].replace(/\/+$/, '').endsWith(`/guides/${guide.slug}`))
      const impressions = own.reduce((sum, row) => sum + row.impressions, 0)
      const top = [...own].sort((a, b) => b.impressions - a.impressions)[0]
      return {
        ...guide,
        impressions,
        clicks: own.reduce((sum, row) => sum + row.clicks, 0),
        position: impressions ? own.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : 0,
        topQuery: top?.keys[1] ?? '-',
      }
    })
    .sort((a, b) => b.impressions - a.impressions)
}

// Compares the last 28 days with the 28 days before: which searches grew or shrank, and which pages lost clicks.
async function moversSection(token, site, range) {
  const previous = { startDate: day(58), endDate: day(31) }
  const [nowQueries, beforeQueries, nowPages, beforePages] = await Promise.all([
    searchAnalytics(token, site, { ...range, dimensions: ['query'], rowLimit: 1000 }),
    searchAnalytics(token, site, { ...previous, dimensions: ['query'], rowLimit: 1000 }),
    searchAnalytics(token, site, { ...range, dimensions: ['page'], rowLimit: 500 }),
    searchAnalytics(token, site, { ...previous, dimensions: ['page'], rowLimit: 500 }),
  ])
  const compare = (now, before) => {
    const old = new Map((before.rows ?? []).map((row) => [row.keys[0], row]))
    const keys = new Set([...(now.rows ?? []).map((row) => row.keys[0]), ...old.keys()])
    const current = new Map((now.rows ?? []).map((row) => [row.keys[0], row]))
    return [...keys].map((key) => {
      const a = current.get(key) ?? { clicks: 0, impressions: 0, position: 0 }
      const b = old.get(key) ?? { clicks: 0, impressions: 0, position: 0 }
      return { key, clicks: a.clicks, impressions: a.impressions, position: a.position, clickChange: a.clicks - b.clicks, impressionChange: a.impressions - b.impressions, isNew: !old.has(key) }
    })
  }
  const queryChanges = compare(nowQueries, beforeQueries)
  const rising = queryChanges.filter((row) => row.impressionChange > 0).sort((a, b) => b.impressionChange - a.impressionChange).slice(0, 10)
  const falling = queryChanges.filter((row) => row.impressionChange < 0).sort((a, b) => a.impressionChange - b.impressionChange).slice(0, 10)
  const losing = compare(nowPages, beforePages).filter((row) => row.clickChange < 0).sort((a, b) => a.clickChange - b.clickChange).slice(0, 10)
  const signed = (value) => (value > 0 ? `+${value}` : String(value))
  return [
    `### Rising searches (vs ${previous.startDate} to ${previous.endDate})`,
    table(['Search', 'Impressions', 'Change', 'Position'], rising.map((row) => [row.key + (row.isNew ? ' (new)' : ''), row.impressions, signed(row.impressionChange), row.position ? row.position.toFixed(1) : '-'])),
    '### Falling searches',
    table(['Search', 'Impressions', 'Change'], falling.map((row) => [row.key, row.impressions, signed(row.impressionChange)])),
    '### Pages losing clicks',
    table(['Page', 'Clicks', 'Change'], losing.map((row) => [row.key.replace(`https://${DOMAIN}`, ''), row.clicks, signed(row.clickChange)])),
  ].join('\n\n')
}

// Core Web Vitals for key pages. PageSpeed Insights without a key shares one small daily quota
// with everyone, so when it answers 429 the same Lighthouse audit runs on this machine instead
// (free, no account). Field data (real Chrome users) appears once the site has enough traffic.
const CWV_PAGES = ['/', '/guides', '/guides/things-to-do-in-baguio', '/places/manila', '/places/manila/fort-santiago']

const labRow = (page, lighthouse) => {
  const audits = lighthouse?.audits ?? {}
  return [
    page,
    Math.round((lighthouse?.categories?.performance?.score ?? 0) * 100),
    audits['largest-contentful-paint']?.displayValue ?? '-',
    audits['cumulative-layout-shift']?.displayValue ?? '-',
    audits['total-blocking-time']?.displayValue ?? '-',
  ]
}

async function pageSpeed(page) {
  const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url=${encodeURIComponent(`https://${DOMAIN}${page}`)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) })
  if (!response.ok) return { status: response.status }
  const data = await response.json()
  const field = data.loadingExperience?.metrics
  const fieldLcp = field?.LARGEST_CONTENTFUL_PAINT_MS?.percentile
  return {
    row: [
      ...labRow(page, data.lighthouseResult),
      fieldLcp ? `LCP ${(fieldLcp / 1000).toFixed(1)} s, INP ${field?.INTERACTION_TO_NEXT_PAINT?.percentile ?? '-'} ms (${data.loadingExperience.overall_category})` : 'not enough real-user data',
    ],
  }
}

async function localLighthouse(page) {
  const { execFile } = await import('node:child_process')
  const args = ['--yes', 'lighthouse@12', `https://${DOMAIN}${page}`, '--output=json', '--quiet', '--only-categories=performance', '--chrome-flags=--headless=new --no-sandbox']
  // On Windows Lighthouse can exit non-zero while cleaning up Chrome's temp folder after a complete run.
  const stdout = await new Promise((resolve, reject) =>
    execFile('npx', args, { maxBuffer: 64 * 1024 * 1024, timeout: 180000, shell: process.platform === 'win32' }, (error, out) => (out?.trimStart().startsWith('{') ? resolve(out) : reject(error))),
  )
  return [...labRow(page, JSON.parse(stdout)), 'PSI quota used up; local Lighthouse']
}

async function coreWebVitalsSection() {
  const rows = []
  let usePsi = true
  for (const page of CWV_PAGES) {
    try {
      const result = usePsi ? await pageSpeed(page) : { status: 429 }
      if (result.row) rows.push(result.row)
      else if (result.status === 429) {
        usePsi = false
        rows.push(await localLighthouse(page))
      } else rows.push([page, `PSI ${result.status}`, '-', '-', '-', '-'])
    } catch (error) {
      rows.push([page, error.name === 'TimeoutError' ? 'timeout' : 'error', '-', '-', '-', error.message.split('\n')[0].slice(0, 80)])
    }
    if (usePsi) await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  return [
    '## Core Web Vitals (mobile)',
    table(['Page', 'Perf', 'LCP (lab)', 'CLS (lab)', 'TBT (lab)', 'Real users (CrUX)'], rows),
    'Lab numbers use simulated slow 4G and run higher than what real visitors get; watch the trend and the real-user column.',
  ].join('\n\n')
}

async function analyticsSection(token, propertyId) {
  if (!propertyId) return '## Visitors\n\nSet the `GA4_PROPERTY_ID` repository variable to include GA4.'
  const dateRanges = [{ startDate: '28daysAgo', endDate: 'yesterday' }]
  const [channels, landing] = await Promise.all([
    runGa4Report(token, propertyId, { dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }] }),
    runGa4Report(token, propertyId, { dateRanges, dimensions: [{ name: 'landingPage' }], metrics: [{ name: 'sessions' }], limit: 10 }),
  ])
  return [
    '## Visitors (GA4, last 28 days, consented visitors only)',
    table(['Source', 'Sessions', 'Users'], (channels.rows ?? []).map((row) => [row.dimensionValues[0].value, row.metricValues[0].value, row.metricValues[1].value])),
    '### Top landing pages',
    table(['Page', 'Sessions'], (landing.rows ?? []).map((row) => [row.dimensionValues[0].value, row.metricValues[0].value])),
  ].join('\n\n')
}

async function trendsSection() {
  const since = day(7)
  const trends = (await readJson('trends.json', [])).filter((trend) => trend.date >= since).sort((a, b) => b.traffic - a.traffic)
  return ['## Fresh Google Trends this week (Philippines)', table(['Trend', 'Searches', 'Matches'], trends.slice(0, 10).map((trend) => [trend.title, `${trend.traffic}+`, [...trend.intents, trend.areaSlug].filter(Boolean).join(', ')]))].join('\n\n')
}

async function main() {
  const sections = [await trendsSection()]
  if (!process.argv.includes('--no-psi')) sections.push(await coreWebVitalsSection())
  const credentials = readCredentials()
  if (!credentials) {
    sections.push('## Google Search and visitors\n\nNot connected yet. Add the `GOOGLE_SERVICE_ACCOUNT_JSON` secret to include Search Console and GA4.')
  } else {
    const token = await getAccessToken(credentials)
    for (const section of [() => searchConsoleSection(token), () => analyticsSection(token, process.env.GA4_PROPERTY_ID)]) {
      try {
        sections.push(await section())
      } catch (error) {
        sections.push(`## Error\n\n${error.message}`)
      }
    }
  }
  await report(sections.join('\n\n'))
}

await main()
