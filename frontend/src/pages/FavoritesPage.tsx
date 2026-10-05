import { useEffect, useMemo, useRef, useState } from 'react'
import { Heart, MapPin, MoreHorizontal, Search, Sparkles, Trash2 } from 'lucide-react'
import GoogleSignInButton from '../components/GoogleSignInButton'
import InternalLink from '../components/InternalLink'
import DestructiveConfirmModal from '../components/DestructiveConfirmModal'
import { Button, Empty, Page, Sheet, Skeleton, cx } from '../components/ui'
import { useSavedFavorites, type FavoritePlace } from '../context/SavedFavoritesContext'
import { getPlacePhoto } from '../utils/placePhoto'
import { getPublicSiteUrl } from '../utils/site'

const FAVORITES_LOAD_MORE_BATCH_SIZE = 12
const AI_PROMPT_PLACE_LIMIT = 6

const SAVED_TABS = [
  { key: 'places', href: '/favorites', label: 'Places' },
  { key: 'plans', href: '/gala-plans/favorites', label: 'Plans' },
] as const

/** Places / Plans switcher shared by the saved screens. Each tab keeps its own route. */
export function SavedTabs({ current, placesCount }: { current: (typeof SAVED_TABS)[number]['key']; placesCount?: number }) {
  return (
    <nav className="g-tabs mt-5" aria-label="Saved">
      {SAVED_TABS.map((tab) => (
        <InternalLink
          key={tab.key}
          href={tab.href}
          className={cx('g-tab inline-flex items-center gap-1.5 no-underline', tab.key === current && 'is-on')}
          aria-current={tab.key === current ? 'page' : undefined}
        >
          {tab.label}
          {tab.key === 'places' && placesCount ? <span className="g-fnt">{placesCount}</span> : null}
        </InternalLink>
      ))}
    </nav>
  )
}

function getPlaceMeta(place: FavoritePlace) {
  const parts = [place.category?.trim(), place.area?.trim() || place.city?.trim()].filter(Boolean)
  return Array.from(new Set(parts)).join(' · ') || 'Saved place'
}

const MASONRY = 'columns-2 gap-2.5 md:columns-3 md:gap-3 lg:columns-4'
// Real photo sizes are unknown, so heights alternate by position for the Pinterest rhythm.
const MASONRY_RATIOS = ['3 / 4', '4 / 5', '1 / 1', '4 / 3']
const PHOTO_SHADE = 'linear-gradient(to top, rgba(15, 33, 56, 0.62) 0%, rgba(15, 33, 56, 0) 55%)'

function getPriceLabel(place: FavoritePlace) {
  if (place.is_free) return 'Free'
  if (place.budget_min != null && place.budget_min > 0) return `₱${Math.round(place.budget_min).toLocaleString('en-PH')}`
  return null
}

