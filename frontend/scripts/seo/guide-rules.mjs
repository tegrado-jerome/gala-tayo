// Which guides the discovery bot may create. The rules live in src/data/guideRules.json so the app
// reads the same ones: cinemas, hotels and malls are never a gala-worthy guide topic (an iconic mall
// is a place page, not a "Malls in X" list), and a guide needs enough visible places to be indexed.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readData = (name) => JSON.parse(readFileSync(path.join(frontendDir, 'src/data', name), 'utf8'))
const rules = readData('guideRules.json')
const hiddenSlugs = new Set(readData('galaWorthy.json').hidden)

export const BLOCKED_GUIDE_CATEGORIES = new Set(rules.blockedCategories)
export const MIN_INDEXABLE_GUIDE_PLACES = rules.minIndexablePlaces

export const isAllowedGuideTopic = ({ category }) => !BLOCKED_GUIDE_CATEGORIES.has((category || '').toLowerCase())

/** A guide can be created only for an allowed topic with enough visible places (never fewer than the indexable minimum). */
export const canCreateGuide = (topic, visiblePlaces, minPlaces = MIN_INDEXABLE_GUIDE_PLACES) =>
  isAllowedGuideTopic(topic) && visiblePlaces >= Math.max(minPlaces, MIN_INDEXABLE_GUIDE_PLACES)

/** Drops places hidden by the gala-worthy check, in case the API lags behind curation. */
export const visiblePlacesOnly = (places) => places.filter((place) => !hiddenSlugs.has(place.slug))
