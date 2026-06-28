import categoryHeroBarkada from '../assets/chibis/category-heroes/category-hero-barkada.webp'
import categoryHeroCafe from '../assets/chibis/category-heroes/category-hero-cafe.webp'
import categoryHeroChill from '../assets/chibis/category-heroes/category-hero-chill.webp'
import categoryHeroDate from '../assets/chibis/category-heroes/category-hero-date.webp'
import categoryHeroFamily from '../assets/chibis/category-heroes/category-hero-family.webp'
import categoryHeroHeritage from '../assets/chibis/category-heroes/category-hero-heritage.webp'
import categoryHeroKainan from '../assets/chibis/category-heroes/category-hero-kainan.webp'
import categoryHeroMall from '../assets/chibis/category-heroes/category-hero-mall.webp'
import categoryHeroMuseum from '../assets/chibis/category-heroes/category-hero-museum.webp'
import categoryHeroNightlife from '../assets/chibis/category-heroes/category-hero-nightlife.webp'
import categoryHeroParke from '../assets/chibis/category-heroes/category-hero-parke.webp'
import categoryHeroShopping from '../assets/chibis/category-heroes/category-hero-shopping.webp'
import categoryHeroStudy from '../assets/chibis/category-heroes/category-hero-study.webp'
import categoryHeroTourist from '../assets/chibis/category-heroes/category-hero-tourist.webp'
import type { PlaceCardData } from '../components/PlaceCard'

const categoryHeroImages: Record<string, string> = {
  barkada: categoryHeroBarkada,
  cafe: categoryHeroCafe,
  chill: categoryHeroChill,
  date: categoryHeroDate,
  family: categoryHeroFamily,
  heritage: categoryHeroHeritage,
  kainan: categoryHeroKainan,
  mall: categoryHeroMall,
  museum: categoryHeroMuseum,
  nightlife: categoryHeroNightlife,
  parke: categoryHeroParke,
  shopping: categoryHeroShopping,
  study: categoryHeroStudy,
  tourist: categoryHeroTourist,
}

function normalizeCategoryKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getCandidateCategoryKeys(place: PlaceCardData) {
  const keys = [
    place.category,
    ...(place.matchedCategories ?? []).map((item) => item.id),
    ...(place.categories ?? []).map((item) => item.id),
    ...(place.matchedTags ?? []).map((item) => item.id),
    ...(place.tags ?? []).map((item) => item.id),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => {
      const normalizedValue = normalizeCategoryKey(value)

      if (normalizedValue === 'park') {
        return ['parke']
      }

      if (normalizedValue === 'shop' || normalizedValue === 'shops') {
        return ['shopping']
      }

      if (normalizedValue === 'food' || normalizedValue === 'restaurant') {
        return ['kainan']
      }

      return [normalizedValue]
    })

  return Array.from(new Set(keys))
}

function getCategoryHeroImage(place: PlaceCardData) {
  const categoryKeys = getCandidateCategoryKeys(place)

  for (const key of categoryKeys) {
    if (categoryHeroImages[key]) {
      return categoryHeroImages[key]
    }
  }

  return categoryHeroImages.tourist
}

export { categoryHeroImages, getCategoryHeroImage, normalizeCategoryKey }
