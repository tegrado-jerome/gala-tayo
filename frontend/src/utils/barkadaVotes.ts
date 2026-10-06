import type { GalaPlanOwner } from './galaPlansApi'
import type { GalaPlanPoll } from './galaPlanBarkadaApi'

/*
 * "Kailan?" date polls and "Pick the spot" decks ride on the plan polls tables.
 * A vote row is one per person per poll, so each date and each candidate place is its own
 * two-option poll, tagged in the question:
 *   "[kailan] 2026-10-12" or "[kailan] 2026-10-12 09:00"  options: Kaya, Hindi
 *   "[spot] <place-slug>"                                 options: <place name>, Pass
 */
export const KAILAN_TAG = '[kailan] '
export const SPOT_TAG = '[spot] '
export const KAILAN_YES = 'Kaya'
export const KAILAN_NO = 'Hindi'
export const SPOT_PASS = 'Pass'
export const DATE_OPTIONS = { min: 2, max: 5 }
export const SPOT_OPTIONS = { min: 3, max: 8 }

const KAILAN_PATTERN = /^\[kailan\] (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?$/
const SPOT_PATTERN = /^\[spot\] ([a-z0-9-]+)$/

export type DateChoice = {
  pollId: string
  date: string
  time: string | null
  yesOptionId: string
  noOptionId: string
  yes: GalaPlanOwner[]
  viewerYes: boolean
}

export type SpotChoice = {
  pollId: string
  slug: string
  placeId: string | null
  name: string
  taraOptionId: string
  passOptionId: string
  tara: number
  pass: number
  taraVoters: GalaPlanOwner[]
  viewerChoice: 'tara' | 'pass' | null
}

export function kailanQuestion(date: string, time?: string | null) {
  return `${KAILAN_TAG}${date}${time ? ` ${time}` : ''}`
}

export function spotQuestion(slug: string) {
  return `${SPOT_TAG}${slug}`
}

export function isTaggedPoll(poll: Pick<GalaPlanPoll, 'question'>) {
  return poll.question.startsWith(KAILAN_TAG) || poll.question.startsWith(SPOT_TAG)
}

function toDateChoice(poll: GalaPlanPoll): DateChoice | null {
  const match = poll.question.match(KAILAN_PATTERN)
  const [yes, no] = poll.options
  if (!match || !yes || !no) return null
  return {
    pollId: poll.id,
    date: match[1],
    time: match[2] ?? null,
    yesOptionId: yes.id,
    noOptionId: no.id,
    yes: yes.voters,
    viewerYes: poll.viewer_option_id === yes.id,
  }
}

function toSpotChoice(poll: GalaPlanPoll): SpotChoice | null {
  const match = poll.question.match(SPOT_PATTERN)
  const [tara, pass] = poll.options
  if (!match || !tara || !pass) return null
  return {
    pollId: poll.id,
    slug: match[1],
    placeId: tara.place_id,
    name: tara.label,
    taraOptionId: tara.id,
    passOptionId: pass.id,
    tara: tara.votes,
    pass: pass.votes,
    taraVoters: tara.voters,
    viewerChoice: poll.viewer_option_id === tara.id ? 'tara' : poll.viewer_option_id === pass.id ? 'pass' : null,
  }
}

export function splitPolls(polls: GalaPlanPoll[]) {
  return {
    regular: polls.filter((poll) => !isTaggedPoll(poll)),
    dates: polls.map(toDateChoice).filter((choice): choice is DateChoice => choice !== null),
    spots: polls.map(toSpotChoice).filter((choice): choice is SpotChoice => choice !== null),
  }
}

function sortKey(choice: Pick<DateChoice, 'date' | 'time'>) {
  return `${choice.date} ${choice.time ?? '00:00'}`
}

/** The date most people can make; ties go to the earlier date. Null until someone says kaya. */
export function bestDate(dates: DateChoice[]) {
  const ranked = [...dates].sort((a, b) => b.yes.length - a.yes.length || sortKey(a).localeCompare(sortKey(b)))
  return ranked[0] && ranked[0].yes.length > 0 ? ranked[0] : null
}

/** The option the plan date was locked to: the matching date with the most kaya. */
export function lockedDate(dates: DateChoice[], planDate: string | null) {
  return planDate ? bestDate(dates.filter((choice) => choice.date === planDate)) ?? dates.find((choice) => choice.date === planDate) ?? null : null
}

/** Most tara first, then fewest pass, then the order the host added them. */
export function rankSpots(spots: SpotChoice[]) {
  return spots
    .map((spot, order) => ({ spot, order }))
    .sort((a, b) => b.spot.tara - a.spot.tara || a.spot.pass - b.spot.pass || a.order - b.order)
    .map((entry) => entry.spot)
}

export function spotWinner(spots: SpotChoice[]) {
  const [top] = rankSpots(spots)
  return top && top.tara > 0 ? top : null
}

export function formatDateChoice(choice: Pick<DateChoice, 'date' | 'time'>) {
  const day = new Date(`${choice.date}T00:00:00`).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
  if (!choice.time) return day
  const [hours, minutes] = choice.time.split(':').map(Number)
  return `${day} · ${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''} ${hours >= 12 ? 'PM' : 'AM'}`
}

/** "Sama ka? Gala tayo sa Intramuros on Sat, Oct 12 👉" — the link follows in the share sheet. */
export function inviteMessage(where: string, when: string | null) {
  return `Sama ka? Gala tayo sa ${where}${when ? ` on ${when}` : ''} 👉`
}

/** The group-chat message for a Plan with AI draft: the invite, the route and the cost each. */
export function gcInviteText({ stops, when, perHead }: { stops: string[]; when: string | null; perHead: number | null }) {
  const route = stops.length > 1 ? `\n${stops.join(' → ')}` : ''
  const cost = perHead ? `\nMga ₱${perHead.toLocaleString('en-PH')} each. G?` : perHead === 0 ? '\nLibre lang! G?' : '\nG?'
  return `${inviteMessage(stops[0] ?? 'labas', when)}${route}${cost}`
}
