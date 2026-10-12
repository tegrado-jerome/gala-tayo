import { defineConfig, devices } from '@playwright/test'

// Smoke tests against the live site. One worker and no retries: prod is shared, and a flaky test is a bug.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'https://galatayo.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
    locale: 'en-PH',
    timezoneId: 'Asia/Manila',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
