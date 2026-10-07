import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeReturnPath, encodeReturnPath } from './authReturnPath.ts'

// QA4: a sign-up from a place or an invite must come back there, even when the confirm link loses `next`.
const NOW = Date.UTC(2026, 9, 7, 12)

test('the remembered page comes back while it is fresh', () => {
  assert.equal(decodeReturnPath(encodeReturnPath('/places/manila/fort-santiago', NOW), NOW + 60_000), '/places/manila/fort-santiago')
  assert.equal(decodeReturnPath(encodeReturnPath('/gala-plans/abc?ref=copy', NOW), NOW), '/gala-plans/abc?ref=copy')
})

test('it expires after a day', () => {
  assert.equal(decodeReturnPath(encodeReturnPath('/gala-plans/abc', NOW), NOW + 24 * 60 * 60 * 1000 + 1), null)
})

test('only paths on this site, and nothing broken', () => {
  assert.equal(decodeReturnPath(encodeReturnPath('//evil.example', NOW), NOW), null)
  assert.equal(decodeReturnPath(encodeReturnPath('https://evil.example', NOW), NOW), null)
  assert.equal(decodeReturnPath('not json', NOW), null)
  assert.equal(decodeReturnPath(null, NOW), null)
  assert.equal(decodeReturnPath(JSON.stringify({ path: '/x' }), NOW), null)
})
