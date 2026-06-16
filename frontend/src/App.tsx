import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import WelcomePage from './pages/WelcomePage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import FavoritesPage from './pages/FavoritesPage'
import HistoryPage from './pages/HistoryPage'
import FeedbackPage from './pages/FeedbackPage'
import GalaPlansPage from './pages/GalaPlansPage'
import ReportsPage from './pages/ReportsPage'
import CommentNoticesPage from './pages/CommentNoticesPage'
import AdminPlaceImagesPage from './pages/AdminPlaceImagesPage'
import AuthPage from './pages/AuthPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import OnboardingPage from './pages/OnboardingPage'
import ProfilePage from './pages/ProfilePage'
import PublicProfilePage from './pages/PublicProfilePage'
import ProfileSearchPage from './pages/ProfileSearchPage'
import PublicGalaPlanPage from './pages/PublicGalaPlanPage'
import LegalPage from './pages/LegalPage'
import PlaceDetailView from './components/PlaceDetailView'
import type { PlaceCardData } from './components/PlaceCard'
import { SavedFavoritesProvider } from './context/SavedFavoritesContext'
import { supabase } from './supabase'
import { getOnboardingStatus } from './utils/profileApi'
import { navigateToPath } from './utils/navigation'

type PlaceDetail = {
  id: string
  slug: string
  name: string
  location: string
  address?: string | null
  city?: string | null
  area?: string | null
  description: string
  place_history?: string | null
  best_time_to_visit?: string | null
  visit_duration?: string | null
  good_for?: string[]
  not_ideal_for?: string[]
  crowd_level?: string | null
  indoor_outdoor?: string | null
  weather_fit?: string | null
  parking_info?: string | null
  accessibility_notes?: string | null
  decision_reason?: string | null
  commute_friendly?: boolean | null
  commute_access?: string | null
  nearby_context?: string | null
  budget_notes?: string | null
  verification_status?: string | null
  verification_notes?: string | null
  verification_sources?: string[]
  last_verified_at?: string | null
  website_url?: string | null
  google_maps_url?: string | null
  category: string
  entranceFee: string
  openHours: string
  website: string
  latitude: number
  longitude: number
  imageUrl: string
  curatedImageUrls: string[]
}

type PlaceDetailCardData = PlaceCardData & {
  id: string
  slug: string
}

