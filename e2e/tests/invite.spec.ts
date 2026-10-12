import { test, expect, API } from './fixtures'

// A QA host (qa.critic.e2e@galatayo.app) creates a private plan through the API; a guest opens the invite link and RSVPs.
const { SUPABASE_URL, SUPABASE_ANON_KEY, E2E_QA_EMAIL, E2E_QA_PASSWORD } = process.env

test.describe('plan invite', () => {
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY || !E2E_QA_EMAIL || !E2E_QA_PASSWORD, 'QA account env not set')

  let hostToken = ''
  let planId = ''

  test.beforeAll(async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'creates prod data, so runs once (phone-first)')
    if (!E2E_QA_EMAIL?.endsWith('@galatayo.app')) throw new Error('QA test accounts only')
    const signIn = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_ANON_KEY! },
      data: { email: E2E_QA_EMAIL, password: E2E_QA_PASSWORD },
    })
    expect(signIn.status(), 'QA sign-in').toBe(200)
    hostToken = (await signIn.json()).access_token

    const place = await (await request.get(`${API}/places/fort-santiago`)).json()
    const created = await request.post(`${API}/gala-plans`, {
      headers: { Authorization: `Bearer ${hostToken}` },
      data: { title: 'E2E smoke test: Intramuros walk', visibility: 'private', items: [{ place_id: place.id }] },
    })
    expect(created.status(), await created.text()).toBe(201)
    planId = (await created.json()).plan.id
  })

  test.afterAll(async ({ request }) => {
    if (!planId) return
    const deleted = await request.delete(`${API}/gala-plans/${planId}`, { headers: { Authorization: `Bearer ${hostToken}` } })
    expect(deleted.ok(), 'plan cleanup').toBe(true)
  })

  test('guest opens the invite link and RSVPs', async ({ page }) => {
    await page.goto(`https://go.galatayo.app/p/${planId}`)
    await expect(page).toHaveURL(new RegExp(`galatayo\\.app/gala-plans/${planId}`))
    await expect(page.getByRole('heading', { name: 'E2E smoke test: Intramuros walk' })).toBeVisible()

    const going = page.getByRole('group', { name: 'Your RSVP' }).getByRole('button', { name: "I'm in!" })
    await going.click()
    await page.getByLabel('Your name').fill('E2E Guest')
    await page.getByRole('button', { name: 'Continue as guest' }).click()

    await expect(going).toHaveAttribute('aria-pressed', 'true')
    // The host counts as going, so the guest makes two.
    await expect(page.getByText('2 going', { exact: true }).first()).toBeVisible()
  })
})
