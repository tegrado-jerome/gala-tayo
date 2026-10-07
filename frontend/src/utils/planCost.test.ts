import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftMeals, estimatePerHead, MEAL_ESTIMATE, planCost, splitHeadcount, stopCost } from './planCost.ts'
import { composeGalaPlanDescription, parseGalaPlanDescription } from './planDescription.ts'

// QA4: one plan read ₱420 in the draft, ₱220 on the plan and ₱75 on Home. Every screen now prices from planCost.
const at = (latitude: number, longitude: number) => ({ latitude, longitude })
const fort = { place: { ...at(14.5958, 120.9705), category: 'Museum', budget_min: 75 } }
const cathedral = { place: { ...at(14.5917, 120.9734), category: 'Church', budget_min: 0 } }
// Binondo is filed as Heritage with free entry; the API flags it as a meal stop (a food street).
const binondo = { place: { ...at(14.6000, 120.9746), category: 'Heritage', budget_min: 0, meal_stop: true } }
const eatery = { place: { ...at(14.5990, 120.9740), category: 'Food', budget_min: null } }
const ocean = { place: { ...at(14.5794, 120.9724), category: 'Attraction', budget_min: 650 } }

test('a food stop with no price costs a meal, and says it is an estimate', () => {
  assert.deepEqual(stopCost(binondo.place), { amount: MEAL_ESTIMATE, isEstimate: true })
  assert.deepEqual(stopCost(binondo.place, 300), { amount: 300, isEstimate: true })
  assert.deepEqual(stopCost({ ...binondo.place, budget_min: 180 }), { amount: 180, isEstimate: false })
  assert.deepEqual(stopCost(eatery.place), { amount: MEAL_ESTIMATE, isEstimate: true }, 'a restaurant with no price')
  assert.deepEqual(stopCost(cathedral.place), { amount: 0, isEstimate: false })
  assert.deepEqual(stopCost({ ...fort.place, budget_min: null }), { amount: null, isEstimate: false })
})

test('a food crawl is never free', () => {
  const cost = planCost([fort, binondo], 1)
  assert.equal(cost.perHead, 75 + MEAL_ESTIMATE)
  assert.equal(cost.mealEstimate, MEAL_ESTIMATE)
})

test('asked-for meals no food stop covers are counted once', () => {
  const meals = { needed: 2, cost: 300 }
  // Binondo covers one meal at the estimate; the other meal still needs money.
  assert.equal(planCost([fort, binondo], 1, meals).perHead, 75 + 300 + 300)
  assert.equal(planCost([fort, binondo], 1, meals).extraMeals, 1)
  assert.equal(planCost([fort, cathedral], 1, { needed: 1, cost: 300 }).perHead, 75 + 300)
})

test('rides split by the group; the total is per head times people', () => {
  const solo = planCost([fort, ocean], 1)
  const four = planCost([fort, ocean], 4)
  assert.ok(solo.rides > 0, 'Fort Santiago to Manila Ocean Park is a ride')
  assert.equal(four.perHead, Math.round(75 + 650 + solo.rides / 4))
  assert.equal(four.total, four.perHead * 4)
  assert.equal(estimatePerHead([fort, ocean], 4), four.perHead)
})

test('the draft and the saved plan give the same number', () => {
  const draft = { meals_needed: 2, meal_cost: 250 }
  const stops = [fort, binondo, ocean]
  const draftPerHead = estimatePerHead(stops, 3, draftMeals(draft, stops))
  const saved = parseGalaPlanDescription(composeGalaPlanDescription({ description: 'Day out', dateMode: 'date', date: '2026-10-10', groupSize: 3, meals: draftMeals(draft, stops) }))
  assert.equal(estimatePerHead(stops, splitHeadcount(saved.groupSize, 0), saved.meals), draftPerHead)
})

test('an older draft with only the meal total keeps that total', () => {
  const stops = [fort, binondo]
  const meals = draftMeals({ meal_estimate_per_head: 500 }, stops)
  assert.equal(planCost(stops, 1, meals).perHead, 75 + 500)
  assert.equal(draftMeals({ meal_estimate_per_head: 0 }, stops), null)
  assert.equal(draftMeals({ meals_needed: 0, meal_cost: 250 }, stops), null)
})

test('the split counts who is going once friends reply', () => {
  assert.equal(splitHeadcount(4, 3), 3, 'planned 4, 3 going: split 3 ways')
  assert.equal(splitHeadcount(4, 1), 4, 'only the host so far: the planned size')
  assert.equal(splitHeadcount(2, 5), 5)
  assert.equal(splitHeadcount(null, 0), 1)
  assert.equal(splitHeadcount(4, 3, 6), 6, 'the host set 6 in Split costs')
  assert.equal(splitHeadcount(4, 3, 2), 3, 'never fewer than who is going')
})

test('plan settings round-trip through the description', () => {
  const lock = '0b6f8a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
  const text = composeGalaPlanDescription({ description: 'Notes', dateMode: 'date', date: '2026-10-10', groupSize: 4, meals: { needed: 2, cost: 250 }, lockedPollId: lock })
  assert.equal(text, `[gala_date:2026-10-10][gala_group:4][gala_meals:2x250][gala_lock:${lock}]\nNotes`)
  const parsed = parseGalaPlanDescription(text)
  assert.deepEqual(
    { date: parsed.date, groupSize: parsed.groupSize, meals: parsed.meals, lockedPollId: parsed.lockedPollId, description: parsed.description },
    { date: '2026-10-10', groupSize: 4, meals: { needed: 2, cost: 250 }, lockedPollId: lock, description: 'Notes' },
  )
  // Older plans have neither marker.
  const old = parseGalaPlanDescription('[gala_date:2026-10-10][gala_group:3]\nNotes')
  assert.equal(old.meals, null)
  assert.equal(old.lockedPollId, null)
  assert.equal(old.description, 'Notes')
})
