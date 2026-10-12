import { test as base, expect, type Page } from '@playwright/test'

export const API = 'https://galatayo-api-cvawfwgrg6akdmem.southeastasia-01.azurewebsites.net/api'

// Spaces tests out so a run never bursts requests at prod.
export const PACE_MS = 1500

export const test = base.extend<{ pace: void }>({
  pace: [
    async ({ context }, use) => {
      // A decided consent hides the cookie banner (it covers taps on mobile) and keeps analytics off.
      await context.addInitScript(() => localStorage.setItem('galatayo-cookie-consent', 'rejected'))
      await use()
      await new Promise((resolve) => setTimeout(resolve, PACE_MS))
    },
    { auto: true },
  ],
})

export { expect }

/** Every JSON-LD block on the page, parsed. Fails the test if one is not valid JSON. */
export async function readJsonLd(page: Page): Promise<Array<Record<string, unknown>>> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  return blocks.map((text) => JSON.parse(text))
}

/** The @type of every JSON-LD node, including nodes inside an @graph. */
export function jsonLdTypes(blocks: Array<Record<string, unknown>>): string[] {
  return blocks.flatMap((block) => {
    const nodes = Array.isArray(block['@graph']) ? (block['@graph'] as Array<Record<string, unknown>>) : [block]
    return nodes.flatMap((node) => node['@type'] ?? []) as string[]
  })
}
