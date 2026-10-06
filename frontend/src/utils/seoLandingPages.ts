import { getAreaLabelBySlug } from '../data/destinations'
import { getPlaceCategoryLabel } from '../data/placeCategories'
import { getPublicSiteOrigin } from './site'
import destinationData from '../data/phDestinations.json'
import guideRules from '../data/guideRules.json'
import seoGuides from '../data/seoGuides.json'

type SeoLandingTarget = {
  slug: string
  areaSlug?: string | null
  category?: string | null
  goodFor?: string | null
  displayAreaName?: string | null
  label: string
  keywords: string[]
  /** Hand-written meta description, under 155 characters. */
  description?: string
  /** Two hand-written sentences shown under the guide title. */
  intro?: string
  /** Search title when the label is not the phrasing people type; the brand is added when it fits in 60 characters. */
  title?: string
  /** Hand-written answer-first lines; `bestFor` and the budget are otherwise built from the listed places. */
  quickAnswer?: { bestFor?: string; cost?: string; gettingThere?: string }
  /** Questions people search for this topic, answered from facts on the page. Shown before the standard ones. */
  faqs?: Array<{ question: string; answer: string }>
  addedAt?: string
}

type SeoLandingMetadata = {
  title: string
  description: string
  h1: string
  intro: string
  summary: string
  canonicalPath: string
  keywords: string[]
  faqs: Array<{ question: string; answer: string }>
}

const BRAND_NAME = 'GalaTayo'
const BRAND_ALTERNATE_NAME = 'Gala Tayo'
const PRODUCT_NAME = 'GalaTayo'
const BRAND_DESCRIPTION =
  'GalaTayo (Gala Tayo) is a place discovery and planning app for the best places around the Philippines. Browse places by city, category, budget, and vibe, then plan your next gala with friends.'

function buildBrandJsonLd() {
  const origin = getPublicSiteOrigin()
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: PRODUCT_NAME,
      alternateName: BRAND_ALTERNATE_NAME,
      url: `${origin}/`,
      inLanguage: 'en-PH',
      publisher: { '@id': `${origin}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: BRAND_NAME,
      alternateName: BRAND_ALTERNATE_NAME,
      description: BRAND_DESCRIPTION,
      url: `${origin}/`,
      logo: `${origin}/favicon.png`,
      foundingDate: '2026-07',
      email: 'officialgalatayo@gmail.com',
      publishingPrinciples: `${origin}/about#curation`,
      areaServed: { '@type': 'Country', name: 'Philippines' },
    },
  ]
}

// Cinemas, hotels and malls never get a guide (see scripts/seo/guide-rules.mjs).
const SEO_LANDING_TARGETS: SeoLandingTarget[] = seoGuides.filter((guide) => !guideRules.blockedCategories.includes(guide.category ?? ''))

const GOOD_FOR_LABELS: Record<string, string> = {
  date: 'date',
  barkada: 'group',
  family: 'family',
  study: 'study',
  chill: 'chill',
  'rainy-day': 'rainy day',
  'food-trip': 'food trip',
  'photo-spot': 'photo',
  free: 'free',
}

// A guide with four or more visible places is a real list; fewer stays noindex until it fills up.
const MIN_INDEXABLE_GUIDE_PLACES = guideRules.minIndexablePlaces

const INTENT_NOTES: Record<string, (area: string) => string> = {
  date: (area) => `Each pick shows the budget per head and the best time to go, so you can plan a date in ${area} without guessing the bill.`,
  family: (area) => `Picks lean toward places with space for kids and lolas, plus parking and commute notes for a family day in ${area}.`,
  barkada: (area) => `These work for groups: room to stay long, sharing plates, and budgets the whole group can split in ${area}.`,
  study: (area) => `Look for the best time to visit on each pick to find quieter hours for studying around ${area}.`,
  chill: (area) => `Low-effort spots in ${area} for when you just want to sit, eat and talk without a big plan.`,
  'rainy-day': (area) => `All indoor or covered, so your plans in ${area} survive the rain.`,
  'food-trip': (area) => `Food stops in ${area} you can chain into one food trip, with a budget per head on every pick.`,
  'photo-spot': (area) => `Spots in ${area} with good light and backdrops. Golden hour is usually the best time to shoot.`,
  free: (area) => `No entrance fee needed for these spots in ${area}. Budget only for food and the commute.`,
}

