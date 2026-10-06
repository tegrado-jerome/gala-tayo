import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GalaPlanPoll } from './galaPlanBarkadaApi'
import {
  bestDate,
  formatDateChoice,
  inviteMessage,
  kailanQuestion,
  lockedDate,
  rankSpots,
  splitPolls,
  spotQuestion,
  spotWinner,
} from './barkadaVotes.ts'

const person = (id: string) => ({ user_id: id, username: id, avatar_url: null, provider_avatar_url: null })

function poll(id: string, question: string, votes: number[], viewerOption: number | null = null, placeId: string | null = null, labels = ['A', 'B']): GalaPlanPoll {
  const options = votes.map((count, index) => ({
    id: `${id}-o${index}`,
    label: labels[index],
    place_id: placeId,
    votes: count,
    voters: Array.from({ length: count }, (_, voter) => person(`${id}-${index}-${voter}`)),
  }))
  return {
    id,
    question,
    viewer_option_id: viewerOption === null ? null : options[viewerOption].id,
    total_votes: votes.reduce((sum, count) => sum + count, 0),
    options,
  }
}

test('builds and recognises tagged questions', () => {
  assert.equal(kailanQuestion('2026-10-12'), '[kailan] 2026-10-12')
  assert.equal(kailanQuestion('2026-10-12', '09:30'), '[kailan] 2026-10-12 09:30')
  assert.equal(spotQuestion('intramuros'), '[spot] intramuros')
})

test('splits regular polls from date and spot polls', () => {
  const split = splitPolls([
    poll('p1', 'Where should we eat?', [1, 2]),
    poll('d1', '[kailan] 2026-10-12 09:00', [2, 1], 0),
    poll('s1', '[spot] fort-santiago', [3, 1], 1, 'place-1', ['Fort Santiago', 'Pass']),
    poll('bad', '[kailan] next week', [0, 0]),
  ])
  assert.deepEqual(split.regular.map((entry) => entry.id), ['p1'])
  assert.equal(split.dates.length, 1)
  assert.deepEqual({ date: split.dates[0].date, time: split.dates[0].time, viewerYes: split.dates[0].viewerYes, yes: split.dates[0].yes.length }, { date: '2026-10-12', time: '09:00', viewerYes: true, yes: 2 })
  assert.deepEqual(
    { name: split.spots[0].name, slug: split.spots[0].slug, placeId: split.spots[0].placeId, tara: split.spots[0].tara, pass: split.spots[0].pass, viewer: split.spots[0].viewerChoice },
    { name: 'Fort Santiago', slug: 'fort-santiago', placeId: 'place-1', tara: 3, pass: 1, viewer: 'pass' },
  )
})

test('best date is the most kaya, ties go to the earlier date, none until someone votes', () => {
  const { dates } = splitPolls([
    poll('a', '[kailan] 2026-10-19', [2, 0]),
    poll('b', '[kailan] 2026-10-12 18:00', [2, 1]),
    poll('c', '[kailan] 2026-10-12 09:00', [1, 0]),
  ])
  assert.equal(bestDate(dates)?.pollId, 'b')
  assert.equal(bestDate(splitPolls([poll('z', '[kailan] 2026-10-12', [0, 2])]).dates), null)
  assert.equal(lockedDate(dates, '2026-10-12')?.pollId, 'b')
  assert.equal(lockedDate(dates, '2026-11-01'), null)
  assert.equal(lockedDate(dates, null), null)
})

test('spots rank by tara, then fewer pass, then the order added', () => {
  const { spots } = splitPolls([
    poll('s1', '[spot] one', [1, 0], null, 'p1', ['One', 'Pass']),
    poll('s2', '[spot] two', [3, 2], null, 'p2', ['Two', 'Pass']),
    poll('s3', '[spot] three', [3, 0], null, 'p3', ['Three', 'Pass']),
    poll('s4', '[spot] four', [1, 0], null, 'p4', ['Four', 'Pass']),
  ])
  assert.deepEqual(rankSpots(spots).map((spot) => spot.name), ['Three', 'Two', 'One', 'Four'])
  assert.equal(spotWinner(spots)?.name, 'Three')
  assert.equal(spotWinner(splitPolls([poll('s', '[spot] x', [0, 3], null, 'p', ['X', 'Pass'])]).spots), null)
})

test('formats dates and the Taglish invite', () => {
  assert.equal(formatDateChoice({ date: '2026-10-10', time: null }), 'Sat, Oct 10')
  assert.equal(formatDateChoice({ date: '2026-10-10', time: '18:30' }), 'Sat, Oct 10 · 6:30 PM')
  assert.equal(formatDateChoice({ date: '2026-10-10', time: '09:00' }), 'Sat, Oct 10 · 9 AM')
  assert.equal(inviteMessage('Intramuros', 'Sat, Oct 10'), 'Sama ka? Gala tayo sa Intramuros on Sat, Oct 10 👉')
  assert.equal(inviteMessage('Intramuros', null), 'Sama ka? Gala tayo sa Intramuros 👉')
})
