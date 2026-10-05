import { getAreaLabelBySlug } from '../data/destinations'
import { getPlaceCategoryLabel } from '../data/placeCategories'
import { getPublicSiteOrigin } from './site'
import seoGuides from '../data/seoGuides.json'

type SeoLandingTarget = {
  slug: string
  areaSlug?: string | null
  category?: string | null
  goodFor?: string | null
  displayAreaName?: string | null
  label: string
  keywords: string[]
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
  'GalaTayo (Gala Tayo) is a place discovery and planning app for gala-worthy places around the Philippines. Browse places by city, category, budget, and vibe, then plan your next gala with friends.'

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
      areaServed: { '@type': 'Country', name: 'Philippines' },
    },
  ]
}

const SEO_LANDING_TARGETS: SeoLandingTarget[] = seoGuides

const GOOD_FOR_LABELS: Record<string, string> = {
  date: 'date',
  barkada: 'barkada',
  family: 'family',
  study: 'study',
  chill: 'chill',
  'rainy-day': 'rainy day',
  'food-trip': 'food trip',
  'photo-spot': 'photo',
  free: 'free',
}

const MIN_INDEXABLE_GUIDE_PLACES = 6

const INTENT_NOTES: Record<string, (area: string) => string> = {
  date: (area) => `Each pick shows the budget per head and the best time to go, so you can plan a date in ${area} without guessing the bill.`,
  family: (area) => `Picks lean toward places with space for kids and lolas, plus parking and commute notes for a family day in ${area}.`,
  barkada: (area) => `These work for groups: room to stay long, sharing plates, and budgets the whole barkada can split in ${area}.`,
  study: (area) => `Look for the best time to visit on each pick to find quieter hours for studying around ${area}.`,
  chill: (area) => `Low-effort spots in ${area} for when you just want to sit, eat and talk without a big plan.`,
  'rainy-day': (area) => `All indoor or covered, so your plans in ${area} survive the rain. Check commute notes before heading out in a downpour.`,
  'food-trip': (area) => `Food stops in ${area} you can chain into one food trip, with a budget per head on every pick.`,
  'photo-spot': (area) => `Spots in ${area} with good light and backdrops. Golden hour is usually the best time to shoot.`,
  free: (area) => `No entrance fee needed for these spots in ${area}. Budget only for food and the commute.`,
}

const CATEGORY_NOTES: Record<string, (area: string) => string> = {
  cafe: (area) => `Compare cafes in ${area} by budget, vibe and who they suit, from quick coffee runs to long tambay sessions.`,
  food: (area) => `Restaurants and food spots in ${area} with a starting budget per head, so you know the damage before you go.`,
  mall: (area) => `Malls in ${area} with notes on parking, commute and what else is nearby for a full gala.`,
  museum: (area) => `Museums in ${area} with notes on fees, best time to visit and how long to stay.`,
  park: (area) => `Parks and open spaces in ${area}. Go early morning or late afternoon to skip the heat.`,
  heritage: (area) => `Heritage and historical sites in ${area}, best paired with a walking route and a merienda stop.`,
  activity: (area) => `Things to do in ${area}, from active days out to easy indoor plans.`,
  nightlife: (area) => `Bars and night spots in ${area} with notes on crowd, budget and how to get home.`,
  hotel: (area) => `Hotels and staycation options in ${area} with a starting budget so you can compare quickly.`,
  cinema: (area) => `Cinemas in ${area} and what to pair them with before or after the movie.`,
}

function getRelatedLandingTargets(target: SeoLandingTarget, limit = 6) {
  const score = (candidate: SeoLandingTarget) =>
    (candidate.areaSlug && candidate.areaSlug === target.areaSlug ? 2 : 0) +
    (candidate.goodFor && candidate.goodFor === target.goodFor ? 1 : 0) +
    (candidate.category && candidate.category === target.category ? 1 : 0)

  return SEO_LANDING_TARGETS.filter((candidate) => candidate.slug !== target.slug)
    .map((candidate) => ({ candidate, score: score(candidate) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ candidate }) => candidate)
}

function getLandingPath(slug: string) {
  return `/guides/${encodeURIComponent(slug)}`
}

function getLandingTargetBySlug(slug: string) {
  return SEO_LANDING_TARGETS.find((target) => target.slug === slug) ?? null
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

function buildLandingMetadata(target: SeoLandingTarget): SeoLandingMetadata {
  const areaName = getDisplayAreaName(target)
  const categoryLabel = target.category ? getPlaceCategoryLabel(target.category) : null
  const goodForLabel = target.goodFor ? GOOD_FOR_LABELS[target.goodFor] ?? target.goodFor : null
  const h1 = buildLandingHeading(target)
  const categoryPhrase = categoryLabel ? categoryLabel.toLowerCase() : 'places'
  const audiencePhrase = goodForLabel ? `${goodForLabel} plans` : 'gala plans'
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
    intro = `Find places around ${scopedAreaName} that work well for ${goodForLabel} plans, from chill hangouts to more structured gala ideas.`
    summary = `${BRAND_NAME} surfaces ${goodForLabel}-friendly places in ${scopedAreaName} with budget, timing and location details for planning.`
  }

  const note = (target.goodFor && INTENT_NOTES[target.goodFor]) || (target.category && CATEGORY_NOTES[target.category]) || null
  const description = `${h1} on ${PRODUCT_NAME}. ${intro}`
  if (note) {
    intro = `${intro} ${note(scopedAreaName)}`
  }

  return {
    title: `${h1} | ${BRAND_NAME}`,
    description,
    h1,
    intro,
    summary,
    canonicalPath,
    keywords: target.keywords,
    faqs: [
      {
        question: `What can I find on ${h1}?`,
        answer: `This guide collects ${categoryPhrase} recommendations${target.areaSlug ? ` in ${scopedAreaName}` : ' around the Philippines'} and highlights useful context like budget, audience fit, commute notes, and nearby areas.`,
      },
      {
        question: `How does ${BRAND_NAME} choose places for this guide?`,
        answer: `${PRODUCT_NAME} uses approved place data, category matching, and planning signals like who a place is best for, location context, and searchable place details.`,
      },
      {
        question: `What types of places are featured in ${h1}?`,
        answer: `This guide features ${categoryPhrase}${target.areaSlug ? ` available in ${scopedAreaName}` : ' around the Philippines'}, with a focus on practical details like budget range, commute access, parking availability, and audience fit.`,
      },
      {
        question: `Is ${h1} updated regularly?`,
        answer: `${PRODUCT_NAME} refreshes this guide as new approved places are added and existing place details are updated, so the picks stay current.`,
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
  getRelatedLandingTargets,
  getLandingPath,
  getLandingTargetBySlug,
}
export type { SeoLandingMetadata, SeoLandingTarget }