/** Masonry tile: photo with the name and price on it, heart top-right, meta under it on desktop. */
export function SavedPlaceCard({ place, index = 0, onRemove }: { place: FavoritePlace; index?: number; onRemove?: () => void }) {
  const placeSlug = place.slug?.trim() || place.id
  const title = place.name || 'Saved place'
  const photo = getPlacePhoto(place)
  const price = getPriceLabel(place)
  return (
    <div className="relative mb-2.5 break-inside-avoid md:mb-3">
      <InternalLink href={`/places/${encodeURIComponent(placeSlug)}`} className="group block min-w-0 no-underline">
        <div className="relative overflow-hidden rounded-[var(--r-3)]" style={{ aspectRatio: MASONRY_RATIOS[index % MASONRY_RATIOS.length], background: 'var(--sea-soft)' }}>
          <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
            <MapPin size={28} color="var(--sea)" strokeWidth={1.75} opacity={0.45} />
          </span>
          {photo ? (
            <img src={photo} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : null}
          <span className="absolute inset-0" style={{ background: PHOTO_SHADE }} aria-hidden="true" />
          <span className="absolute inset-x-2.5 bottom-2.5 line-clamp-2 text-[13px] font-bold leading-snug text-white" style={{ textShadow: '0 1px 3px rgba(15, 33, 56, 0.5)' }}>
            {title}
            {price ? ` · ${price}` : ''}
          </span>
        </div>
        <span className="g-xs g-mut mt-1.5 hidden truncate md:block">{getPlaceMeta(place)}</span>
      </InternalLink>
      {onRemove ? (
        <button type="button" className="g-pc-save" aria-pressed="true" aria-label={`Remove ${title} from saved`} onClick={onRemove}>
          <Heart className="g-ic" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function MasonrySkeleton() {
  return (
    <div className={MASONRY} aria-label="Loading saved places">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="mb-2.5 break-inside-avoid !rounded-[var(--r-3)] md:mb-3" style={{ aspectRatio: MASONRY_RATIOS[index % MASONRY_RATIOS.length] }} />
      ))}
    </div>
  )
}

function FavoritesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [isClearingAll, setIsClearingAll] = useState(false)
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [clearAllError, setClearAllError] = useState('')
  const [visibleFavoritesCount, setVisibleFavoritesCount] = useState(FAVORITES_LOAD_MORE_BATCH_SIZE)
  const { session, isSessionLoading, isFavoritesLoading, favoritesError, favorites, removeFavorite, clearAllFavorites } = useSavedFavorites()

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

  const savedPlaces = useMemo(() => favorites.filter((favorite) => Boolean(favorite.place)), [favorites])

  const filteredSavedPlaces = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) return savedPlaces
    return savedPlaces.filter((favorite) => {
      const place = favorite.place as FavoritePlace
      return [place.name, place.address, place.city, place.area, place.category].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
    })
  }, [savedPlaces, searchQuery])
  const visibleSavedPlaces = useMemo(() => filteredSavedPlaces.slice(0, visibleFavoritesCount), [filteredSavedPlaces, visibleFavoritesCount])
  const hasMoreSavedPlaces = visibleSavedPlaces.length < filteredSavedPlaces.length

  const aiPlanHref = useMemo(() => {
    const names = savedPlaces
      .map((favorite) => favorite.place?.name?.trim())
      .filter(Boolean)
      .slice(0, AI_PROMPT_PLACE_LIMIT)
    return names.length > 0 ? `/plan-with-ai?q=${encodeURIComponent(`Plan a gala from my saved places: ${names.join(', ')}`)}` : '/plan-with-ai'
  }, [savedPlaces])

  const handleRemoveFavorite = async (favoriteId: string) => {
    if (removingIds.has(favoriteId)) return
    setRemovingIds((current) => new Set(current).add(favoriteId))

    try {
      await removeFavorite(favoriteId)
    } catch {
      setRemovingIds((current) => {
        const next = new Set(current)
        next.delete(favoriteId)
        return next
      })
    }
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
      <header>
        <h1 className="g-h1">Saved</h1>
        <p className="g-mut mt-2">
          {isSignedIn && savedPlaces.length > 0
            ? `${savedPlaces.length} saved place${savedPlaces.length === 1 ? '' : 's'}. Pick a few and turn them into a gala.`
            : 'Your favorite gala spots, ready when you are.'}
        </p>
        {isSignedIn && savedPlaces.length > 0 ? (
          <Button variant="tara" href={aiPlanHref} className="mt-4">
            <Sparkles aria-hidden="true" />
            Plan a gala from my saved places
          </Button>
        ) : null}
      </header>

      <SavedTabs current="places" placesCount={isSignedIn ? savedPlaces.length : undefined} />

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
        <MasonrySkeleton />
      ) : null}

      {!isSessionLoading && !session?.user ? (
        <Empty
          title="Sign in to see your saved places."
          description="Your saved places are connected to your account."
          action={<GoogleSignInButton redirectTo={getPublicSiteUrl('/favorites')} />}
        />
      ) : null}

      {isSignedIn ? (
        <div className="grid gap-4">
          {savedPlaces.length > 0 ? (
            <div className="flex items-center gap-2">
              <label className="g-search min-w-0 flex-1">
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
            <MasonrySkeleton />
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
            <Empty title="No saved places match that search." action={<Button variant="line" onClick={() => setSearchQuery('')}>Clear search</Button>} />
          ) : null}

          {visibleSavedPlaces.length > 0 ? (
            <>
              <div className={MASONRY}>
                {visibleSavedPlaces.map((favorite, index) => (
                  <SavedPlaceCard
                    key={favorite.id}
                    index={index}
                    place={favorite.place as FavoritePlace}
                    onRemove={() => void handleRemoveFavorite(favorite.place?.id || favorite.id)}
                  />
                ))}
              </div>
              {hasMoreSavedPlaces ? (
                <div className="flex justify-center">
                  <Button variant="line" onClick={() => setVisibleFavoritesCount((current) => current + FAVORITES_LOAD_MORE_BATCH_SIZE)}>
                    Load more
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Page>
  )
}

export default FavoritesPage
