import { getAreaLabelBySlug } from '../data/metroManilaAreas'
import { getPlaceCategoryLabel } from '../data/placeCategories'

type SeoLandingTarget = {
  slug: string
  areaSlug?: string | null
  category?: string | null
  goodFor?: string | null
  displayAreaName?: string | null
  label: string
  keywords: string[]
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

const BRAND_NAME = 'Gala Tayo'
const PRODUCT_NAME = 'GalaTayo'

const SEO_LANDING_TARGETS: SeoLandingTarget[] = [
  {
    slug: 'best-cafes-in-makati',
    areaSlug: 'makati',
    category: 'cafe',
    label: 'Best Cafes in Makati',
    keywords: ['best cafes in makati', 'coffee shops in makati', 'makati cafe guide', 'Gala Tayo cafes'],
  },
  {
    slug: 'restaurants-in-quezon-city',
    areaSlug: 'quezon-city',
    category: 'food',
    label: 'Restaurants in Quezon City',
    keywords: ['restaurants in quezon city', 'best food in qc', 'kainan sa qc', 'GalaTayo food guide'],
  },
  {
    slug: 'museums-in-manila',
    areaSlug: 'manila',
    category: 'museum',
    label: 'Museums in Manila',
    keywords: ['museums in manila', 'art galleries in manila', 'cultural places in manila', 'Gala Tayo museum guide'],
  },
  {
    slug: 'parks-in-pasig',
    areaSlug: 'pasig',
    category: 'park',
    label: 'Parks in Pasig',
    keywords: ['parks in pasig', 'outdoor places in pasig', 'pasig walking spots', 'GalaTayo park guide'],
  },
  {
    slug: 'date-spots-in-bgc',
    areaSlug: 'taguig',
    goodFor: 'date',
    displayAreaName: 'BGC',
    label: 'Date Spots in BGC',
    keywords: ['date spots in bgc', 'romantic places in bgc', 'bgc date ideas', 'Gala Tayo date guide'],
  },
  {
    slug: 'family-friendly-places-in-quezon-city',
    areaSlug: 'quezon-city',
    goodFor: 'family',
    label: 'Family-Friendly Places in Quezon City',
    keywords: ['family-friendly places in quezon city', 'kids places in qc', 'family gala in qc', 'GalaTayo family guide'],
  },
  {
    slug: 'study-cafes-in-manila',
    areaSlug: 'manila',
    category: 'cafe',
    goodFor: 'study',
    label: 'Study Cafes in Manila',
    keywords: ['study cafes in manila', 'quiet cafes in manila', 'cafes with wifi in manila', 'Gala Tayo study cafes'],
  },
  {
    slug: 'chill-spots-in-taguig',
    areaSlug: 'taguig',
    goodFor: 'chill',
    label: 'Chill Spots in Taguig',
    keywords: ['chill spots in taguig', 'tambayan in taguig', 'relaxing places in taguig', 'GalaTayo chill guide'],
  },
  {
    slug: 'kainan-sa-bgc',
    areaSlug: 'taguig',
    category: 'food',
    displayAreaName: 'BGC',
    label: 'Kainan sa BGC',
    keywords: ['kainan sa bgc', 'restaurants in bgc', 'food trip in bgc', 'Gala Tayo BGC food'],
  },
  {
    slug: 'tambayan-sa-makati',
    areaSlug: 'makati',
    goodFor: 'chill',
    label: 'Tambayan sa Makati',
    keywords: ['tambayan sa makati', 'chill spots in makati', 'makati hangout places', 'GalaTayo tambayan guide'],
  },
  {
    slug: 'saan-mag-date-sa-qc',
    areaSlug: 'quezon-city',
    goodFor: 'date',
    displayAreaName: 'QC',
    label: 'Saan Mag Date sa QC',
    keywords: ['saan mag date sa qc', 'date places in quezon city', 'qc date spots', 'Gala Tayo QC date guide'],
  },
  {
    slug: 'things-to-do-in-makati',
    areaSlug: 'makati',
    category: 'activity',
    label: 'Things to Do in Makati',
    keywords: ['things to do in makati', 'activities in makati', 'makati gala ideas', 'GalaTayo Makati activity guide'],
  },
  {
    slug: 'date-places-in-metro-manila',
    goodFor: 'date',
    label: 'Date Places in Metro Manila',
    keywords: ['date places in metro manila', 'metro manila date spots', 'romantic places in metro manila', 'Gala Tayo date ideas'],
  },
  {
    slug: 'study-cafes-in-metro-manila',
    category: 'cafe',
    goodFor: 'study',
    label: 'Study Cafes in Metro Manila',
    keywords: ['study cafes in metro manila', 'quiet cafes with wifi', 'best cafes for studying', 'GalaTayo study guide'],
  },
  {
    slug: 'nightlife-in-makati',
    areaSlug: 'makati',
    category: 'nightlife',
    label: 'Nightlife in Makati',
    keywords: ['nightlife in makati', 'bars in makati', 'clubs in makati', 'makati night out spots', 'GalaTayo nightlife guide'],
  },
  {
    slug: 'heritage-sites-in-manila',
    areaSlug: 'manila',
    category: 'heritage',
    label: 'Heritage Sites in Manila',
    keywords: ['heritage sites in manila', 'historical places in manila', 'intramuros guide', 'manila landmarks', 'Gala Tayo heritage guide'],
  },
  {
    slug: 'cheap-eats-in-manila',
    areaSlug: 'manila',
    category: 'food',
    label: 'Cheap Eats in Manila',
    keywords: ['cheap eats in manila', 'budget food in manila', 'murang kainan sa manila', 'manila affordable restaurants', 'GalaTayo food guide'],
  },
  {
    slug: 'mall-shopping-in-pasig',
    areaSlug: 'pasig',
    category: 'mall',
    label: 'Mall Shopping in Pasig',
    keywords: ['malls in pasig', 'shopping in pasig', 'pasig lifestyle centers', 'pasig shopping guide', 'Gala Tayo mall guide'],
  },
  {
    slug: 'cinemas-in-quezon-city',
    areaSlug: 'quezon-city',
    category: 'cinema',
    label: 'Cinemas in Quezon City',
    keywords: ['cinemas in quezon city', 'movie theaters in qc', 'sine sa qc', 'quezon city movie guide', 'GalaTayo cinema guide'],
  },
  {
    slug: 'hotels-and-staycations-in-taguig',
    areaSlug: 'taguig',
    category: 'hotel',
    label: 'Hotels and Staycations in Taguig',
    keywords: ['hotels in taguig', 'staycation in bgc', 'taguig accommodation', 'bgc hotel guide', 'Gala Tayo staycation guide'],
  },
  {
    slug: 'barkada-hangouts-in-makati',
    areaSlug: 'makati',
    goodFor: 'barkada',
    label: 'Barkada Hangouts in Makati',
    keywords: ['barkada hangouts in makati', 'group places in makati', 'tropa gala makati', 'makati group activities', 'GalaTayo barkada guide'],
  },
  {
    slug: 'family-outing-in-manila',
    areaSlug: 'manila',
    goodFor: 'family',
    label: 'Family Outing in Manila',
    keywords: ['family outing in manila', 'family places in manila', 'kids friendly manila', 'manila family day ideas', 'Gala Tayo family guide'],
  },
]

const GOOD_FOR_LABELS: Record<string, string> = {
  date: 'date',
  barkada: 'barkada',
  family: 'family',
  study: 'study',
  chill: 'chill',
}

function getLandingPath(slug: string) {
  return `/guides/${encodeURIComponent(slug)}`
}

function getLandingTargetBySlug(slug: string) {
  return SEO_LANDING_TARGETS.find((target) => target.slug === slug) ?? null
}

function getDisplayAreaName(target: SeoLandingTarget) {
  return target.displayAreaName || getAreaLabelBySlug(target.areaSlug) || 'Metro Manila'
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
    return `${categoryLabel} for ${goodForLabel} plans in Metro Manila`
  }
  return 'Metro Manila guides'
}

