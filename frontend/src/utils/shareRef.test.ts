import assert from 'node:assert/strict'
import { test } from 'node:test'
import { goListShareUrl, goPlanInviteUrl, readShareRef, withShareRef } from './shareRef.ts'

test('invite links use go.galatayo.app and still take the share channel', () => {
  const plan = goPlanInviteUrl('ea79990c-c1e7-4dea-97c7-162859af9bd7')
  assert.equal(plan, 'https://go.galatayo.app/p/ea79990c-c1e7-4dea-97c7-162859af9bd7')
  assert.equal(withShareRef(plan, 'gc'), `${plan}?ref=gc`)
  assert.equal(withShareRef(goListShareUrl('n=Food+trip&p=a%2Cb'), 'copy'), 'https://go.galatayo.app/l?n=Food+trip&p=a%2Cb&ref=copy')
})

test('withShareRef tags the link and keeps the rest of it', () => {
  assert.equal(withShareRef('https://galatayo.app/places/manila/fort-santiago', 'gc'), 'https://galatayo.app/places/manila/fort-santiago?ref=gc')
  assert.equal(withShareRef('https://galatayo.app/saan-tayo?region=metro-manila&who=date', 'copy'), 'https://galatayo.app/saan-tayo?region=metro-manila&who=date&ref=copy')
  // Re-sharing replaces the old channel instead of stacking another one.
  assert.equal(withShareRef('https://galatayo.app/today/x?ref=story#picks', 'invite'), 'https://galatayo.app/today/x?ref=invite#picks')
})

test('readShareRef accepts only our channels', () => {
  assert.equal(readShareRef('?ref=story'), 'story')
  assert.equal(readShareRef('?n=Date&ref=gc'), 'gc')
  assert.equal(readShareRef('?ref=facebook'), null)
  assert.equal(readShareRef(''), null)
})