const CATEGORY_NOTES: Record<string, (area: string) => string> = {
  cafe: (area) => `Compare cafes in ${area} by budget, vibe and who they suit, from quick coffee runs to long tambay sessions.`,
  food: (area) => `Restaurants and food spots in ${area} with a starting budget per head, so you know the damage before you go.`,
  mall: (area) => `Malls in ${area} with notes on parking, commute and what else is nearby for a full day out.`,
  museum: (area) => `Museums in ${area} with notes on fees, best time to visit and how long to stay.`,
  park: (area) => `Parks and open spaces in ${area}. Go early morning or late afternoon to skip the heat.`,
  heritage: (area) => `Heritage and historical sites in ${area}, best paired with a walking route and a merienda stop.`,
  activity: (area) => `Things to do in ${area}, from active days out to easy indoor plans.`,
  nightlife: (area) => `Bars and night spots in ${area} with notes on crowd, budget and how to get home.`,
  hotel: (area) => `Hotels and staycation options in ${area} with a starting budget so you can compare quickly.`,
  cinema: (area) => `Cinemas in ${area} and what to pair them with before or after the movie.`,
}

/** The region an area slug belongs to: a city's region, a region itself, or a province's region ("bohol" is in Central Visayas). */
function getRegionSlugForArea(areaSlug: string | null | undefined) {
  if (!areaSlug) return null
  const region = destinationData.regions.find((candidate) => candidate.slug === areaSlug || candidate.provinces.some((province) => province.slug === areaSlug || province.cities.some((city) => city.slug === areaSlug)))
  return region?.slug ?? null
}

/** City or region page with every place for a guide's area; province guides link to their region. */
function getGuideAreaHub(target: SeoLandingTarget) {
  const hubSlug = getAreaLabelBySlug(target.areaSlug) ? target.areaSlug : getRegionSlugForArea(target.areaSlug)
  const name = getAreaLabelBySlug(hubSlug)
  return hubSlug && name ? { href: `/places/${hubSlug}`, name } : null
}

const guideKind = (target: SeoLandingTarget) => target.category || (target.goodFor ? `for:${target.goodFor}` : 'things-to-do')

/** Guides for the same area (or region) first, then the same kind of guide elsewhere: the internal links between landing pages. */
function getRelatedLandingTargets(target: SeoLandingTarget) {
  const region = getRegionSlugForArea(target.areaSlug)
  const others = SEO_LANDING_TARGETS.filter((candidate) => candidate.slug !== target.slug)
  const nearby = others
    .filter((candidate) => region && getRegionSlugForArea(candidate.areaSlug) === region)
    .sort((a, b) => Number(b.areaSlug === target.areaSlug) - Number(a.areaSlug === target.areaSlug) || Number(guideKind(b) === guideKind(target)) - Number(guideKind(a) === guideKind(target)))
    .slice(0, 4)
  const similar = others.filter((candidate) => guideKind(candidate) === guideKind(target) && !nearby.includes(candidate)).slice(0, 4)
  return { nearby, similar }
}

function getGuideOgImagePath(slug: string) {
  return `/og/guides/${encodeURIComponent(slug)}.jpg`
}

function getLandingPath(slug: string) {
  return `/guides/${encodeURIComponent(slug)}`
}

function getLandingTargetBySlug(slug: string) {
  return SEO_LANDING_TARGETS.find((target) => target.slug === slug) ?? null
}

