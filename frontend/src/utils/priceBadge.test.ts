import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPriceBadgeLabel } from './priceBadge.ts'

test('a zero budget is free entry', () => {
  assert.equal(buildPriceBadgeLabel(0, 1), 'Free entry')
  assert.equal(buildPriceBadgeLabel('0', 1), 'Free entry')
})

test('a known budget is the starting price', () => {
  assert.equal(buildPriceBadgeLabel(150, 2), 'Starting from ₱150')
  assert.equal(buildPriceBadgeLabel('1200', 3), 'Starting from ₱1,200')
})

test('a missing budget is unknown, never free', () => {
  assert.equal(buildPriceBadgeLabel(null, 4, 'The 10-course tasting menu is around ₱7,500.'), 'Starting from ₱7,500')
  assert.equal(buildPriceBadgeLabel(undefined, 3, 'No public entrance fee found; you pay for dining or rooms.'), 'Pricey')
  assert.equal(buildPriceBadgeLabel('', 2), 'Moderate')
  assert.equal(buildPriceBadgeLabel(null, null), '')
})

test('amounts shared by a car, boat or group are not a per-person price', () => {
  assert.equal(buildPriceBadgeLabel(null, 3, 'Per vehicle: weekdays ₱200 parking + ₱800 consumable food voucher.'), 'Pricey')
  assert.equal(buildPriceBadgeLabel(null, 2, 'Boat hire runs ₱900 to ₱4,950 per boat, split across your group.'), 'Moderate')
})

test('ticketed venues without an amount say the price varies', () => {
  assert.equal(buildPriceBadgeLabel(null, 2, 'Check the latest ticket price.', 'Activity', 'Some Arena'), 'Starting from: varies')
})
