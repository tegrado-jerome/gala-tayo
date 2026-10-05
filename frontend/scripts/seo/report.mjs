// Weekly: reads Search Console and GA4 for the last 28 days, saves search queries for the
// guide picker, and writes the traffic part of the weekly SEO report. Skips cleanly when the
// Google service account secret is not set.
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
