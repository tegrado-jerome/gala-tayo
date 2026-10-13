// "Total at the gate": the entrance, environmental, terminal and boat fees a stop charges, read from the
// free-text fee lines in places.travel_info (local, foreigner, other). Only a clause that names one of
// those fees and a peso amount counts; anything else stays text for the reader, so a fee is never guessed.
import { formatForeignAmount, type TravelInfo } from './travelInfo.ts'

export type FeeKind = 'entrance' | 'environmental' | 'terminal' | 'boat'
export type FeeItem = { kind: FeeKind; min: number; max: number; perGroup: boolean; text: string }
export type Range = { min: number; max: number }

export type StopFees = {
  /** Fees for everyone (Filipinos, and foreigners where no foreigner rate replaces them). */
  local: FeeItem[]
  /** Fees that replace the local ones of the same kind for foreigners. */
  foreigner: FeeItem[]
  /** Named fees the text marks as conditional ("sometimes", "joiner tours include it"): shown, not totalled. */
  maybe: FeeItem[]
  /** The text says entry is free and lists no fee to count. */
  free: boolean
}

const KINDS: Array<[FeeKind, RegExp]> = [
  ['environmental', /\b(environmental|eco|reef|marine park|denr|tourism fee|user fee|conservation)/i],
  ['terminal', /\bterminal\b/i],
  ['boat', /\b(boats?|bancas?|bangkas?)\b/i],
  ['entrance', /\b(entrance|entry|admission|registration)\b/i],
]
const CONDITIONAL = /\b(sometimes|often|optional|if you|joiner|island-hopping|include[sd]?|extra)\b/i
const PER_GROUP = /\bper (group|boat|trip)\b/i
const SAME_AS_LOCAL = /\b(same as locals|no separate foreigner rate|same ₱)/i
const FREE = /\b(free|no (flat )?entrance fee)\b/i
const AMOUNT = String.raw`₱\s?(\d{1,3}(?:,\d{3})+|\d+)`
const PESO_RANGE = new RegExp(`${AMOUNT}(?:\\s?(?:[-–]|to)\\s?(?:₱\\s?)?(\\d{1,3}(?:,\\d{3})+|\\d+))?`)
const toNumber = (amount: string) => Number(amount.replace(/,/g, ''))

/**
 * A comma, "and", "plus" or "+" splits only when both sides carry an amount ("Terminal fee ₱150 and boat ₱50"),
 * so "entrance, green and LGU fees about ₱600" stays one fee.
 */
function splitBetweenAmounts(part: string): string[] {
  const [first, ...rest] = part.split(/(,\s*|\s(?:plus|and|\+)\s)/)
  const pieces = [first]
  for (let index = 0; index < rest.length; index += 2) {
    const [separator, next] = [rest[index], rest[index + 1] ?? '']
    if (pieces[pieces.length - 1].includes('₱') && next.includes('₱')) pieces.push(next)
    else pieces[pieces.length - 1] += separator + next
  }
  return pieces
}

/** Sentences, then clauses: "₱500 entrance plus ₱150 environmental fee; ..." -> one clause per fee. */
function clauses(text: string): Array<{ text: string; conditional: boolean }> {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z₱])/)
    .flatMap((sentence) => {
      const conditional = CONDITIONAL.test(sentence)
      return sentence
        .split(/[;:]/)
        .flatMap(splitBetweenAmounts)
        .map((part) => ({ text: part.trim(), conditional }))
        .filter((part) => part.text)
    })
}

function readClause(text: string, kind: FeeKind | null): FeeItem | null {
  const amount = PESO_RANGE.exec(text)
  if (!amount || !kind) return null
  const min = toNumber(amount[1])
  const max = amount[2] ? toNumber(amount[2]) : min
  return { kind, min: Math.min(min, max), max: Math.max(min, max), perGroup: PER_GROUP.test(text), text: text.replace(/\s+/g, ' ').replace(/\s([,.])/g, '$1').replace(/[.\s]+$/, '') }
}

const kindOf = (text: string) => KINDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null

/**
 * Fees named in one line. In the local and foreigner lines, a first clause with an amount and no fee word
 * ("₱170 per person") is that line's entrance rate, which is what those lines are for.
 */
export function readFeeLine(text: string | undefined, isRateLine: boolean): { sure: FeeItem[]; maybe: FeeItem[] } {
  const sure: FeeItem[] = []
  const maybe: FeeItem[] = []
  if (!text) return { sure, maybe }
  const parts = clauses(text)
  for (const part of parts) {
    const item = readClause(part.text, kindOf(part.text))
    if (item) (part.conditional ? maybe : sure).push(item)
  }
  if (isRateLine && sure.length === 0 && maybe.length === 0 && parts[0] && !parts[0].conditional) {
    const item = readClause(parts[0].text, 'entrance')
    if (item) sure.push(item)
  }
  return { sure, maybe }
}

