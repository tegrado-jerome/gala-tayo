import { test, expect, readJsonLd, jsonLdTypes } from './fixtures'

const FORT_SANTIAGO = '/places/manila/fort-santiago'

test('home shows the hero and picks with no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Gala tayo')
  const picks = page.locator('section').filter({ has: page.getByRole('heading', { name: 'GalaTayo Picks' }) })
  await expect(picks.getByRole('link', { name: /\w/ }).nth(2)).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})

test('search finds Fort Santiago and opens its page', async ({ page }) => {
  await page.goto('/search')
  await page.getByRole('combobox', { name: 'Search places, cities, or vibes' }).fill('Fort Santiago')
  await page.getByRole('option', { name: /Fort Santiago/ }).first().click()
  await expect(page).toHaveURL(FORT_SANTIAGO)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fort Santiago')
})

test('place page shows photos, map, facts, JSON-LD and canonical', async ({ page }) => {
  await page.goto(FORT_SANTIAGO)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fort Santiago')

  const firstPhoto = page.getByRole('button', { name: /^Open photo 1 of \d+/ }).locator('img')
  await expect(firstPhoto).toBeVisible()
  await expect.poll(() => firstPhoto.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

  const map = page.getByLabel('Map of Fort Santiago')
  await map.scrollIntoViewIfNeeded()
  await expect(map.locator('.leaflet-tile-loaded').first()).toBeVisible()

  await expect(page.getByRole('list', { name: 'Key facts' }).getByRole('listitem').nth(1)).toBeVisible()

  const types = jsonLdTypes(await readJsonLd(page))
  expect(types).toContain('BreadcrumbList')
  expect(types).toContain('TouristAttraction')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://galatayo.app${FORT_SANTIAGO}`)
})

test('vibe page lists places', async ({ page }) => {
  await page.goto('/places?vibe=heritage')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Heritage')
  const list = page.getByRole('region', { name: 'Heritage and history' })
  await expect(list.locator('a[href^="/places/"]').nth(4)).toBeVisible()
})

test('Today page shows posts and CollectionPage JSON-LD', async ({ page }) => {
  await page.goto('/today')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Today's Plan")
  await expect(page.locator('main a[href^="/today/"]').first()).toBeVisible()
  expect(jsonLdTypes(await readJsonLd(page))).toContain('CollectionPage')
})

test('unknown URL shows the 404 page', async ({ page }) => {
  const response = await page.goto('/e2e-no-such-page')
  expect(response?.status()).toBe(404)
  await expect(page).toHaveTitle(/Page not found/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Looks like you got lost!')
})
