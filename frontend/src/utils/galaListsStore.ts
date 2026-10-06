import { useSyncExternalStore } from 'react'
import { EMPTY_LISTS_STATE, parseListsState, type GalaListsState } from './galaListsCore'

/**
 * Where Gala lists are kept. Today: this browser's localStorage, for guests and signed-in users alike.
 *
 * To move to the database (tables `gala_lists`, `gala_list_places`, `gala_list_follows`), add an API
 * backend with the same three methods, load it once per signed-in session, and pick it in `backend`
 * below. The UI only talks to `useGalaLists()` / `updateGalaLists()`, so nothing else has to change.
 */
export type GalaListsBackend = {
  read: () => GalaListsState
  write: (state: GalaListsState) => void
  /** Calls back when the lists change somewhere else (another tab, or a server push later). */
  subscribe: (onChange: () => void) => () => void
}

const STORAGE_KEY = 'galatayo:gala-lists:v1'

function parseStored(raw: string | null) {
  if (!raw) return EMPTY_LISTS_STATE
  try {
    return parseListsState(JSON.parse(raw))
  } catch {
    return EMPTY_LISTS_STATE
  }
}

function createLocalBackend(): GalaListsBackend {
  let cache: { raw: string | null; state: GalaListsState } | null = null
  return {
    read() {
      let raw: string | null
      try {
        raw = window.localStorage.getItem(STORAGE_KEY)
      } catch {
        // Storage can be blocked (private mode); lists then live for this visit only.
        return cache?.state ?? EMPTY_LISTS_STATE
      }
      if (cache && cache.raw === raw) return cache.state
      cache = { raw, state: parseStored(raw) }
      return cache.state
    },
    write(state) {
      const raw = JSON.stringify(state)
      cache = { raw, state }
      try {
        window.localStorage.setItem(STORAGE_KEY, raw)
      } catch {
        // Kept in memory for this visit.
      }
    },
    subscribe(onChange) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY) onChange()
      }
      window.addEventListener('storage', onStorage)
      return () => window.removeEventListener('storage', onStorage)
    },
  }
}

const backend: GalaListsBackend = createLocalBackend()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  const unsubscribe = backend.subscribe(listener)
  return () => {
    listeners.delete(listener)
    unsubscribe()
  }
}

export function useGalaLists() {
  return useSyncExternalStore(subscribe, backend.read, () => EMPTY_LISTS_STATE)
}

export function updateGalaLists(change: (state: GalaListsState) => GalaListsState) {
  const next = change(backend.read())
  backend.write(next)
  listeners.forEach((listener) => listener())
  return next
}

export function newListId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