function parsePlaceSlugFromPath(pathname: string): string | null {
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

function parsePublicProfileUsername(pathname: string): string | null {
  const match = pathname.match(/^\/u\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

function parsePublicGalaPlanPath(pathname: string): { username: string; slug: string } | null {
  const match = pathname.match(/^\/u\/([^/]+)\/(?:plans|gala)\/([^/]+)\/?$/i)
  return match
    ? {
        username: decodeURIComponent(match[1]),
        slug: decodeURIComponent(match[2]),
      }
    : null
}

function parseOwnedGalaPlanPath(pathname: string): string | null {
  const match = pathname.match(/^\/gala-plans\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

function parseEditGalaPlanPath(pathname: string): string | null {
  const match = pathname.match(/^\/gala-plans\/([^/]+)\/edit\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

function isPath(pathname: string, path: string) {
  return pathname === path || pathname === `${path}/`
}

function isProtectedAccountPath(pathname: string) {
  const isExactProtectedPath = [
    '/favorites',
    '/history',
    '/feedback',
    '/gala-plans',
    '/gala-plans/new',
    '/gala-plans/liked',
    '/reports',
    '/comment-notices',
    '/admin/place-images',
    '/profile',
    '/me',
    '/settings',
    '/places/new',
    '/places/submit',
    '/submissions',
    '/photos/upload',
    '/ask-ai',
  ].some((path) => isPath(pathname, path))

  return (
    isExactProtectedPath ||
    /^\/gala-plans\/[^/]+\/edit\/?$/i.test(pathname) ||
    /^\/places\/[^/]+\/(comments|reviews|photos)\/?$/i.test(pathname)
  )
}

function AppLoadingState({ message = 'Loading GalaTayo...' }: { message?: string }) {
  return (
    <main className="min-h-screen bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
      <p className="text-sm font-semibold text-[var(--muted)]">{message}</p>
    </main>
  )
}

function mapBackendPlaceToCardData(place: PlaceDetail): PlaceDetailCardData {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    category: place.category,
    area: place.location,
    address: place.address || null,
    city: place.city || null,
    localArea: place.area || null,
    status: 'Open',
    reason: place.description,
    description: place.description,
    badge: 'Shared',
    hours: place.openHours,
    entranceFee: place.entranceFee,
    website: place.website,
    googleMapsUrl: place.google_maps_url,
    place_history: place.place_history,
    best_time_to_visit: place.best_time_to_visit,
    visit_duration: place.visit_duration,
    good_for: place.good_for ?? [],
    not_ideal_for: place.not_ideal_for ?? [],
    crowd_level: place.crowd_level,
    indoor_outdoor: place.indoor_outdoor,
    weather_fit: place.weather_fit,
    parking_info: place.parking_info,
    accessibility_notes: place.accessibility_notes,
    decision_reason: place.decision_reason,
    commute_friendly: place.commute_friendly,
    commute_access: place.commute_access,
    nearby_context: place.nearby_context,
    budget_notes: place.budget_notes,
    verification_status: place.verification_status,
    verification_notes: place.verification_notes,
    verification_sources: place.verification_sources ?? [],
    last_verified_at: place.last_verified_at,
    website_url: place.website_url,
    imageUrl: place.imageUrl,
    curatedImageUrls: place.curatedImageUrls,
    coordinates: {
      lat: place.latitude,
      lng: place.longitude,
    },
  }
}

function SharedPlacePage({ slug }: { slug: string }) {
  const [place, setPlace] = useState<PlaceDetailCardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
    const endpoint = apiBaseUrl
      ? `${apiBaseUrl}/places/${encodeURIComponent(slug)}`
      : `/api/places/${encodeURIComponent(slug)}`

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

        const data = (await response.json()) as PlaceDetail
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
  }, [slug])

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
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [isProfileLoading, setIsProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsSessionLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
      setProfileRefreshKey((currentValue) => currentValue + 1)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (isSessionLoading) {
      return undefined
    }

    if (!session) {
      setNeedsOnboarding(false)
      setProfileError('')
      setIsProfileLoading(false)

      if (isPath(pathname, '/onboarding') || isProtectedAccountPath(pathname)) {
        navigateToPath('/auth')
      }

      return undefined
    }

    let isMounted = true

    const loadProfileState = async () => {
      try {
        setIsProfileLoading(true)
        setProfileError('')
        const data = await getOnboardingStatus(session)

        if (!isMounted) {
          return
        }

        setNeedsOnboarding(data.needsOnboarding)

        if (data.needsOnboarding && !isPath(window.location.pathname, '/onboarding') && !isPath(window.location.pathname, '/terms') && !isPath(window.location.pathname, '/privacy')) {
          navigateToPath('/onboarding')
        } else if (!data.needsOnboarding && (isPath(window.location.pathname, '/onboarding') || isPath(window.location.pathname, '/auth/callback'))) {
          navigateToPath('/search')
        }
      } catch (error) {
        if (isMounted) {
          setProfileError(error instanceof Error ? error.message : 'Failed to load profile.')
        }
      } finally {
        if (isMounted) {
          setIsProfileLoading(false)
        }
      }
    }

    void loadProfileState()

    return () => {
      isMounted = false
    }
  }, [isSessionLoading, pathname, profileRefreshKey, session])

  const sharedPlaceSlug = useMemo(() => parsePlaceSlugFromPath(pathname), [pathname])
  const publicGalaPlanPath = useMemo(() => parsePublicGalaPlanPath(pathname), [pathname])
  const publicProfileUsername = useMemo(() => parsePublicProfileUsername(pathname), [pathname])
  const editGalaPlanId = useMemo(() => parseEditGalaPlanPath(pathname), [pathname])
  const ownedGalaPlanId = useMemo(() => parseOwnedGalaPlanPath(pathname), [pathname])

  const content = (() => {
    if (isSessionLoading) {
      return <AppLoadingState />
    }

    if (profileError && session) {
      return <AppLoadingState message={profileError} />
    }

    if (session && isProfileLoading && (needsOnboarding || isPath(pathname, '/onboarding') || isPath(pathname, '/auth/callback'))) {
      return <AppLoadingState message="Checking your profile..." />
    }

    if (isPath(pathname, '/onboarding')) {
      if (!session) {
        return <LoginPage />
      }

      return <OnboardingPage session={session} onComplete={() => setProfileRefreshKey((currentValue) => currentValue + 1)} />
    }

    if (pathname === '/terms' || pathname === '/terms/') {
      return <LegalPage type="terms" />
    }

    if (pathname === '/privacy' || pathname === '/privacy/') {
      return <LegalPage type="privacy" />
    }

    if (session && needsOnboarding) {
      return <AppLoadingState message="Taking you to onboarding..." />
    }

    if (!session && isProtectedAccountPath(pathname)) {
      return <AuthPage mode="sign_in" />
    }

    if (pathname === '/' || pathname === '') {
      return <WelcomePage />
    }

    if (pathname === '/search' || pathname === '/search/') {
      return <HomePage />
    }

    if (pathname === '/auth' || pathname === '/auth/' || pathname === '/login' || pathname === '/login/') {
      return <AuthPage mode="sign_in" />
    }

    if (pathname === '/signup' || pathname === '/signup/') {
      return <AuthPage mode="create_account" />
    }

    if (pathname === '/auth/callback' || pathname === '/auth/callback/') {
      return <AuthCallbackPage />
    }

    if (pathname === '/profiles/search' || pathname === '/profiles/search/') {
      return <ProfileSearchPage />
    }

    if (publicGalaPlanPath) {
      return <PublicGalaPlanPage username={publicGalaPlanPath.username} slug={publicGalaPlanPath.slug} />
    }

    if (publicProfileUsername) {
      return <PublicProfilePage username={publicProfileUsername} />
    }

    if (pathname === '/profile' || pathname === '/profile/' || pathname === '/me' || pathname === '/me/') {
      if (!session) {
        return <LoginPage />
      }

      return <ProfilePage session={session} />
    }

    if (pathname === '/favorites' || pathname === '/favorites/') {
      return <FavoritesPage />
    }

    if (pathname === '/history' || pathname === '/history/') {
      return <HistoryPage />
    }

    if (pathname === '/feedback' || pathname === '/feedback/') {
      return <FeedbackPage />
    }

    if (pathname === '/gala-plans' || pathname === '/gala-plans/') {
      if (!session) {
        return <LoginPage />
      }

      return <GalaPlansPage mode="list" session={session} />
    }

    if (pathname === '/gala-plans/new' || pathname === '/gala-plans/new/') {
      if (!session) {
        return <LoginPage />
      }

      return <GalaPlansPage mode="new" session={session} />
    }

    if (pathname === '/gala-plans/liked' || pathname === '/gala-plans/liked/') {
      if (!session) {
        return <LoginPage />
      }

      return <GalaPlansPage mode="liked" session={session} />
    }

    if (editGalaPlanId) {
      if (!session) {
        return <LoginPage />
      }

      return <GalaPlansPage mode="edit" planId={editGalaPlanId} session={session} />
    }

    if (ownedGalaPlanId && ownedGalaPlanId !== 'new' && ownedGalaPlanId !== 'liked') {
      return <GalaPlansPage mode="detail" planId={ownedGalaPlanId} session={session} />
    }

    if (pathname === '/reports' || pathname === '/reports/') {
      return <ReportsPage />
    }

    if (pathname === '/comment-notices' || pathname === '/comment-notices/') {
      return <CommentNoticesPage />
    }

    if (pathname === '/admin/place-images' || pathname === '/admin/place-images/') {
      if (!session) {
        return <LoginPage />
      }

      return <AdminPlaceImagesPage session={session} />
    }

    if (sharedPlaceSlug) {
      return <SharedPlacePage slug={sharedPlaceSlug} />
    }

    return <HomePage />
  })()

  return <SavedFavoritesProvider>{content}</SavedFavoritesProvider>
}

export default App
