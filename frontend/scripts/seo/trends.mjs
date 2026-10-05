// Daily: keeps Google Trends "trending now" searches in the Philippines that relate to going
// out (weather, holidays, events, food, areas), with Google's traffic estimate.
import { classifyTrend, readJson, writeJson } from './signals.mjs'

const FEED_URL = 'https://trends.google.com/trending/rss?geo=PH'
const KEEP_DAYS = 45

const field = (item, tag) => item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() ?? ''

async function main() {
  const response = await fetch(FEED_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!response.ok) throw new Error(`Trends feed ${response.status}`)
  const xml = await response.text()
  const today = new Date().toISOString().slice(0, 10)

  const fresh = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const title = field(item, 'title')
      const news = [...item.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)].map(([, value]) => value).join(' ')
      return { title, traffic: Number(field(item, 'ht:approx_traffic').replace(/\D/g, '')) || 0, date: today, ...classifyTrend(`${title} ${news}`) }
    })
    .filter((trend) => trend.intents.length > 0 || trend.areaSlug)

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10)
  const kept = (await readJson('trends.json', [])).filter((trend) => trend.date >= cutoff)
  const known = new Set(kept.map((trend) => `${trend.date}|${trend.title}`))
  const added = fresh.filter((trend) => !known.has(`${trend.date}|${trend.title}`))

  await writeJson('trends.json', [...kept, ...added])
  console.log(added.length ? added.map((trend) => `+ ${trend.title} (${trend.traffic}+): ${trend.intents.join(', ') || trend.areaSlug}`).join('\n') : 'No relevant trends today.')
}

await main()
