import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import WelcomePage from './pages/WelcomePage'
import HomePage from './pages/HomePage'
import HomeLandingPage from './pages/HomeLandingPage'
import SearchPage from './pages/SearchPageWords'
import LoginPage from './pages/LoginPage'
import FavoritesPage from './pages/FavoritesPage'
import HistoryPage from './pages/HistoryPage'
import FeedbackPage from './pages/FeedbackPage'
import GalaPlansPage from './pages/GalaPlansPage'
import ReportsPage from './pages/ReportsPage'
import AdminPlaceImagesPage from './pages/AdminPlaceImagesPage'
import AdminPlaceSubmissionsPage from './pages/AdminPlaceSubmissionsPage'
import AuthPage from './pages/AuthPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import OnboardingPage from './pages/OnboardingPage'
import ProfilePage from './pages/ProfilePage'
import AccountSettingsPage from './pages/AccountSettingsPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import PublicProfilePage from './pages/PublicProfilePage'
import ProfileSearchPage from './pages/ProfileSearchPage'
import PublicGalaPlanPage from './pages/PublicGalaPlanPage'
import LegalPage from './pages/LegalPage'
import PlaceSubmissionPage from './pages/PlaceSubmissionPage'
import MyPlaceSubmissionsPage from './pages/MyPlaceSubmissionsPage'
import PlaceDetailView from './components/PlaceDetailView'
import MobileBottomNav from './components/MobileBottomNav'
import UnifiedLoadingState from './components/UnifiedLoadingState'
import type { PlaceCardData } from './components/PlaceCard'
import { SavedFavoritesProvider } from './context/SavedFavoritesContext'
import { SystemMessageProvider } from './context/SystemMessageContext'
import { supabase } from './supabase'
import { getOnboardingStatus } from './utils/profileApi'
import { navigateToPath } from './utils/navigation'
import { markSoftNavigation } from './utils/navigationState'

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
  const match = pathname.match(/^\/gala-plan(?:s)?\/([^/]+)\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

function parseEditGalaPlanPath(pathname: string): string | null {
  const match = pathname.match(/^\/gala-plan(?:s)?\/([^/]+)\/edit\/?$/i)
  return match ? decodeURIComponent(match[1]) : null
}

const searchRouteCachePrefix = 'galatayo:search-route:'

function shouldSkipTopScrollRestore(pathname: string, search: string) {
  if (pathname !== '/search' && pathname !== '/search/') {
    return false
  }

  try {
    const rawCache = window.sessionStorage.getItem(`${searchRouteCachePrefix}${pathname}${search}`)

    if (!rawCache) {
      return false
    }

    const parsedCache = JSON.parse(rawCache) as { pendingScrollRestore?: boolean }
    return parsedCache.pendingScrollRestore === true
  } catch (error) {
    console.warn('Unable to inspect search scroll restore cache:', error)
    return false
  }
}

function getCanonicalGalaPlanPath(pathname: string) {
  if (isPath(pathname, '/gala-plan')) return '/gala-plans'
  if (isPath(pathname, '/gala-plan/new')) return '/gala-plans/new'
  if (isPath(pathname, '/gala-plan/liked') || isPath(pathname, '/gala-plan/favorites')) return '/gala-plans/favorites'
  if (isPath(pathname, '/gala-plans/liked')) return '/gala-plans/favorites'

  const editPlanId = parseEditGalaPlanPath(pathname)
  if (editPlanId && /^\/gala-plan\/[^/]+\/edit\/?$/i.test(pathname)) {
    return `/gala-plans/${encodeURIComponent(editPlanId)}/edit`
  }

  const ownedPlanId = parseOwnedGalaPlanPath(pathname)
  if (ownedPlanId && /^\/gala-plan\/[^/]+\/?$/i.test(pathname) && ownedPlanId !== 'new' && ownedPlanId !== 'liked' && ownedPlanId !== 'favorites') {
    return `/gala-plans/${encodeURIComponent(ownedPlanId)}`
  }

  return null
}

function isPath(pathname: string, path: string) {
  return pathname === path || pathname === `${path}/`
}

function getCanonicalAuthPath(pathname: string): '/login' | '/signup' | null {
  if (isPath(pathname, '/auth')) {
    return '/login'
  }

  if (isPath(pathname, '/sign-up')) {
    return '/signup'
  }

  return null
}

function getCanonicalSettingsPath(pathname: string): '/settings/change-password' | null {
  if (isPath(pathname, '/settings/password')) {
    return '/settings/change-password'
  }

  return null
}

function getCanonicalSubmitPlacePath(pathname: string): '/submit-place' | null {
  if (
    isPath(pathname, '/places/submit') ||
    isPath(pathname, '/places/new')
  ) {
    return '/submit-place'
  }

  return null
}

function isProtectedAccountPath(pathname: string) {
  const isExactProtectedPath = [
    '/favorites',
    '/history',
    '/feedback',
    '/gala-plan',
    '/gala-plan/new',
    '/gala-plan/liked',
    '/gala-plan/favorites',
    '/gala-plans',
    '/gala-plans/new',
    '/gala-plans/liked',
    '/gala-plans/favorites',
    '/reports',
    '/comment-notices',
    '/admin/place-images',
    '/admin/place-submissions',
    '/profile',
    '/me',
    '/settings',
    '/settings/change-password',
    '/places/new',
    '/places/submit',
    '/submissions',
    '/photos/upload',
    '/ask-ai',
  ].some((path) => isPath(pathname, path))

  return (
    isExactProtectedPath ||
    /^\/gala-plan\/[^/]+\/?$/i.test(pathname) ||
    /^\/gala-plans\/[^/]+\/?$/i.test(pathname) ||
    /^\/gala-plan\/[^/]+\/edit\/?$/i.test(pathname) ||
    /^\/gala-plans\/[^/]+\/edit\/?$/i.test(pathname) ||
    /^\/places\/[^/]+\/(comments|reviews|photos)\/?$/i.test(pathname)
  )
}

function shouldShowMobileBottomNav(pathname: string) {
  if (
    [
      '/',
      '/login',
      '/signup',
      '/auth',
      '/auth/callback',
      '/sign-up',
      '/onboarding',
      '/terms',
      '/privacy',
    ].some((path) => isPath(pathname, path))
  ) {
    return false
  }

  if (
    sharedRouteMatchers.some((matcher) => matcher(pathname))
  ) {
    return false
  }

  return true
}

const sharedRouteMatchers = [
  (pathname: string) => /^\/places\/[^/]+\/?$/i.test(pathname),
  (pathname: string) => /^\/place\/[^/]+\/?$/i.test(pathname),
  (pathname: string) => /^\/u\/[^/]+\/?$/i.test(pathname),
  (pathname: string) => /^\/u\/[^/]+\/(?:plans|gala)\/[^/]+\/?$/i.test(pathname),
]

function AppLoadingState({ message = 'Loading GalaTayo...' }: { message?: string }) {
  return (
    <UnifiedLoadingState
      variant="page"
      title={message}
      message="Please wait while we get things ready for you."
    />
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
      <UnifiedLoadingState
        variant="page"
        title="Preparing place details..."
        message="We are opening this shared place now."
      />
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
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))
  const [session, setSession] = useState<Session | null>(null)
  const [hasResolvedInitialAuth, setHasResolvedInitialAuth] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [hasResolvedProfile, setHasResolvedProfile] = useState(false)
  const [isInitialProfileLoading, setIsInitialProfileLoading] = useState(false)
  const [, setIsRefreshingSession] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)
  const sessionRef = useRef<Session | null>(null)
  const hasCompletedInitialAuthRef = useRef(false)
  const userId = session?.user?.id ?? null

  const { pathname, search } = locationState

  useEffect(() => {
    const handlePopState = () => {
      markSoftNavigation()
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    if (shouldSkipTopScrollRestore(pathname, search)) {
      return
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [pathname, search])

  useEffect(() => {
    const canonicalAuthPath = getCanonicalAuthPath(pathname)

    if (canonicalAuthPath && pathname !== canonicalAuthPath) {
      navigateToPath(canonicalAuthPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalGalaPlanPath = getCanonicalGalaPlanPath(pathname)

    if (canonicalGalaPlanPath && pathname !== canonicalGalaPlanPath) {
      navigateToPath(canonicalGalaPlanPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalSettingsPath = getCanonicalSettingsPath(pathname)

    if (canonicalSettingsPath && pathname !== canonicalSettingsPath) {
      navigateToPath(canonicalSettingsPath)
    }
  }, [pathname])

  useEffect(() => {
    const canonicalSubmitPlacePath = getCanonicalSubmitPlacePath(pathname)

    if (canonicalSubmitPlacePath && pathname !== canonicalSubmitPlacePath) {
      navigateToPath(canonicalSubmitPlacePath)
    }
  }, [pathname])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        sessionRef.current = data.session
        setSession(data.session)
        setHasResolvedInitialAuth(true)
        hasCompletedInitialAuthRef.current = true
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      const previousUserId = sessionRef.current?.user?.id ?? null
      const nextUserId = nextSession?.user?.id ?? null
      const didUserIdentityChange = previousUserId !== nextUserId

      sessionRef.current = nextSession
      setSession(nextSession)
      setHasResolvedInitialAuth(true)
      const hasCompletedInitialAuth = hasCompletedInitialAuthRef.current
      hasCompletedInitialAuthRef.current = true

      if (didUserIdentityChange && hasCompletedInitialAuth) {
        setHasResolvedProfile(false)
      }

      if (
        didUserIdentityChange ||
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'USER_UPDATED' ||
        event === 'PASSWORD_RECOVERY'
      ) {
        setProfileRefreshKey((currentValue) => currentValue + 1)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return undefined
    }

    const activeSession = sessionRef.current

    if (!activeSession) {
      setNeedsOnboarding(false)
      setHasResolvedProfile(true)
      setProfileError('')
      setIsInitialProfileLoading(false)
      setIsRefreshingSession(false)
      return undefined
    }

    let isMounted = true
    const isInitialProfileResolution = !hasResolvedProfile

    const loadProfileState = async () => {
      try {
        if (isInitialProfileResolution) {
          setIsInitialProfileLoading(true)
        } else {
          setIsRefreshingSession(true)
        }
        setProfileError('')
        const data = await getOnboardingStatus(activeSession)

        if (!isMounted) {
          return
        }

        setNeedsOnboarding(data.needsOnboarding)
        setHasResolvedProfile(true)
      } catch (error) {
        if (isMounted) {
          setProfileError(error instanceof Error ? error.message : 'Failed to load profile.')
        }
      } finally {
        if (isMounted) {
          setIsInitialProfileLoading(false)
          setIsRefreshingSession(false)
        }
      }
    }

    void loadProfileState()

    return () => {
      isMounted = false
    }
  }, [hasResolvedInitialAuth, hasResolvedProfile, profileRefreshKey, userId])

  useEffect(() => {
    if (!hasResolvedInitialAuth) {
      return
    }

    if (!session) {
      if (isPath(pathname, '/onboarding') || isProtectedAccountPath(pathname)) {
        navigateToPath('/login')
      }
      return
    }

    if (!hasResolvedProfile) {
      return
    }

    if (
      needsOnboarding &&
      !isPath(pathname, '/onboarding') &&
      !isPath(pathname, '/terms') &&
      !isPath(pathname, '/privacy')
    ) {
      navigateToPath('/onboarding')
      return
    }

    if (
      !needsOnboarding &&
      (isPath(pathname, '/onboarding') || isPath(pathname, '/auth/callback'))
    ) {
      navigateToPath('/home')
    }
  }, [hasResolvedInitialAuth, hasResolvedProfile, needsOnboarding, pathname, session])

  const sharedPlaceSlug = useMemo(() => parsePlaceSlugFromPath(pathname), [pathname])
  const publicGalaPlanPath = useMemo(() => parsePublicGalaPlanPath(pathname), [pathname])
  const publicProfileUsername = useMemo(() => parsePublicProfileUsername(pathname), [pathname])
  const editGalaPlanId = useMemo(() => parseEditGalaPlanPath(pathname), [pathname])
  const ownedGalaPlanId = useMemo(() => parseOwnedGalaPlanPath(pathname), [pathname])

  const content = (() => {
    if (!hasResolvedInitialAuth) {
      return <AppLoadingState />
    }

    if (profileError && session && !hasResolvedProfile) {
      return <AppLoadingState message={profileError} />
    }

    if (session && isInitialProfileLoading && !hasResolvedProfile) {
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
      return <WelcomePage session={session} />
    }

    if (pathname === '/home' || pathname === '/home/') {
      return <HomeLandingPage />
    }

    if (pathname === '/search' || pathname === '/search/') {
      return <SearchPage key={`search:${search || 'root'}`} />
    }

    if (pathname === '/ask-ai' || pathname === '/ask-ai/') {
      const initialAskAiQuestion = new URLSearchParams(search).get('q') ?? ''
      return <HomePage key={`ask-ai:${search || 'root'}`} initialMode="ask-ai" initialAskAiQuestion={initialAskAiQuestion} />
    }

    if (pathname === '/prompt-builder' || pathname === '/prompt-builder/') {
      return <HomePage initialPromptBuilderOpen />
    }

    if (pathname === '/login' || pathname === '/login/') {
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

    if (pathname === '/settings' || pathname === '/settings/') {
      if (!session) {
        return <LoginPage />
      }

      return <AccountSettingsPage session={session} />
    }

    if (
      pathname === '/settings/change-password' ||
      pathname === '/settings/change-password/' ||
      pathname === '/settings/password' ||
      pathname === '/settings/password/'
    ) {
      if (!session) {
        return <LoginPage />
      }

      return <ChangePasswordPage />
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

    if (pathname === '/gala-plan' || pathname === '/gala-plan/' || pathname === '/gala-plans' || pathname === '/gala-plans/') {
      if (!session) {
        return <LoginPage />
      }

      return <GalaPlansPage mode="list" session={session} />
    }

    if (pathname === '/gala-plan/new' || pathname === '/gala-plan/new/' || pathname === '/gala-plans/new' || pathname === '/gala-plans/new/') {
      if (!session) {
        return <LoginPage />
      }

      return <GalaPlansPage mode="new" session={session} />
    }

    if (
      pathname === '/gala-plan/liked' ||
      pathname === '/gala-plan/liked/' ||
      pathname === '/gala-plan/favorites' ||
      pathname === '/gala-plan/favorites/' ||
      pathname === '/gala-plans/liked' ||
      pathname === '/gala-plans/liked/' ||
      pathname === '/gala-plans/favorites' ||
      pathname === '/gala-plans/favorites/'
    ) {
      if (!session) {
        return <LoginPage />
      }

      return <GalaPlansPage mode="favorites" session={session} />
    }

    if (editGalaPlanId) {
      if (!session) {
        return <LoginPage />
      }

      return <GalaPlansPage mode="edit" planId={editGalaPlanId} session={session} />
    }

    if (ownedGalaPlanId && ownedGalaPlanId !== 'new' && ownedGalaPlanId !== 'liked' && ownedGalaPlanId !== 'favorites') {
      return <GalaPlansPage mode="detail" planId={ownedGalaPlanId} session={session} />
    }

    if (pathname === '/reports' || pathname === '/reports/') {
      return <ReportsPage />
    }

    if (pathname === '/comment-notices' || pathname === '/comment-notices/') {
      return <ReportsPage />
    }

    if (pathname === '/admin/place-images' || pathname === '/admin/place-images/') {
      if (!session) {
        return <LoginPage />
      }

      return <AdminPlaceImagesPage session={session} />
    }

    if (pathname === '/admin/place-submissions' || pathname === '/admin/place-submissions/') {
      if (!session) {
        return <LoginPage />
      }

      return <AdminPlaceSubmissionsPage session={session} />
    }

    if (
      pathname === '/submit-place' ||
      pathname === '/submit-place/' ||
      pathname === '/places/submit' ||
      pathname === '/places/submit/' ||
      pathname === '/places/new' ||
      pathname === '/places/new/'
    ) {
      return <PlaceSubmissionPage session={session} />
    }

    if (pathname === '/submissions' || pathname === '/submissions/') {
      if (!session) {
        return <LoginPage />
      }

      return <MyPlaceSubmissionsPage session={session} />
    }

    if (sharedPlaceSlug) {
      return <SharedPlacePage slug={sharedPlaceSlug} />
    }

    return <HomeLandingPage />
  })()

  const showMobileBottomNav = shouldShowMobileBottomNav(pathname)

  return (
    <SystemMessageProvider>
      <SavedFavoritesProvider>
        <div className={showMobileBottomNav ? 'pb-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] lg:pb-0' : ''}>
          {content}
        </div>
        {showMobileBottomNav ? <MobileBottomNav currentPath={pathname} session={session} /> : null}
      </SavedFavoritesProvider>
    </SystemMessageProvider>
  )
}

export default App
