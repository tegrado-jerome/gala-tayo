import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toHomePath } from './homePath.ts'

test('old /home links become /, keeping the query and hash', () => {
  assert.equal(toHomePath('/home'), '/')
  assert.equal(toHomePath('/home/'), '/')
  assert.equal(toHomePath('/home?ref=copy'), '/?ref=copy')
  assert.equal(toHomePath('/home/?a=1#top'), '/?a=1#top')
})

test('other paths are left alone', () => {
  assert.equal(toHomePath('/'), '/')
  assert.equal(toHomePath('/homes'), '/homes')
  assert.equal(toHomePath('/home/extra'), '/home/extra')
  assert.equal(toHomePath('/places/manila?next=/home'), '/places/manila?next=/home')
})
