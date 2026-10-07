import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planWithAiHref, readPlanWithAiParams } from './planWithAiLink.ts'

test('carries chosen places as slugs next to the prompt, and reads them back', () => {
  const href = planWithAiHref('Plan a day out from my saved places: Ayala Museum, Binondo Chinatown', ['ayala-museum', 'binondo-chinatown'])
  assert.equal(href, '/plan-with-ai?q=Plan+a+day+out+from+my+saved+places%3A+Ayala+Museum%2C+Binondo+Chinatown&places=ayala-museum%2Cbinondo-chinatown')
  assert.deepEqual(readPlanWithAiParams(href.split('?')[1]), {
    prompt: 'Plan a day out from my saved places: Ayala Museum, Binondo Chinatown',
    placeSlugs: ['ayala-museum', 'binondo-chinatown'],
  })
})

test('a link with no prompt and no places is the plain page', () => {
  assert.equal(planWithAiHref('  '), '/plan-with-ai')
  assert.deepEqual(readPlanWithAiParams(''), { prompt: '', placeSlugs: [] })
})

test('keeps only real slugs, once each, at most six', () => {
  const slugs = ['a', 'b', 'b', 'c', 'd', 'e', 'f', 'g', 'Bad Slug', '../x']
  assert.match(planWithAiHref('x', slugs), /places=a%2Cb%2Cc%2Cd%2Ce%2Cf$/)
  assert.deepEqual(readPlanWithAiParams('places=a,,a,<script>,fort-santiago').placeSlugs, ['a', 'fort-santiago'])
})
