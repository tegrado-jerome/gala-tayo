import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultForeignCurrency, foreignRateNote, formatForeignAmount, hasPesoAmount, withForeignPrice } from './travelInfo.ts'

test('Philippine browsers keep PHP only', () => {
  assert.equal(defaultForeignCurrency(['en-PH', 'en-US']), null)
  assert.equal(defaultForeignCurrency(['fil']), null)
  assert.equal(defaultForeignCurrency(['tl-PH']), null)
  assert.equal(defaultForeignCurrency([]), null)
})

test('eurozone browsers get EUR, everyone else USD', () => {
  assert.equal(defaultForeignCurrency(['de-DE']), 'EUR')
  assert.equal(defaultForeignCurrency(['fr']), 'EUR')
  assert.equal(defaultForeignCurrency(['es-ES']), 'EUR')
  assert.equal(defaultForeignCurrency(['es-MX']), 'USD')
  assert.equal(defaultForeignCurrency(['en-GB']), 'USD')
  assert.equal(defaultForeignCurrency(['zh-Hant-TW']), 'USD')
  assert.equal(defaultForeignCurrency(['en-US']), 'USD')
})

test('formats small amounts with a decimal and large ones whole', () => {
  assert.equal(formatForeignAmount(1500, 'USD'), 'US$24')
  assert.equal(formatForeignAmount(75, 'USD'), 'US$1.2')
  assert.equal(formatForeignAmount(20, 'USD'), 'US$0.32')
  assert.equal(formatForeignAmount(1500, 'EUR'), '€21')
})

test('adds the approximate price after each peso amount and range', () => {
  assert.equal(withForeignPrice('About ₱1,500 per person', 'USD'), 'About ₱1,500 (≈ US$24) per person')
  assert.equal(withForeignPrice('Shared tours PHP 1,200-1,800 with lunch', 'USD'), 'Shared tours PHP 1,200-1,800 (≈ US$19–29) with lunch')
  assert.equal(withForeignPrice('₱50–₱150 docking fee', 'EUR'), '₱50–₱150 (≈ €0.71–2.1) docking fee')
  assert.equal(withForeignPrice('Locals ₱100, foreigners ₱200 (2025)', 'USD'), 'Locals ₱100 (≈ US$1.6), foreigners ₱200 (≈ US$3.2) (2025)')
})

test('leaves text alone when no foreign currency is wanted or there is no amount', () => {
  assert.equal(withForeignPrice('About ₱1,500 per person', null), 'About ₱1,500 per person')
  assert.equal(withForeignPrice('Free entry', 'USD'), 'Free entry')
  assert.equal(hasPesoAmount('Free entry'), false)
  assert.equal(hasPesoAmount('Entrance ₱30'), true)
})

test('the rate note names the rate and its date', () => {
  assert.equal(foreignRateNote('USD'), 'Approximate, at US$1 ≈ ₱62.8 (rate as of 9 Oct 2026). Pay in pesos.')
})
