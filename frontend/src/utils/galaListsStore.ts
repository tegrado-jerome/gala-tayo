import { useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseAccessToken } from '../supabase'
import { getApiUrl } from './apiClient'
import { EMPTY_LISTS_STATE, isEmptyListsState, mergeListsStates, parseListsState, type GalaListsState } from './galaListsCore'
import { hasAccountSession } from './guestSessionCore'

/**
 * Where Gala lists are kept.
 *   Guests (and accounts when sync is unavailable): this browser's localStorage.
 *   Signed-in accounts: the API (/gala-lists), with a per-account localStorage copy for instant loads.
 * On the first sync, lists made on this device before signing in join the account, then leave the device.
 * The UI only talks to useGalaLists() / updateGalaLists(), so it doesn't care which one is active.
 */
export type GalaListsSyncStatus = 'device' | 'loading' | 'synced' | 'error'

const DEVICE_KEY = 'galatayo:gala-lists:v1'
const accountKey = (userId: string) => `${DEVICE_KEY}:${userId}`
// Set while a local edit hasn't reached the server, so the next sync keeps it instead of dropping it.
const pendingKey = (userId: string) => `${DEVICE_KEY}:${userId}:pending`
const PUSH_DELAY_MS = 600

let activeKey = DEVICE_KEY
let accountUserId: string | null = null
// False until the account's server lists have been loaded once; edits before that wait for the merge.
let isAccountReady = false
let status: GalaListsSyncStatus = 'device'
let syncRun = 0
let pushTimer: ReturnType<typeof setTimeout> | null = null
const memory = new Map<string, GalaListsState>()
const cache = new Map<string, { raw: string | null; state: GalaListsState }>()
const listeners = new Set<() => void>()

function storageGet(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage can be blocked (private mode); lists then live in memory for this visit.
  }
}

function readKey(key: string): GalaListsState {
  const raw = storageGet(key)
  if (raw === null && memory.has(key)) return memory.get(key)!
  const cached = cache.get(key)
  if (cached && cached.raw === raw) return cached.state
  let state: GalaListsState
  try {
    state = raw ? parseListsState(JSON.parse(raw)) : EMPTY_LISTS_STATE
  } catch {
    state = EMPTY_LISTS_STATE
  }
  cache.set(key, { raw, state })
  return state
}

function writeKey(key: string, state: GalaListsState | null) {
  const raw = state ? JSON.stringify(state) : null
  if (state) {
    cache.set(key, { raw, state })
    memory.set(key, state)
  } else {
    cache.delete(key)
    memory.delete(key)
  }
  storageSet(key, raw)
}

function notify() {
  listeners.forEach((listener) => listener())
}

function setStatus(next: GalaListsSyncStatus) {
  if (status === next) return
  status = next
  notify()
}

type ListsResponse = { available: boolean; state?: unknown }

async function requestLists(method: 'GET' | 'PUT', session: Session | null, state?: GalaListsState): Promise<GalaListsState | null> {
  const token = await getSupabaseAccessToken(session)
  if (!token) throw new Error('Not signed in.')
  const response = await fetch(getApiUrl('/gala-lists'), {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(state ? { 'Content-Type': 'application/json' } : {}) },
    body: state ? JSON.stringify({ state }) : undefined,
  })
  if (!response.ok) throw new Error(`Lists sync failed (${response.status}).`)
  const body = (await response.json()) as ListsResponse
  // available: false means the server can't store lists yet; the device keeps them as before.
  return body.available ? parseListsState(body.state) : null
}

async function push(userId: string) {
  pushTimer = null
  if (accountUserId !== userId || !isAccountReady) return
  try {
    const saved = await requestLists('PUT', null, readKey(accountKey(userId)))
    if (accountUserId !== userId) return
    if (saved === null) {
      setStatus('error')
      return
    }
    storageSet(pendingKey(userId), null)
    setStatus('synced')
  } catch {
    if (accountUserId === userId) setStatus('error')
  }
}

function schedulePush(userId: string) {
  storageSet(pendingKey(userId), '1')
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void push(userId), PUSH_DELAY_MS)
}

/**
 * Points the store at the signed-in account (or back at the device) and syncs. Safe to call on every
 * session change and when the tab comes back into view.
 */
export async function syncGalaLists(session: Session | null | undefined) {
  const run = ++syncRun
  const userId = hasAccountSession(session) ? session.user.id : null

  if (!userId) {
    if (accountUserId && storageGet(pendingKey(accountUserId)) === null) writeKey(accountKey(accountUserId), null)
    accountUserId = null
    isAccountReady = false
    activeKey = DEVICE_KEY
    status = 'device'
    notify()
    return
  }

  if (accountUserId !== userId) {
    accountUserId = userId
    isAccountReady = false
    activeKey = accountKey(userId)
    status = 'loading'
    notify()
  }

  try {
    const server = await requestLists('GET', session ?? null)
    if (run !== syncRun || accountUserId !== userId) return
    if (server === null) {
      // No server storage: behave as before and keep lists on this device.
      activeKey = DEVICE_KEY
      setStatus('device')
      notify()
      return
    }

    const device = readKey(DEVICE_KEY)
    const hasPending = storageGet(pendingKey(userId)) !== null
    let next = hasPending ? mergeListsStates(server, readKey(accountKey(userId))) : server
    if (!isEmptyListsState(device)) next = mergeListsStates(next, device)
    writeKey(accountKey(userId), next)
    activeKey = accountKey(userId)
    isAccountReady = true
    notify()

    if (JSON.stringify(next) !== JSON.stringify(server)) {
      const saved = await requestLists('PUT', session ?? null, next)
      if (saved === null) throw new Error('Lists sync is unavailable.')
    }
    // The device's guest lists now live in the account.
    writeKey(DEVICE_KEY, null)
    storageSet(pendingKey(userId), null)
    if (run === syncRun) setStatus('synced')
  } catch {
    if (run !== syncRun || accountUserId !== userId) return
    // Offline or the API failed: show the account's last copy, or this device's lists when there is none.
    // Either way an edit is kept (pending, or as a device list) and joins the account on the next sync.
    if (!isAccountReady && isEmptyListsState(readKey(accountKey(userId)))) activeKey = DEVICE_KEY
    status = 'error'
    notify()
  }
}

function read() {
  return readKey(activeKey)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === activeKey) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useGalaLists() {
  return useSyncExternalStore(subscribe, read, () => EMPTY_LISTS_STATE)
}

/** 'device' for guests, 'loading' until a signed-in account's lists arrive, then 'synced' (or 'error'). */
export function useGalaListsSyncStatus() {
  return useSyncExternalStore(subscribe, () => status, () => 'device' as GalaListsSyncStatus)
}

export function updateGalaLists(change: (state: GalaListsState) => GalaListsState) {
  const next = change(read())
  writeKey(activeKey, next)
  if (accountUserId && activeKey === accountKey(accountUserId)) schedulePush(accountUserId)
  notify()
  return next
}

export function newListId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
