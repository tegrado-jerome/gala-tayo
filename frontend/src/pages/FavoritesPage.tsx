import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { DotsThree as MoreHorizontal } from '@phosphor-icons/react/dist/csr/DotsThree'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Trash as Trash2 } from '@phosphor-icons/react/dist/csr/Trash'
import GoogleSignInButton from '../components/GoogleSignInButton'
import InternalLink from '../components/InternalLink'
import DestructiveConfirmModal from '../components/DestructiveConfirmModal'
import PhotoCard, { type PhotoCardPlace } from '../components/discover/PhotoCard'
import { Button, Empty, Masonry, Page, PlaceCardSkeleton, Sheet } from '../components/ui'
import { useSavedFavorites, type FavoritePlace } from '../context/SavedFavoritesContext'
import { listFavoriteGalaPlans } from '../utils/galaPlansApi'
import { getPlacePhoto } from '../utils/placePhoto'
import { getPublicSiteUrl } from '../utils/site'
import '../design/me.css'

const FAVORITES_LOAD_MORE_BATCH_SIZE = 12
const AI_PROMPT_PLACE_LIMIT = 6

const CITY_COLLECTION_LIMIT = 6

function toPhotoCardPlace(place: FavoritePlace): PhotoCardPlace {
  return {
    id: place.id,
    slug: place.slug,
    name: place.name || 'Saved place',
    category: place.category,
    area: place.area,
    city: place.city,
    imageUrl: getPlacePhoto(place),
    rating: place.rating,
    budgetMin: place.is_free ? 0 : place.budget_min,
  }
}

/** Airbnb wishlist cover: one big photo and two small ones; empty slots show the icon on mist. */
function Collage({ photos, icon: Icon }: { photos: string[]; icon: typeof MapPin }) {
  const slots = photos.length >= 3 ? photos.slice(0, 3) : photos.length > 0 ? [photos[0]] : [null]
  return (
    <span className={slots.length === 1 ? 'me-wl-art is-1' : 'me-wl-art'} aria-hidden="true">
      {slots.map((photo, index) => (
        <span key={index}>
          <Icon weight="duotone" />
          {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : null}
        </span>
      ))}
    </span>
  )
}

function GridSkeleton() {
  return (
    <Masonry aria-label="Loading saved places">
      {Array.from({ length: 4 }, (_, index) => (
        <PlaceCardSkeleton key={index} />
      ))}
    </Masonry>
  )
}

type SavedPlans = { count: number; photos: string[] } | null

function FavoritesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [cityFilter, setCityFilter] = useState<string | null>(null)
  const [isClearingAll, setIsClearingAll] = useState(false)
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLElement>(null)
  const [clearAllError, setClearAllError] = useState('')
  const [visibleFavoritesCount, setVisibleFavoritesCount] = useState(FAVORITES_LOAD_MORE_BATCH_SIZE)
  const [savedPlans, setSavedPlans] = useState<SavedPlans>(null)
  const { session, isSessionLoading, isFavoritesLoading, favoritesError, favorites, clearAllFavorites } = useSavedFavorites()

  useEffect(() => {
    if (!isMenuOpen) return undefined
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isMenuOpen])

  useEffect(() => {
    if (!session?.user) return undefined
    let isMounted = true
    listFavoriteGalaPlans(session)
      .then((data) => {
        if (!isMounted) return
        const photos = data.plans.flatMap((plan) => (plan.preview_places ?? []).map((place) => place.image_url?.trim()).filter((url): url is string => Boolean(url)))
        setSavedPlans({ count: data.plans.length, photos: Array.from(new Set(photos)) })
      })
      .catch(() => {
        if (isMounted) setSavedPlans(null)
      })
    return () => {
      isMounted = false
    }
  }, [session])

  const savedPlaces = useMemo(() => favorites.filter((favorite) => Boolean(favorite.place)), [favorites])

  // Real collections from the saved places themselves: one per city once places span 2+ cities.
  const cityCollections = useMemo(() => {
    const byCity = new Map<string, FavoritePlace[]>()
    for (const favorite of savedPlaces) {
      const place = favorite.place as FavoritePlace
      const city = place.city?.trim()
      if (city) byCity.set(city, [...(byCity.get(city) ?? []), place])
    }
    if (byCity.size < 2) return []
    return Array.from(byCity, ([city, places]) => ({ city, places }))
      .sort((a, b) => b.places.length - a.places.length)
      .slice(0, CITY_COLLECTION_LIMIT)
  }, [savedPlaces])

  const filteredSavedPlaces = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return savedPlaces.filter((favorite) => {
      const place = favorite.place as FavoritePlace
      if (cityFilter && place.city?.trim() !== cityFilter) return false
      if (!normalizedQuery) return true
      return [place.name, place.address, place.city, place.area, place.category].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
    })
  }, [savedPlaces, searchQuery, cityFilter])
  const visibleSavedPlaces = useMemo(() => filteredSavedPlaces.slice(0, visibleFavoritesCount), [filteredSavedPlaces, visibleFavoritesCount])
  const hasMoreSavedPlaces = visibleSavedPlaces.length < filteredSavedPlaces.length

  const aiPlanHref = useMemo(() => {
    const names = savedPlaces
      .map((favorite) => favorite.place?.name?.trim())
      .filter(Boolean)
      .slice(0, AI_PROMPT_PLACE_LIMIT)
    return names.length > 0 ? `/plan-with-ai?q=${encodeURIComponent(`Plan a gala from my saved places: ${names.join(', ')}`)}` : '/plan-with-ai'
  }, [savedPlaces])

  const photosOf = (places: FavoritePlace[]) => places.map((place) => getPlacePhoto(place)).filter((url): url is string => Boolean(url))

  const pickCity = (city: string | null) => {
    setCityFilter(city)
    setVisibleFavoritesCount(FAVORITES_LOAD_MORE_BATCH_SIZE)
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const confirmClearAll = async () => {
    if (isClearingAll) return

    try {
      setIsClearingAll(true)
      setClearAllError('')
      await clearAllFavorites()
    } catch (error) {
      setClearAllError(error instanceof Error ? error.message : 'Unable to clear favorites. Please try again.')
    } finally {
      setIsClearingAll(false)
      setIsClearAllDialogOpen(false)
      setVisibleFavoritesCount(FAVORITES_LOAD_MORE_BATCH_SIZE)
      setCityFilter(null)
    }
  }

  const isSignedIn = !isSessionLoading && Boolean(session?.user)
  const removeAllItem = (
    <button
      type="button"
      role="menuitem"
      className="flex min-h-11 w-full items-center gap-3 whitespace-nowrap rounded-[var(--r-2)] px-3 text-left font-medium hover:bg-[var(--fill)] disabled:opacity-40"
      style={{ color: 'var(--bad)' }}
      disabled={isClearingAll}
      onClick={() => {
        setIsMenuOpen(false)
        setIsClearAllDialogOpen(true)
      }}
    >
      <Trash2 className="g-ic" aria-hidden="true" />
      {isClearingAll ? 'Removing...' : 'Remove all places'}
    </button>
  )

  return (
    <Page>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="g-h1">Saved</h1>
          <p className="g-mut mt-1">
            {isSignedIn && savedPlaces.length > 0
              ? `${savedPlaces.length} saved place${savedPlaces.length === 1 ? '' : 's'}. Pick a few and turn them into a gala.`
              : 'Your favorite gala spots, ready when you are.'}
          </p>
        </div>
        {isSignedIn && savedPlaces.length > 0 ? (
          <Button variant="tara" href={aiPlanHref}>
            <Sparkles aria-hidden="true" />
            Plan a gala from these
          </Button>
        ) : null}
      </header>

      <DestructiveConfirmModal
        isOpen={isClearAllDialogOpen}
        title="Remove all saved places?"
        description="This will clear every place from Favorites. You can save them again later."
        confirmLabel="Remove all"
        isConfirming={isClearingAll}
        onCancel={() => setIsClearAllDialogOpen(false)}
        onConfirm={() => void confirmClearAll()}
      />

      {isSessionLoading ? (
        <div className="mt-6">
          <GridSkeleton />
        </div>
      ) : null}

      {!isSessionLoading && !session?.user ? (
        <Empty
          className="mt-6"
          title="Sign in to see your saved places."
          description="Your saved places are connected to your account."
          action={<GoogleSignInButton redirectTo={getPublicSiteUrl('/favorites')} />}
        />
      ) : null}

      {isSignedIn ? (
        <>
          <section aria-label="Collections" className="mt-6">
            <div className="me-wls">
              <button type="button" className="me-wl" aria-pressed={cityFilter === null} onClick={() => pickCity(null)}>
                <Collage photos={photosOf(savedPlaces.map((favorite) => favorite.place as FavoritePlace))} icon={Heart} />
                <span className="me-wl-t">All saved places</span>
                <span className="me-wl-s">{isFavoritesLoading && savedPlaces.length === 0 ? 'Loading…' : `${savedPlaces.length} saved`}</span>
              </button>
              <InternalLink href="/gala-plans/favorites" className="me-wl">
                <Collage photos={savedPlans?.photos ?? []} icon={CalendarBlank} />
                <span className="me-wl-t">Saved plans</span>
                <span className="me-wl-s">{savedPlans ? `${savedPlans.count} saved` : 'Plans you hearted'}</span>
              </InternalLink>
              {cityCollections.map(({ city, places }) => (
                <button key={city} type="button" className="me-wl" aria-pressed={cityFilter === city} onClick={() => pickCity(cityFilter === city ? null : city)}>
                  <Collage photos={photosOf(places)} icon={MapPin} />
                  <span className="me-wl-t">{city}</span>
                  <span className="me-wl-s">{places.length} saved</span>
                </button>
              ))}
            </div>
          </section>

          <section ref={gridRef} aria-labelledby="saved-places-title" className="mt-10 grid scroll-mt-24 gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <h2 id="saved-places-title" className="g-h2 truncate">{cityFilter ? `Saved in ${cityFilter}` : 'Saved places'}</h2>
              {cityFilter ? (
                <Button variant="soft" size="sm" iconOnly aria-label="Show all saved places" onClick={() => pickCity(null)}>
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>

            {savedPlaces.length > 0 ? (
              <div className="flex items-center gap-2">
                <label className="g-search min-w-0 flex-1 focus-within:border-[var(--ink)]">
                  <Search className="g-ic" aria-hidden="true" />
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search saved places" aria-label="Search saved places" />
                </label>
                <div ref={menuRef} className="relative shrink-0">
                  <Button variant="line" iconOnly aria-label="More options" aria-haspopup="menu" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)}>
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                  {isMenuOpen ? (
                    <>
                      <div
                        role="menu"
                        aria-label="Saved places options"
                        className="absolute right-0 top-full z-50 mt-2 hidden w-max p-1 lg:block"
                        style={{ background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-3)', boxShadow: 'var(--sh-2)' }}
                      >
                        {removeAllItem}
                      </div>
                      <div className="lg:hidden">
                        <Sheet open onClose={() => setIsMenuOpen(false)} title="Saved places" labelledBy="saved-options-title">
                          {removeAllItem}
                        </Sheet>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {clearAllError ? (
              <p role="alert" className="g-sm" style={{ color: 'var(--bad)' }}>
                {clearAllError}
              </p>
            ) : null}

            {isFavoritesLoading && savedPlaces.length === 0 ? (
              <GridSkeleton />
            ) : favoritesError ? (
              <Empty title="Hindi ma-load ang saved places." description={<span role="alert">{favoritesError}</span>} />
            ) : null}

            {savedPlaces.length === 0 && !isFavoritesLoading && !favoritesError ? (
              <Empty
                title="Wala ka pang saved places."
                description="Tap the heart on any place to keep it here."
                action={<Button variant="ink" href="/search">Explore places</Button>}
              />
            ) : null}

            {savedPlaces.length > 0 && filteredSavedPlaces.length === 0 ? (
              <Empty
                title="No saved places match that search."
                action={
                  <Button
                    variant="line"
                    onClick={() => {
                      setSearchQuery('')
                      setCityFilter(null)
                    }}
                  >
                    Clear search
                  </Button>
                }
              />
            ) : null}

            {visibleSavedPlaces.length > 0 ? (
              <>
                <Masonry>
                  {visibleSavedPlaces.map((favorite) => (
                    <PhotoCard key={favorite.id} place={toPhotoCardPlace(favorite.place as FavoritePlace)} onGuestFavorite={() => undefined} />
                  ))}
                </Masonry>
                {hasMoreSavedPlaces ? (
                  <div className="flex justify-center">
                    <Button variant="line" onClick={() => setVisibleFavoritesCount((current) => current + FAVORITES_LOAD_MORE_BATCH_SIZE)}>
                      Show more
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </Page>
  )
}

export default FavoritesPage