/** Short subtitle for guide cards, like "Makati · Cafes" or "BGC · Date ideas". */
function getGuideSubtitle(target: SeoLandingTarget) {
  const kind = target.category ? `${getPlaceCategoryLabel(target.category)}${target.category === 'food' ? '' : 's'}` : target.goodFor ? `${GOOD_FOR_LABELS[target.goodFor] ?? target.goodFor} ideas` : 'Things to do'
  return `${getDisplayAreaName(target)} · ${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
}

function getDisplayAreaName(target: SeoLandingTarget) {
  return target.displayAreaName || getAreaLabelBySlug(target.areaSlug) || 'the Philippines'
}

function buildLandingHeading(target: SeoLandingTarget) {
  if (target.label) {
    return target.label
  }

  const areaName = getDisplayAreaName(target)
  const categoryLabel = target.category ? getPlaceCategoryLabel(target.category) : null
  const goodForLabel = target.goodFor ? GOOD_FOR_LABELS[target.goodFor] ?? target.goodFor : null

  if (categoryLabel && goodForLabel && target.areaSlug) {
    return `${categoryLabel} for ${goodForLabel} plans in ${areaName}`
  }
  if (categoryLabel && target.areaSlug) {
    return `${categoryLabel} places in ${areaName}`
  }
  if (goodForLabel && target.areaSlug) {
    return `${goodForLabel} places in ${areaName}`
  }
  if (categoryLabel && goodForLabel) {
    return `${categoryLabel} for ${goodForLabel} plans around the Philippines`
  }
  return 'GalaTayo guides'
}

/** "Things to Do in Baguio | GalaTayo", dropping the brand when the title would pass 60 characters. */
function withBrand(title: string) {
  return title.length + BRAND_NAME.length + 3 <= 60 ? `${title} | ${BRAND_NAME}` : title
}

function buildLandingMetadata(target: SeoLandingTarget): SeoLandingMetadata {
  const areaName = getDisplayAreaName(target)
  const categoryLabel = target.category ? getPlaceCategoryLabel(target.category) : null
  const goodForLabel = target.goodFor ? GOOD_FOR_LABELS[target.goodFor] ?? target.goodFor : null
  const h1 = buildLandingHeading(target)
  const categoryPhrase = categoryLabel ? categoryLabel.toLowerCase() : 'places'
  const audiencePhrase = goodForLabel ? `${goodForLabel} plans` : 'trip plans'
  const scopedAreaName = target.areaSlug ? areaName : 'the Philippines'
  const canonicalPath = getLandingPath(target.slug)

  let summary = `Explore ${h1.toLowerCase()} on ${BRAND_NAME}.`
  let intro = `Browse curated ${categoryPhrase} and practical place details for ${audiencePhrase} in ${scopedAreaName}.`

  if (categoryLabel && goodForLabel) {
    intro = `Browse ${categoryLabel.toLowerCase()} picks that fit ${goodForLabel} plans in ${scopedAreaName}, with quick details on budget, commute, and overall vibe.`
    summary = `${BRAND_NAME} highlights ${categoryLabel.toLowerCase()} picks for ${goodForLabel} plans around ${scopedAreaName}, so you can compare places faster.`
  } else if (categoryLabel && target.areaSlug) {
    intro = `Compare ${categoryLabel.toLowerCase()} spots in ${scopedAreaName} using practical details like budget, category fit, and location context.`
    summary = `${PRODUCT_NAME} organizes ${categoryLabel.toLowerCase()} places in ${scopedAreaName} for faster local discovery and planning.`
  } else if (goodForLabel && target.areaSlug) {
    intro = `Find places around ${scopedAreaName} that work well for ${goodForLabel} plans, from chill hangouts to full-day trip ideas.`
    summary = `${BRAND_NAME} surfaces ${goodForLabel}-friendly places in ${scopedAreaName} with budget, timing and location details for planning.`
  }

  const note = (target.goodFor && INTENT_NOTES[target.goodFor]) || (target.category && CATEGORY_NOTES[target.category]) || null
  if (note) {
    intro = note(scopedAreaName)
  }
  // Hand-written copy wins; the generated note is the fallback for guides added by the discovery script.
  intro = target.intro || intro
  const description = target.description || (note ? note(scopedAreaName) : `${h1}: places to go, what they cost and the best time to visit.`)

  return {
    title: withBrand(target.title || h1),
    description,
    h1,
    intro,
    summary,
    canonicalPath,
    keywords: target.keywords,
    faqs: [
      ...(target.faqs ?? []),
      {
        question: `How are the places in this guide picked?`,
        answer: `Only the best places make the list. Each one is scored on real evidence, like editorial lists, Philippine travel apps, Reddit threads, review volume and Michelin, plus how well it fits a day out. Plain eateries, chains and ordinary malls are left out, and the rest are ranked best first.`,
      },
      {
        question: `Can I plan a whole day from this guide?`,
        answer: `Yes. Save the places you like, then start a plan: pick a date, invite friends with one link and split the budget in the app.`,
      },
    ],
  }
}

export {
  BRAND_ALTERNATE_NAME,
  BRAND_DESCRIPTION,
  BRAND_NAME,
  PRODUCT_NAME,
  buildBrandJsonLd,
  SEO_LANDING_TARGETS,
  MIN_INDEXABLE_GUIDE_PLACES,
  buildLandingMetadata,
  withBrand,
  getRelatedLandingTargets,
  getGuideAreaHub,
  getGuideOgImagePath,
  getRegionSlugForArea,
  getLandingPath,
  getLandingTargetBySlug,
  getGuideSubtitle,
}
export type { SeoLandingMetadata, SeoLandingTarget }
