/*
 * Gala lists for signed-in users: the app's whole lists document (frontend utils/galaListsCore.ts,
 * GalaListsState) stored as one row per account, so a list made on the phone opens on the laptop.
 * The server only cleans and caps what it stores; the app owns the list logic.
 */

export type StoredListPlace = {
  slug: string;
  name: string;
  city: string | null;
  area: string | null;
  category: string | null;
  photo: string | null;
  addedAt: string;
};

export type StoredList = {
  id: string;
  name: string;
  places: StoredListPlace[];
  createdAt: string;
  updatedAt: string;
  copiedFrom?: string | null;
};

export type StoredFollow = { key: string; name: string; slugs: string[]; by: string | null; followedAt: string };

export type StoredListsState = { version: 1; lists: StoredList[]; following: StoredFollow[] };

// Same caps as the app (LIST_NAME_MAX, LIST_PLACES_MAX), plus room for a generous number of lists.
const MAX_LISTS = 50;
const MAX_FOLLOWING = 100;
const MAX_PLACES = 60;
const NAME_MAX = 40;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/;
const ID_PATTERN = /^[\w-]{1,64}$/;

const record = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const optionalText = (value: unknown, max: number) => text(value, max) || null;
const isoDate = (value: unknown, fallback: string) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback);
const photoUrl = (value: unknown) => {
  const url = text(value, 500);
  return /^https:\/\//i.test(url) || url.startsWith("/") ? url : null;
};

function cleanPlace(value: unknown, now: string): StoredListPlace | null {
  const place = record(value);
  const slug = text(place?.slug, 120).toLowerCase();
  if (!place || !SLUG_PATTERN.test(slug)) return null;
  return {
    slug,
    name: text(place.name, 120) || slug,
    city: optionalText(place.city, 80),
    area: optionalText(place.area, 80),
    category: optionalText(place.category, 40),
    photo: photoUrl(place.photo),
    addedAt: isoDate(place.addedAt, now),
  };
}

function cleanList(value: unknown, now: string): StoredList | null {
  const list = record(value);
  const id = text(list?.id, 64);
  const name = text(list?.name, NAME_MAX);
  if (!list || !ID_PATTERN.test(id) || !name || !Array.isArray(list.places)) return null;
  const seen = new Set<string>();
  const places = list.places
    .map((place) => cleanPlace(place, now))
    .filter((place): place is StoredListPlace => place !== null && !seen.has(place.slug) && Boolean(seen.add(place.slug)))
    .slice(0, MAX_PLACES);
  return {
    id,
    name,
    places,
    createdAt: isoDate(list.createdAt, now),
    updatedAt: isoDate(list.updatedAt, now),
    copiedFrom: optionalText(list.copiedFrom, 40),
  };
}

function cleanFollow(value: unknown, now: string): StoredFollow | null {
  const follow = record(value);
  const key = text(follow?.key, 4000);
  if (!follow || !key || !Array.isArray(follow.slugs)) return null;
  const slugs = follow.slugs.map((slug) => text(slug, 120).toLowerCase()).filter((slug) => SLUG_PATTERN.test(slug)).slice(0, MAX_PLACES);
  return { key, name: text(follow.name, NAME_MAX), slugs, by: optionalText(follow.by, 40), followedAt: isoDate(follow.followedAt, now) };
}

/** The lists document as the app sent it, cleaned and capped; null when it isn't a lists document at all. */
export function sanitizeListsState(value: unknown, now = new Date().toISOString()): StoredListsState | null {
  const state = record(value);
  if (!state || !Array.isArray(state.lists)) return null;
  const ids = new Set<string>();
  const lists = state.lists
    .map((list) => cleanList(list, now))
    .filter((list): list is StoredList => list !== null && !ids.has(list.id) && Boolean(ids.add(list.id)))
    .slice(0, MAX_LISTS);
  const keys = new Set<string>();
  const following = (Array.isArray(state.following) ? state.following : [])
    .map((follow) => cleanFollow(follow, now))
    .filter((follow): follow is StoredFollow => follow !== null && !keys.has(follow.key) && Boolean(keys.add(follow.key)))
    .slice(0, MAX_FOLLOWING);
  return { version: 1, lists, following };
}
