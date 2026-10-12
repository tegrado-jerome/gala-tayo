import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeException } from './errorReportCore.ts'

test('describes errors by name and message', () => {
  assert.equal(describeException(new TypeError('x is undefined')), 'TypeError: x is undefined')
  assert.equal(describeException('Load failed'), 'Load failed')
})

test('masks personal data before it reaches GA4', () => {
  assert.equal(describeException(new Error('No account for juan.dela+cruz@gmail.com')), 'Error: No account for [email]')
  assert.equal(
    describeException(new Error('Failed to fetch https://galatayo.app/gala-plans/abc?token=secret#x')),
    'Error: Failed to fetch https://galatayo.app/gala-plans/abc',
  )
  assert.equal(describeException(new Error('Plan ea79990c-c1e7-4dea-97c7-162859af9bd7 not found')), 'Error: Plan [token] not found')
  assert.equal(describeException('Call 09171234567'), 'Call #')
})

test('keeps descriptions within the GA4 limit', () => {
  assert.equal(describeException(new Error('a '.repeat(200)))?.length, 100)
})

test('skips browser noise and empty values', () => {
  assert.equal(describeException('Script error.'), null)
  assert.equal(describeException(new Error('ResizeObserver loop completed with undelivered notifications.')), null)
  assert.equal(describeException(undefined), null)
  assert.equal(describeException({}), null)
})
