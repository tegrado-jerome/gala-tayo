import { test, expect } from './fixtures'

// Going offline mid-visit: the next page's code can't load, so the app must show a retry screen, not a blank page.
test('offline navigation shows the retry screen', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Gala tayo')
  await page.waitForLoadState('networkidle')

  await context.setOffline(true)
  await page.getByRole('navigation', { name: 'Browse by vibe' }).getByRole('link', { name: 'Beach' }).click()
  await expect(page.getByText("This page didn't load")).toBeVisible()
  await expect(page.getByText("You're offline.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await context.setOffline(false)
})
