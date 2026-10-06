// Copies Gala Today posts from the API into src/data/galaToday.json (newest first, max 90),
// keeping older posts the API may have dropped. A failed fetch leaves the file untouched.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/data/galaToday.json')
const base = (process.env.API_BASE_URL || '').replace(/\/+$/, '')

async function main() {
  if (!base) {
    console.log('API_BASE_URL not set; skipping Gala Today.')
    return
  }
  const url = `${base.endsWith('/api') ? base : `${base}/api`}/today?limit=90`
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(90_000) })
  if (!response.ok) {
    console.log(`Gala Today API ${response.status}; keeping the saved posts.`)
    return
  }
  const { posts = [] } = await response.json()
  const saved = JSON.parse(await readFile(file, 'utf8'))
  const merged = new Map([...saved, ...posts].map((post) => [post.slug, post]))
  const next = [...merged.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 90)
  await writeFile(file, `${JSON.stringify(next, null, 1)}\n`)
  console.log(`Gala Today: ${next.length} posts saved (${posts.length} from the API).`)
}

await main()
