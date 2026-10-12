import { test, expect, PACE_MS } from './fixtures'

// Plain HTTP checks: the same for every viewport, so they run once.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'HTTP-only, runs in one project')
})

test('/home redirects to / with a 301', async ({ request }) => {
  const response = await request.get('/home', { maxRedirects: 0 })
  expect(response.status()).toBe(301)
  expect(new URL(response.headers().location, 'https://galatayo.app').href).toBe('https://galatayo.app/')
})

test('sitemap lists 400+ URLs and sampled place pages return 200', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim())
  expect(urls.length).toBeGreaterThan(400)

  const placeUrls = urls.filter((url) => /^https:\/\/galatayo\.app\/places\/[^/]+\/[^/]+$/.test(url))
  const sample = placeUrls.toSorted(() => Math.random() - 0.5).slice(0, 10)
  expect(sample).toHaveLength(10)
  test.info().annotations.push({ type: 'sampled', description: sample.join(' ') })

  for (const url of sample) {
    const response = await request.get(url, { maxRedirects: 0 })
    expect.soft(response.status(), url).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, PACE_MS))
  }
})
