import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serializeJsonLd } from './jsonLd.ts'

test('a closing script tag in the data cannot break out of the JSON-LD block', () => {
  const json = serializeJsonLd({ headline: 'Trend </script><script>alert(1)</script>' })
  assert.equal(json.includes('</script>'), false)
  assert.equal(json.includes('<'), false)
})

test('the escaped JSON still parses to the same value', () => {
  const value = { '@type': 'Article', headline: 'a < b </script>', keywords: ['x'] }
  assert.deepEqual(JSON.parse(serializeJsonLd(value)), value)
})
