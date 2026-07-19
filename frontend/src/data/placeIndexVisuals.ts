import type { PlaceDetail } from '../types/appTypes'
import { R2_PUBLIC_BASE_URL } from './r2Config'

const categoryOverviewRepresentativeSlug = 'national-museum-of-natural-history'

const cityRepresentativePlaceSlugs: Record<string, string> = {
  caloocan: 'caloocan-city-peoples-park',
  'las-pinas': 'sm-southmall',
  makati: 'glorietta',
  malabon: 'malabon-zoo-aquarium-and-botanical-garden',
  mandaluyong: 'shangri-la-plaza',
  manila: 'intramuros',
  marikina: 'kapitan-moy-cultural-center',
  muntinlupa: 'festival-mall-alabang',
  navotas: 'navotas-citywalk-and-amphitheater',
  paranaque: 'okada-manila',
  pasay: 'sm-mall-of-asia',
  pasig: 'ace-water-spa-pasig',
  pateros: 'inapuyan-resto-grill-pateros',
  'quezon-city': 'art-in-island',
  'san-juan': 'greenhills-mall-greenhills-shopping-center',
  taguig: 'bonifacio-high-street',
  valenzuela: 'museo-valenzuela',
}

const categoryRepresentativePlaceSlugs: Record<string, string> = {
  activity: 'superpark-mckinley',
  cafe: 'commune',
  cinema: 'glorietta-cinemas',
  food: 'some-thai',
  heritage: 'kapitan-moy-cultural-center',
  hotel: 'the-bellevue-manila',
  mall: 'sm-megamall',
  museum: 'national-museum-of-natural-history',
  nightlife: 'z-hostel-rooftop',
  park: 'greenbelt-park',
}

const placeImageSlugAliases: Record<string, string> = {
  'ace-water-spa-pasig': 'ace-water-spa-pasig',
  'art-in-island': 'art-in-island',
  'ayala-triangle-gardens': 'ayala-triangle-gardens',
  'binondo-chinatown': 'binondo-chinatown',
  'bonifacio-high-street': 'bonifacio-high-street',
  'caloocan-city-people-s-park': 'caloocan-city-peoples-park',
  commune: 'commune',
  'eastwood-city': 'eastwood-city',
  'festival-mall-alabang': 'festival-mall-alabang',
  'fort-santiago': 'fort-santiago',
  glorietta: 'glorietta',
  'glorietta-cinemas': 'glorietta-cinemas',
  'greenbelt-park': 'greenbelt-park',
  'greenhills-mall-greenhills-shopping-center': 'greenhills-mall-greenhills-shopping-center',
  intramuros: 'intramuros',
  'kapitan-moy-cultural-center': 'kapitan-moy-cultural-center',
  'malabon-zoo-aquarium-and-botanical-garden': 'malabon-zoo-aquarium-and-botanical-garden',
  'manila-ocean-park': 'manila-ocean-park',
  'marikina-river-park': 'marikina-river-park',
  'museo-valenzuela': 'museo-valenzuela',
  'national-museum-of-natural-history': 'national-museum-of-natural-history',
  'navotas-centennial-park': 'navotas-centennial-park',
  'navotas-citywalk-and-amphitheater': 'navotas-citywalk-and-amphitheater',
  'okada-manila': 'okada-manila',
  'inapuyan-resto-grill-pateros': 'inapuyan-resto-grill-pateros',
  'pateros-town-plaza': 'pateros-town-plaza',
  'quiapo-church': 'quiapo-church',
  'rizal-park-luneta-park': 'rizal-park-luneta-park',
  'shangri-la-plaza': 'shangri-la-plaza',
  'sm-city-valenzuela': 'sm-city-valenzuela',
  'sm-mall-of-asia': 'sm-mall-of-asia',
  'sm-megamall': 'sm-megamall',
  'sm-southmall': 'sm-southmall',
  'some-thai': 'some-thai',
  'st-joseph-parish-bamboo-organ-church': 'st-joseph-parish-bamboo-organ-church',
  'star-city': 'star-city',
  'superpark-mckinley': 'superpark-mckinley',
  'the-bellevue-manila': 'the-bellevue-manila',
  'the-mind-museum': 'the-mind-museum',
  'venice-grand-canal-mall': 'venice-grand-canal-mall',
  'z-hostel-rooftop': 'z-hostel-rooftop',
}

function getStaticPlaceImageUrlForSlug(placeSlug?: string | null) {
  const normalizedSlug = placeSlug?.trim().toLowerCase()
  if (!normalizedSlug) {
    return null
  }

  const imageSlug = placeImageSlugAliases[normalizedSlug] || normalizedSlug
  return `${R2_PUBLIC_BASE_URL}/places/${imageSlug}/${imageSlug}-1.webp`
}

function getPlaceDetailImageUrl(place?: PlaceDetail | null) {
  if (!place) {
    return null
  }

  return (
    place.thumbnailUrl?.trim() ||
    place.imageUrl?.trim() ||
    place.curatedImageUrls?.find((photo) => typeof photo === 'string' && photo.trim())?.trim() ||
    null
  )
}

function getDiscoveryImageUrl(placeSlug?: string | null, place?: PlaceDetail | null) {
  return getPlaceDetailImageUrl(place) || getStaticPlaceImageUrlForSlug(placeSlug)
}

export {
  categoryOverviewRepresentativeSlug,
  categoryRepresentativePlaceSlugs,
  cityRepresentativePlaceSlugs,
  getDiscoveryImageUrl,
  getPlaceDetailImageUrl,
  getStaticPlaceImageUrlForSlug,
}
