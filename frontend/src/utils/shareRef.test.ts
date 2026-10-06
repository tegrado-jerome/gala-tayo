import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readShareRef, withShareRef } from './shareRef.ts'

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
