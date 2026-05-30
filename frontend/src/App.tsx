import { useEffect, useMemo, useState } from 'react'
import HomePage from './pages/HomePage'
import FavoritesPage from './pages/FavoritesPage'
import HistoryPage from './pages/HistoryPage'
import PlaceDetailView from './components/PlaceDetailView'
import type { PlaceCardData } from './components/PlaceCard'
import { SavedFavoritesProvider } from './context/SavedFavoritesContext'

type BackendPlaceDetail = {
  id: string
  name: string
  location: string
  rating: number
  reviewCount: number
  description: string
  category: string
  entranceFee: string
  openHours: string
  website: string
  latitude: number
  longitude: number
  imageUrl: string
  curatedImageUrls: string[]
}

function parsePlaceIdFromPath(pathname: string): string | null {
  const placesMatch = pathname.match(/^\/places\/([^/]+)\/?$/i)
  if (placesMatch) {
    return decodeURIComponent(placesMatch[1])
  }

  const legacyPlaceMatch = pathname.match(/^\/place\/([^/]+)\/?$/i)
  if (legacyPlaceMatch) {
    return decodeURIComponent(legacyPlaceMatch[1])
  }

  return null
}

function mapBackendPlaceToCardData(place: BackendPlaceDetail): PlaceCardData {
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    area: place.location,
    rating: String(place.rating),
    reviewCount: String(place.reviewCount),
    status: 'Open',
    reason: place.description,
    badge: 'Shared',
    hours: place.openHours,
    entranceFee: place.entranceFee,
    website: place.website,
    imageUrl: place.imageUrl,
    slug: place.id,
    curatedImageUrls: place.curatedImageUrls,
    coordinates: {
      lat: place.latitude,
      lng: place.longitude,
    },
  }
}

function SharedPlacePage({ placeId }: { placeId: string }) {
  const [place, setPlace] = useState<PlaceCardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
    const endpoint = apiBaseUrl
      ? `${apiBaseUrl}/places/${encodeURIComponent(placeId)}`
      : `/api/places/${encodeURIComponent(placeId)}`

    const loadPlace = async () => {
      try {
        setIsLoading(true)
        setNotFound(false)
        setErrorMessage(null)
        setPlace(null)

        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal,
        })

        if (response.status === 404) {
          setNotFound(true)
          return
        }

        if (!response.ok) {
          throw new Error('Failed to load shared place.')
        }

        const data = (await response.json()) as BackendPlaceDetail
        setPlace(mapBackendPlaceToCardData(data))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load shared place.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadPlace()

    return () => controller.abort()
  }, [placeId])

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
        <p className="text-sm text-[var(--muted)]">Loading place details...</p>
      </main>
    )
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
        <h1 className="text-2xl font-semibold text-slate-900">Place not found</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We could not find details for this shared link.
        </p>
      </main>
    )
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
        <h1 className="text-2xl font-semibold text-slate-900">Unable to load place</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{errorMessage}</p>
      </main>
    )
  }

  if (!place) {
    return null
  }

  return <PlaceDetailView place={place} onBack={() => window.history.back()} />
}

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const sharedPlaceId = useMemo(() => parsePlaceIdFromPath(pathname), [pathname])

  const content = (() => {
    if (pathname === '/favorites' || pathname === '/favorites/') {
      return <FavoritesPage />
    }

    if (pathname === '/history' || pathname === '/history/') {
      return <HistoryPage />
    }

    if (sharedPlaceId) {
      return <SharedPlacePage placeId={sharedPlaceId} />
    }

    return <HomePage />
  })()

  return <SavedFavoritesProvider>{content}</SavedFavoritesProvider>
}

export default App