function buildLandingMetadata(target: SeoLandingTarget): SeoLandingMetadata {
  const areaName = getDisplayAreaName(target)
  const categoryLabel = target.category ? getPlaceCategoryLabel(target.category) : null
  const goodForLabel = target.goodFor ? GOOD_FOR_LABELS[target.goodFor] ?? target.goodFor : null
  const h1 = buildLandingHeading(target)
  const categoryPhrase = categoryLabel ? categoryLabel.toLowerCase() : 'places'
  const audiencePhrase = goodForLabel ? `${goodForLabel} plans` : 'gala plans'
  const scopedAreaName = target.areaSlug ? areaName : 'Metro Manila'
  const canonicalPath = getLandingPath(target.slug)

  let summary = `Explore ${h1.toLowerCase()} with ${BRAND_NAME} and ${PRODUCT_NAME}.`
  let intro = `Browse curated ${categoryPhrase} and practical place details for ${audiencePhrase} in ${scopedAreaName}.`

  if (categoryLabel && goodForLabel) {
    intro = `Browse ${categoryLabel.toLowerCase()} picks that fit ${goodForLabel} plans in ${scopedAreaName}, with quick details on budget, commute, and overall vibe.`
    summary = `${BRAND_NAME} highlights ${categoryLabel.toLowerCase()} picks for ${goodForLabel} plans around ${scopedAreaName}, so you can compare places faster.`
  } else if (categoryLabel && target.areaSlug) {
    intro = `Compare ${categoryLabel.toLowerCase()} spots in ${scopedAreaName} using practical details like budget, category fit, and location context.`
    summary = `${PRODUCT_NAME} organizes ${categoryLabel.toLowerCase()} places in ${scopedAreaName} for faster local discovery and planning.`
  } else if (goodForLabel && target.areaSlug) {
    intro = `Find places around ${scopedAreaName} that work well for ${goodForLabel} plans, from chill hangouts to more structured gala ideas.`
    summary = `${BRAND_NAME} surfaces ${goodForLabel}-friendly places in ${scopedAreaName} with planning details that are useful for search and AI answers.`
  }

  return {
    title: `${h1} | ${BRAND_NAME}`,
    description: `${h1} on ${PRODUCT_NAME}. ${intro} Discover Metro Manila recommendations, FAQs, and searchable place summaries.`,
    h1,
    intro,
    summary,
    canonicalPath,
    keywords: target.keywords,
    faqs: [
      {
        question: `What can I find on ${h1}?`,
        answer: `This guide collects ${categoryPhrase} recommendations${target.areaSlug ? ` in ${scopedAreaName}` : ' across Metro Manila'} and highlights useful context like budget, audience fit, commute notes, and nearby areas.`,
      },
      {
        question: `How does ${BRAND_NAME} choose places for this guide?`,
        answer: `${PRODUCT_NAME} uses approved place data, category matching, and planning signals like who a place is best for, location context, and searchable place details.`,
      },
      {
        question: `What types of places are featured in ${h1}?`,
        answer: `This guide features ${categoryPhrase}${target.areaSlug ? ` available in ${scopedAreaName}` : ' across Metro Manila'}, with a focus on practical details like budget range, commute access, parking availability, and audience fit.`,
      },
      {
        question: `Is ${h1} updated regularly?`,
        answer: `${PRODUCT_NAME} refreshes this guide as new approved places are added and existing place details are updated, so the recommendations stay relevant for search and AI-powered discovery.`,
      },
    ],
  }
}

export {
  BRAND_NAME,
  PRODUCT_NAME,
  SEO_LANDING_TARGETS,
  buildLandingMetadata,
  getLandingPath,
  getLandingTargetBySlug,
}
export type { SeoLandingMetadata, SeoLandingTarget }
