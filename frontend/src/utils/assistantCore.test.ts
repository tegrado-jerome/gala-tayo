import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_MEMORY, historyFor, memorySummary, parseLine, parseNdjson, type AssistantTurn } from './assistantCore.ts'

describe('parseNdjson', () => {
  it('splits complete lines and keeps the unfinished tail', () => {
    const { events, rest } = parseNdjson('{"type":"status","text":"Searching"}\n{"type":"delta","text":"Ta')
    assert.deepEqual(events, [{ type: 'status', text: 'Searching' }])
    assert.equal(rest, '{"type":"delta","text":"Ta')
    const next = parseNdjson(`${rest}ra!"}\n`)
    assert.deepEqual(next.events, [{ type: 'delta', text: 'Tara!' }])
  })

  it('turns plain JSON error bodies into error events', () => {
    assert.deepEqual(parseLine('{"ok":false,"code":"daily_ai_limit_reached","message":"You have used all 5 free AI requests for today."}'), {
      type: 'error',
      code: 'daily_ai_limit_reached',
      message: 'You have used all 5 free AI requests for today.',
      usage: undefined,
    })
    assert.equal(parseLine('not json'), null)
  })
})

describe('historyFor', () => {
  it('sends only answered text turns', () => {
    const turns: AssistantTurn[] = [
      { id: '1', role: 'user', text: 'cafes in Makati' },
      { id: '2', role: 'assistant', text: 'Try **Ayala Museum**.', status: null, streaming: false, preview: [], previewMap: null, response: null, error: null },
      { id: '3', role: 'user', text: 'mas mura?' },
      { id: '4', role: 'assistant', text: '', status: null, streaming: false, preview: [], previewMap: null, response: null, error: 'Busy' },
    ]
    assert.deepEqual(historyFor(turns), [
      { role: 'user', content: 'cafes in Makati' },
      { role: 'assistant', content: 'Try **Ayala Museum**.' },
      { role: 'user', content: 'mas mura?' },
    ])
  })
})

describe('memorySummary', () => {
  it('lists what Tara remembers', () => {
    assert.deepEqual(memorySummary({ ...EMPTY_MEMORY, area: 'BGC', budgetPerHead: 750, groupSize: 2, indoor: true }), ['BGC', '₱750/head', '2 pax', 'Indoor'])
  })
})
