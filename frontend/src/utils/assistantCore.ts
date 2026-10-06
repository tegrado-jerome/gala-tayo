/*
 * Types and pure helpers for Tara, the GalaTayo assistant (mirrors backend/src/services/assistant/schema.ts).
 * No browser or Vite APIs here, so node --test can run it.
 */

export type AssistantMode = 'chat' | 'map'
export type ReplyLanguage = 'english' | 'taglish'

export type AssistantMemory = {
  area: string | null
  budgetPerHead: number | null
  groupSize: number | null
  date: string | null
  vibe: string | null
  topic: string | null
  indoor: boolean | null
  lastPlaceSlugs: string[]
}

export type AssistantPlaceCard = {
  n: number
  id: string
  slug: string
  name: string
  category: string
  area: string | null
  city: string | null
  path: string
  imageUrl: string | null
  budgetMin: number | null
  budgetLabel: string | null
  why: string
  latitude: number | null
  longitude: number | null
  goodFor: string[]
  indoor: boolean | null
  verified: { source: 'google_maps'; uri: string | null; title: string | null } | null
}

export type AssistantMapBlock = { pins: Array<{ n: number; slug: string; latitude: number; longitude: number }>; centre: { latitude: number; longitude: number } }
export type AssistantItinerary = { date: string; stops: Array<{ time: string | null; slug: string; name: string; note: string; travel: { km: number; mode: string } | null }> }
export type AssistantWeather = { area: string; summary: string; rainLikely: boolean; tempC: number | null }
export type AssistantChip = { label: string; prompt: string; kind: 'refine' | 'add_to_plan' | 'map' | 'plan' }
export type AssistantUsage = { allowed: boolean; usageType: string; dailyLimit: number; requestCount: number; remaining: number; resetsAt: string }

export type AssistantResponse = {
  version: 1
  requestId: string
  mode: AssistantMode
  language: ReplyLanguage
  text: string
  refused: boolean
  clarify: string | null
  places: AssistantPlaceCard[]
  map: AssistantMapBlock | null
  itinerary: AssistantItinerary | null
  weather: AssistantWeather | null
  chips: AssistantChip[]
  memory: AssistantMemory
  attribution: { google: boolean; sources: Array<{ title: string; uri: string }> } | null
  provider: string
  usage?: AssistantUsage
}

export type AssistantEvent =
  | { type: 'status'; text: string }
  | { type: 'places'; places: AssistantPlaceCard[]; map: AssistantMapBlock | null }
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'final'; response: AssistantResponse }
  | { type: 'error'; code: string; message: string; usage?: AssistantUsage }

export const EMPTY_MEMORY: AssistantMemory = { area: null, budgetPerHead: null, groupSize: null, date: null, vibe: null, topic: null, indoor: null, lastPlaceSlugs: [] }

/**
 * Splits a growing NDJSON buffer into events. Returns the events and the unfinished tail to keep.
 * A plain JSON error body (429, 400) has no `type`; it becomes an error event.
 */
export function parseNdjson(buffer: string): { events: AssistantEvent[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const events: AssistantEvent[] = []
  for (const line of lines) {
    const event = parseLine(line)
    if (event) events.push(event)
  }
  return { events, rest }
}

export function parseLine(line: string): AssistantEvent | null {
  if (!line.trim()) return null
  try {
    const value = JSON.parse(line) as Record<string, unknown>
    if (typeof value.type === 'string') return value as AssistantEvent
    if (value.ok === false) {
      return { type: 'error', code: String(value.code ?? value.error ?? 'ERROR'), message: String(value.message ?? 'Tara had a hiccup. Try again.'), usage: value.usage as AssistantUsage | undefined }
    }
    if (value.ok === true && value.response) return { type: 'final', response: value.response as AssistantResponse }
  } catch {
    return null
  }
  return null
}

/** One chat turn as the UI keeps it. */
export type AssistantTurn =
  | { id: string; role: 'user'; text: string }
  | {
      id: string
      role: 'assistant'
      text: string
      status: string | null
      streaming: boolean
      preview: AssistantPlaceCard[]
      previewMap: AssistantMapBlock | null
      response: AssistantResponse | null
      error: string | null
    }

/** What the server needs from earlier turns: plain text only, newest last. */
export function historyFor(turns: AssistantTurn[], max = 8) {
  return turns
    .filter((turn) => turn.role === 'user' || (turn.role === 'assistant' && turn.text && !turn.error))
    .slice(-max)
    .map((turn) => ({ role: turn.role, content: turn.text.slice(0, 1200) }))
}

/** "₱1,500" style money for UI copy. */
export function peso(value: number) {
  return `₱${value.toLocaleString('en-PH')}`
}

/** Small summary of what Tara remembers, for the memory strip ("BGC · ₱750/head · 2 pax"). */
export function memorySummary(memory: AssistantMemory): string[] {
  return [
    memory.area,
    memory.budgetPerHead !== null ? (memory.budgetPerHead === 0 ? 'Free' : `${peso(memory.budgetPerHead)}/head`) : null,
    memory.groupSize ? `${memory.groupSize} pax` : null,
    memory.indoor ? 'Indoor' : null,
    memory.vibe,
  ].filter((part): part is string => Boolean(part))
}
