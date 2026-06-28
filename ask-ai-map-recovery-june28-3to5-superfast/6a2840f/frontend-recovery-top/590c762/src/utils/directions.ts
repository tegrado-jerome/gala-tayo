type DirectionPlace = {
  googleMapsUrl?: string | null
  google_maps_url?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
  coordinates?: {
    lat?: number | string | null
    lng?: number | string | null
  } | null
}

function parseCoordinate(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value)

    if (Number.isFinite(parsedValue)) {
      return parsedValue
    }
  }

  return null
}

function getDirectionsUrl(place: DirectionPlace) {
  const seededGoogleMapsUrl = place.googleMapsUrl?.trim() || place.google_maps_url?.trim()

  if (seededGoogleMapsUrl) {
    return seededGoogleMapsUrl
  }

  const latitude = parseCoordinate(place.latitude ?? place.coordinates?.lat)
  const longitude = parseCoordinate(place.longitude ?? place.coordinates?.lng)

  if (latitude === null || longitude === null) {
    return null
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`
}

function openDirectionsUrl(directionsUrl: string | null) {
  if (!directionsUrl) {
    return
  }

  window.open(directionsUrl, '_blank', 'noopener,noreferrer')
}

export { getDirectionsUrl, openDirectionsUrl }
export type { DirectionPlace }
