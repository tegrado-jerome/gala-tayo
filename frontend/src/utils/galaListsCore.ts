/**
 * Gala lists: named lists of places ("Date night", "Rainy day") that can be shared as a link.
 *
 * Pure state changes and the share-link format live here; where the state is kept is decided by a
 * `GalaListsBackend` (see galaListsStore.ts). Today that is localStorage; once the `gala_lists` tables
 * exist the same state shape can be loaded from and saved to the API instead.
 */

export type GalaListPlace = {
  slug: string
  name: string
  city: string | null
  area: string | null
  category: string | null
  photo: string | null
  addedAt: string
}

export type GalaList = {
  id: string
  name: string
  places: GalaListPlace[]
  createdAt: string
  updatedAt: string
  /** Set when the list started as a copy of someone's shared list. */
  copiedFrom?: string | null
}

/** A shared list someone follows. Read-only; the link is the source of truth. */
export type FollowedList = {
  key: string
  name: string
  slugs: string[]
  by: string | null
  followedAt: string
}

export type GalaListsState = {
  version: 1
  lists: GalaList[]
  following: FollowedList[]
}

export type SharedList = {
  name: string
  slugs: string[]
  by: string | null
}

export const EMPTY_LISTS_STATE: GalaListsState = { version: 1, lists: [], following: [] }
export const LIST_NAME_MAX = 40
export const LIST_PLACES_MAX = 60
export const LIST_SUGGESTIONS = ['Date night', 'Rainy day', 'Weekend with friends', 'Food trip', 'Someday']

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/

export function cleanListName(name: string) {
  return name.replace(/\s+/g, ' ').trim().slice(0, LIST_NAME_MAX)
}

function cleanBy(value: string | null | undefined) {
  const by = (value ?? '').replace(/[^\w.]/g, '').slice(0, 40)
  return by || null
}

/** Reads stored state defensively: anything malformed is dropped rather than breaking the page. */
export function parseListsState(raw: unknown): GalaListsState {
  if (!raw || typeof raw !== 'object') return EMPTY_LISTS_STATE
  const record = raw as Partial<GalaListsState>
  const lists = Array.isArray(record.lists)
    ? record.lists.filter(
        (list): list is GalaList =>
          Boolean(list) && typeof list.id === 'string' && typeof list.name === 'string' && Array.isArray(list.places),
      ).map((list) => ({ ...list, places: list.places.filter((place) => place && typeof place.slug === 'string' && SLUG_PATTERN.test(place.slug)) }))
    : []
  const following = Array.isArray(record.following)
    ? record.following.filter((item): item is FollowedList => Boolean(item) && typeof item.key === 'string' && Array.isArray(item.slugs))
    : []
  return { version: 1, lists, following }
}

export function createList(state: GalaListsState, name: string, id: string, now: string): GalaListsState {
  const clean = cleanListName(name)
  if (!clean) return state
  return { ...state, lists: [{ id, name: clean, places: [], createdAt: now, updatedAt: now }, ...state.lists] }
}

function updateList(state: GalaListsState, listId: string, change: (list: GalaList) => GalaList): GalaListsState {
  return { ...state, lists: state.lists.map((list) => (list.id === listId ? change(list) : list)) }
}

export function renameList(state: GalaListsState, listId: string, name: string, now: string) {
  const clean = cleanListName(name)
  if (!clean) return state
  return updateList(state, listId, (list) => ({ ...list, name: clean, updatedAt: now }))
}

export function deleteList(state: GalaListsState, listId: string): GalaListsState {
  return { ...state, lists: state.lists.filter((list) => list.id !== listId) }
}

export function listHasPlace(list: GalaList, slug: string) {
  return list.places.some((place) => place.slug === slug)
}

/** Adds the place (newest first) or removes it if it is already in the list. */
export function togglePlace(state: GalaListsState, listId: string, place: Omit<GalaListPlace, 'addedAt'>, now: string) {
  return updateList(state, listId, (list) => {
    if (listHasPlace(list, place.slug)) {
      return { ...list, places: list.places.filter((entry) => entry.slug !== place.slug), updatedAt: now }
    }
    if (list.places.length >= LIST_PLACES_MAX || !SLUG_PATTERN.test(place.slug)) return list
    return { ...list, places: [{ ...place, addedAt: now }, ...list.places], updatedAt: now }
  })
}

export function removePlace(state: GalaListsState, listId: string, slug: string, now: string) {
  return updateList(state, listId, (list) => ({ ...list, places: list.places.filter((place) => place.slug !== slug), updatedAt: now }))
}

/** Places come in the shared order; details are filled in by whoever renders the list. */
export function copySharedList(state: GalaListsState, shared: SharedList, places: Array<Omit<GalaListPlace, 'addedAt'>>, id: string, now: string): GalaListsState {
  const bySlug = new Map(places.map((place) => [place.slug, place]))
  const copied = shared.slugs.flatMap((slug) => {
    const place = bySlug.get(slug)
    return place ? [{ ...place, addedAt: now }] : []
  })
  const list: GalaList = { id, name: cleanListName(shared.name) || 'Shared list', places: copied, createdAt: now, updatedAt: now, copiedFrom: shared.by }
  return { ...state, lists: [list, ...state.lists] }
}

export function sharedListKey(shared: SharedList) {
  return `${shared.by ?? ''}|${cleanListName(shared.name)}|${shared.slugs.join(',')}`
}

export function isFollowing(state: GalaListsState, shared: SharedList) {
  const key = sharedListKey(shared)
  return state.following.some((item) => item.key === key)
}

export function toggleFollow(state: GalaListsState, shared: SharedList, now: string): GalaListsState {
  const key = sharedListKey(shared)
  if (state.following.some((item) => item.key === key)) {
    return { ...state, following: state.following.filter((item) => item.key !== key) }
  }
  return { ...state, following: [{ key, name: cleanListName(shared.name), slugs: shared.slugs, by: shared.by, followedAt: now }, ...state.following] }
}

/** Query string for a shared list: `n=Date+night&p=slug-a,slug-b&by=juan`. Works without any server state. */
export function encodeSharedList(shared: SharedList) {
  const params = new URLSearchParams()
  params.set('n', cleanListName(shared.name))
  params.set('p', shared.slugs.filter((slug) => SLUG_PATTERN.test(slug)).slice(0, LIST_PLACES_MAX).join(','))
  const by = cleanBy(shared.by)
  if (by) params.set('by', by)
  return params.toString()
}

export function decodeSharedList(search: string): SharedList | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const name = cleanListName(params.get('n') ?? '')
  const slugs = Array.from(
    new Set(
      (params.get('p') ?? '')
        .split(',')
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => SLUG_PATTERN.test(slug)),
    ),
  ).slice(0, LIST_PLACES_MAX)
  if (!name || slugs.length === 0) return null
  return { name, slugs, by: cleanBy(params.get('by')) }
}
