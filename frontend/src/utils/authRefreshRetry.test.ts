import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRefreshRetryFetch, isRefreshRequest, retryDelay } from './authRefreshRetry.ts'

const REFRESH_URL = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token'

function scripted(statuses: number[]) {
  const calls: string[] = []
  const fetch = async (input: RequestInfo | URL) => {
    calls.push(String(input))
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)]
    return new Response(status === 200 ? '{}' : 'no', { status })
  }
  return { fetch, calls }
}

test('only token refresh calls are retried', () => {
  assert.equal(isRefreshRequest(REFRESH_URL), true)
  assert.equal(isRefreshRequest('https://x.supabase.co/auth/v1/token?grant_type=password'), false)
  assert.equal(isRefreshRequest('https://api.galatayo.app/api/places'), false)
})

test('a 429 refresh is retried until it works, without reporting a failure', async () => {
  const { fetch, calls } = scripted([429, 429, 200])
  const sleeps: number[] = []
  const failures: number[] = []
  const wrapped = createRefreshRetryFetch(fetch, { sleep: async (ms) => void sleeps.push(ms), onRefreshFailed: (status) => failures.push(status) })
  const response = await wrapped(REFRESH_URL, { method: 'POST', body: '{"refresh_token":"r"}' })
  assert.equal(response.status, 200)
  assert.equal(calls.length, 3)
  assert.deepEqual(sleeps, [1000, 2000])
  assert.deepEqual(failures, [])
})

test('gives up after the last retry and reports it', async () => {
  const { fetch, calls } = scripted([429])
  const failures: number[] = []
  const wrapped = createRefreshRetryFetch(fetch, { sleep: async () => undefined, onRefreshFailed: (status) => failures.push(status) })
  const response = await wrapped(REFRESH_URL)
  assert.equal(response.status, 429)
  assert.equal(calls.length, 4)
  assert.deepEqual(failures, [429])
})

test('a revoked refresh token (400) is not retried but is reported', async () => {
  const { fetch, calls } = scripted([400])
  const failures: number[] = []
  const wrapped = createRefreshRetryFetch(fetch, { sleep: async () => undefined, onRefreshFailed: (status) => failures.push(status) })
  await wrapped(REFRESH_URL)
  assert.equal(calls.length, 1)
  assert.deepEqual(failures, [400])
})

test('other requests pass straight through', async () => {
  const { fetch, calls } = scripted([429])
  const wrapped = createRefreshRetryFetch(fetch, { sleep: async () => assert.fail('should not wait') })
  const response = await wrapped('https://x.supabase.co/rest/v1/places')
  assert.equal(response.status, 429)
  assert.equal(calls.length, 1)
})

test('Retry-After is honoured but capped', () => {
  assert.equal(retryDelay(new Response(null, { status: 429, headers: { 'retry-after': '2' } }), 0), 2000)
  assert.equal(retryDelay(new Response(null, { status: 429, headers: { 'retry-after': '60' } }), 0), 4000)
  assert.equal(retryDelay(new Response(null, { status: 429 }), 2), 4000)
})
