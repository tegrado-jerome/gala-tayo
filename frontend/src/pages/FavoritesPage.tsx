import { useMemo, useState } from 'react'
import { Search, Sparkles, Trash2 } from 'lucide-react'
import GoogleSignInButton from '../components/GoogleSignInButton'
import InternalLink from '../components/InternalLink'
import DestructiveConfirmModal from '../components/DestructiveConfirmModal'
import { Button, Empty, Page, PlaceCard, PlaceCardSkeleton, cx } from '../components/ui'
import { useSavedFavorites, type FavoritePlace } from '../context/SavedFavoritesContext'
import { getPlacePhoto } from '../utils/placePhoto'
import { getPublicSiteUrl } from '../utils/site'

const FAVORITES_LOAD_MORE_BATCH_SIZE = 12
const AI_PROMPT_PLACE_LIMIT = 6

const SAVED_TABS = [
  { key: 'places', href: '/favorites', label: 'Places' },
  { key: 'plans', href: '/gala-plans/favorites', label: 'Plans' },
  { key: 'history', href: '/history', label: 'History' },
] as const

/** Places / Plans / History switcher shared by the saved screens. Each tab keeps its own route. */
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

export function SavedPlaceCard({ place, onRemove }: { place: FavoritePlace; onRemove?: () => void }) {
  const placeSlug = place.slug?.trim() || place.id
  return (
    <PlaceCard
      href={`/places/${encodeURIComponent(placeSlug)}`}
      title={place.name || 'Saved place'}
      imageUrl={getPlacePhoto(place)}
      meta={getPlaceMeta(place)}
      rating={place.rating}
      saved
      onToggleSave={onRemove}
    />
  )
}

function FavoritesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [isClearingAll, setIsClearingAll] = useState(false)
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false)
  const [clearAllError, setClearAllError] = useState('')
  const [visibleFavoritesCount, setVisibleFavoritesCount] = useState(FAVORITES_LOAD_MORE_BATCH_SIZE)
  const { session, isSessionLoading, isFavoritesLoading, favoritesError, favorites, removeFavorite, clearAllFavorites } = useSavedFavorites()

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
          <Button variant="soft" href={aiPlanHref} className="mt-4">
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
        <div className="g-grid is-4" aria-label="Loading saved places">
          {Array.from({ length: 4 }, (_, index) => (
            <PlaceCardSkeleton key={index} />
          ))}
        </div>
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="g-search min-w-0 flex-1">
                <Search className="g-ic" aria-hidden="true" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search saved places" aria-label="Search saved places" />
              </label>
              <Button variant="text" size="sm" onClick={() => setIsClearAllDialogOpen(true)} disabled={isClearingAll} className="self-start sm:self-auto">
                <Trash2 aria-hidden="true" />
                {isClearingAll ? 'Removing...' : 'Remove all'}
              </Button>
            </div>
          ) : null}

          {clearAllError ? (
            <p role="alert" className="g-sm" style={{ color: 'var(--bad)' }}>
              {clearAllError}
            </p>
          ) : null}

          {isFavoritesLoading && savedPlaces.length === 0 ? (
            <div className="g-grid is-4" aria-label="Loading saved places">
              {Array.from({ length: 4 }, (_, index) => (
                <PlaceCardSkeleton key={index} />
              ))}
            </div>
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
              <div className="g-grid is-4">
                {visibleSavedPlaces.map((favorite) => (
                  <SavedPlaceCard
                    key={favorite.id}
                    place={favorite.place as FavoritePlace}
                    onRemove={() => void handleRemoveFavorite(favorite.place?.id || favorite.id)}
                  />
                ))}
              </div>
              <p className="g-xs g-mut text-center">
                Showing {visibleSavedPlaces.length} of {filteredSavedPlaces.length} place{filteredSavedPlaces.length === 1 ? '' : 's'}
              </p>
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
