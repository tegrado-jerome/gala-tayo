import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getProofSourceLabel, isSafeHttpsUrl, normalizeProofLink, validateProofLinkSlots, withHttps } from './proofLinks.ts'

test('adds https:// to pasted links that lost it, and nothing else', () => {
  assert.equal(withHttps(' tiktok.com/@juan/video/1 '), 'https://tiktok.com/@juan/video/1')
  assert.equal(withHttps('www.rappler.com/travel/x'), 'https://www.rappler.com/travel/x')
  assert.equal(withHttps('http://example.com/a'), 'http://example.com/a')
  assert.equal(withHttps('javascript:alert(1)'), 'javascript:alert(1)')
  assert.equal(withHttps('kawasan falls'), 'kawasan falls')
  assert.equal(withHttps(''), '')
})

test('same rules as the API: https, public host, no homepage, tracking stripped', () => {
  const youtube = normalizeProofLink('https://www.youtube.com/watch?v=abc&si=x#t=3')
  assert.deepEqual(youtube, { ok: true, url: 'https://www.youtube.com/watch?v=abc', source: 'youtube' })
  assert.equal(normalizeProofLink('http://www.tiktok.com/@a/video/1').ok, false)
  assert.equal(normalizeProofLink('https://localhost/x').ok, false)
  assert.equal(normalizeProofLink('https://bit.ly/abc').ok, false)
  assert.equal(normalizeProofLink('https://www.instagram.com/').ok, false)
  assert.equal(normalizeProofLink(`https://example.com/${'a'.repeat(500)}`).ok, false)
})

test('slot errors line up with the inputs', () => {
  const result = validateProofLinkSlots(['https://www.rappler.com/travel/x', 'http://example.com/a', ''])
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.errors[0], '')
    assert.match(result.errors[1], /https:\/\//)
    assert.equal(result.errors[2], '')
  }
})

test('needs at least one link and flags repeats', () => {
  const empty = validateProofLinkSlots(['', ' ', ''])
  assert.equal(empty.ok, false)
  if (!empty.ok) assert.match(empty.errors[0], /at least 1 link/)

  const repeat = validateProofLinkSlots(['tiktok.com/@a/video/1', 'https://tiktok.com/@a/video/1?_t=9', ''])
  assert.equal(repeat.ok, false)
  if (!repeat.ok) assert.match(repeat.errors[1], /Same link/)

  assert.deepEqual(validateProofLinkSlots(['', 'instagram.com/reel/C1/?igsh=x', '']), {
    ok: true,
    links: ['https://instagram.com/reel/C1/'],
  })
})

test('labels and safe-link guard for the review screen', () => {
  assert.equal(getProofSourceLabel('https://vt.tiktok.com/ZS1/'), 'TikTok')
  assert.equal(getProofSourceLabel('https://www.gmanetwork.com/news/lifestyle/travel/1/'), 'gmanetwork.com')
  assert.equal(getProofSourceLabel('not a url'), 'Link')
  assert.equal(isSafeHttpsUrl('https://www.reddit.com/r/x/comments/1/'), true)
  assert.equal(isSafeHttpsUrl('javascript:alert(1)'), false)
  assert.equal(isSafeHttpsUrl(null), false)
})
