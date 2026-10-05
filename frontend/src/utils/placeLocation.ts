import { displayCityName } from './cityName'

/** "Area, City" when both exist and differ (e.g. "Marulas, Valenzuela"), else whichever exists. */
export function formatPlaceLocation({ area, city }: { area?: string | null; city?: string | null }) {
  const cleanArea = displayCityName(area?.trim() ?? '')
  const cleanCity = displayCityName(city?.trim() ?? '')
  if (cleanArea && cleanCity && cleanArea.toLowerCase() !== cleanCity.toLowerCase()) return `${cleanArea}, ${cleanCity}`
  return cleanCity || cleanArea
}

/** Place card meta line: "Category · Area, City". */
export function formatPlaceCardMeta({ category, area, city }: { category?: string | null; area?: string | null; city?: string | null }) {
  return [category?.trim(), formatPlaceLocation({ area, city })].filter(Boolean).join(' · ')
}