export function stopFees(info: TravelInfo | null | undefined): StopFees | null {
  const fees = info?.fees
  if (!fees) return null
  const local = readFeeLine(fees.local, true)
  // "Same as locals", "no separate foreigner rate": the local fees apply, whatever amounts the line repeats.
  const foreigner = SAME_AS_LOCAL.test(fees.foreigner ?? '') ? { sure: [], maybe: [] } : readFeeLine(fees.foreigner, true)
  const other = readFeeLine(fees.other, false)
  const all = [...local.sure, ...other.sure]
  const counted = new Set([...all, ...foreigner.sure].map((item) => `${item.kind}:${item.min}:${item.max}`))
  return {
    local: all,
    foreigner: foreigner.sure,
    maybe: [...local.maybe, ...foreigner.maybe, ...other.maybe].filter((item) => !counted.has(`${item.kind}:${item.min}:${item.max}`)),
    free: all.length === 0 && foreigner.sure.length === 0 && FREE.test(`${fees.local ?? ''} ${fees.foreigner ?? ''}`),
  }
}

/** What a foreigner pays: the foreigner rates, plus every local fee of a kind the foreigner line doesn't price. */
export function foreignerItems(fees: StopFees): FeeItem[] {
  const replaced = new Set(fees.foreigner.map((item) => item.kind))
  return [...fees.foreigner, ...fees.local.filter((item) => !replaced.has(item.kind))]
}

const add = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max })
const ZERO: Range = { min: 0, max: 0 }

function sum(items: FeeItem[], perGroup: boolean): Range {
  return items.filter((item) => item.perGroup === perGroup).reduce((total, item) => add(total, item), ZERO)
}

export type GateStop = { slug: string; name: string; travel_info?: TravelInfo | null }

export type GateTotal = {
  /** Per person, before group fees are shared. */
  localEach: Range
  foreignerEach: Range
  /** Charged once per group (a boat for the group). */
  groupFees: Range
  total: Range
  /** Whether any stop has a foreigner rate that differs from the local one. */
  ratesDiffer: boolean
  stops: Array<{ slug: string; name: string; fees: StopFees | null; local: Range; foreigner: Range; group: Range }>
  unlisted: Array<{ slug: string; name: string }>
}

/** Gate fees for the whole plan: each stop's listed fees, the group's total and per-person shares. */
export function gateTotal(stops: GateStop[], people: number, foreigners: number): GateTotal {
  const size = Math.max(1, Math.round(people))
  const abroad = Math.min(size, Math.max(0, Math.round(foreigners)))
  const seen = new Set<string>()
  const rows = stops
    .filter((stop) => !seen.has(stop.slug) && seen.add(stop.slug))
    .map((stop) => {
      const fees = stopFees(stop.travel_info)
      const local = fees ? sum(fees.local, false) : ZERO
      const foreigner = fees ? sum(foreignerItems(fees), false) : ZERO
      const group = fees ? sum(fees.local, true) : ZERO
      return { slug: stop.slug, name: stop.name, fees, local, foreigner, group }
    })
  const localEach = rows.reduce((total, row) => add(total, row.local), ZERO)
  const foreignerEach = rows.reduce((total, row) => add(total, row.foreigner), ZERO)
  const groupFees = rows.reduce((total, row) => add(total, row.group), ZERO)
  const locals = size - abroad
  return {
    localEach,
    foreignerEach,
    groupFees,
    total: {
      min: locals * localEach.min + abroad * foreignerEach.min + groupFees.min,
      max: locals * localEach.max + abroad * foreignerEach.max + groupFees.max,
    },
    ratesDiffer: localEach.min !== foreignerEach.min || localEach.max !== foreignerEach.max,
    stops: rows,
    unlisted: rows.filter((row) => !row.fees || (row.fees.local.length === 0 && row.fees.foreigner.length === 0 && !row.fees.free)).map(({ slug, name }) => ({ slug, name })),
  }
}

/** A range for one person once group fees are split: ₱650 each plus a ₱5,000 boat for 6 -> ₱1,484. */
export function shareOf(each: Range, groupFees: Range, people: number): Range {
  const size = Math.max(1, Math.round(people))
  return { min: Math.round(each.min + groupFees.min / size), max: Math.round(each.max + groupFees.max / size) }
}

const peso = (value: number) => `₱${new Intl.NumberFormat('en-PH').format(value)}`

/** "₱650" or "₱650–700". */
export function formatPesoRange({ min, max }: Range) {
  return min === max ? peso(min) : `${peso(min)}–${new Intl.NumberFormat('en-PH').format(max)}`
}

/** "≈ US$6" or "≈ US$6–8" next to a peso total; null for nothing to pay. */
export function usdRange({ min, max }: Range) {
  if (max === 0) return null
  const low = formatForeignAmount(min, 'USD')
  const high = formatForeignAmount(max, 'USD')
  return `≈ ${low === high ? low : `${low}–${high.replace('US$', '')}`}`
}
