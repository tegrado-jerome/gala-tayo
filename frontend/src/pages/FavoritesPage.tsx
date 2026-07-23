import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import GoogleSignInButton from '../components/GoogleSignInButton'
import PageHeroHeader from '../components/PageHeroHeader'
import { PageContainer, PageShell, CardSurface, EmptyState, Stack } from '../components/layout/ResponsiveLayouts'
import { BOTTOM_NAV_RESERVED_CLASS } from '../components/layout/Primitives'
import ActivityPlaceCard from '../components/ActivityPlaceCard'
import DestructiveConfirmModal from '../components/DestructiveConfirmModal'
import { useSavedFavorites, type FavoritePlace } from '../context/SavedFavoritesContext'
import { getPlacePhoto } from '../utils/placePhoto'
import { getPublicSiteUrl } from '../utils/site'
import { InlineSkeleton, ListingSkeleton } from '../components/loading/SkeletonStates'

const FAVORITES_LOAD_MORE_BATCH_SIZE = 10
const FAVORITES_GRID_CLASSNAME =
  'grid w-full grid-cols-1 items-start gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4'

function TrashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="m10 11 .3 6" />
      <path d="m14 11-.3 6" />
      <path d="M6.5 7 7.4 20h9.2l.9-13" />
    </svg>
  )
}

type IconProps = {
  className?: string
}

function PinIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

function SearchIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function getPlaceCategory(place: FavoritePlace) {
  return place.category?.trim() || 'Place'
}

function getPlaceLocation(place: FavoritePlace) {
  const city = place.city?.trim() || ''
  const area = place.area?.trim() || ''

  return area || city || 'Location unavailable'
}

function getPlaceChips(place: FavoritePlace) {
  const chips = [getPlaceCategory(place), place.area, place.city]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())

  return Array.from(new Set(chips)).slice(0, 3)
}

function getPlaceSearchText(place: FavoritePlace) {
  return [
    place.name,
    place.address,
    place.city,
    place.area,
    place.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function FavoriteCard({
  favorite,
  onRemove,
  isRemoving,
}: {
  favorite: { id: string; place: FavoritePlace | null }
  onRemove: () => void
  isRemoving: boolean
}) {
  const place = favorite.place as FavoritePlace
  const placeSlug = place.slug?.trim() || place.id
  const chips = getPlaceChips(place)
  const location = getPlaceLocation(place)
  const photoUrl = getPlacePhoto(place)

  return (
    <ActivityPlaceCard
      title={place.name || 'Saved place'}
      categoryLabel={chips.slice(0, 2).join(' / ')}
      location={location}
      chips={chips}
      photoUrl={photoUrl}
      placeSlug={placeSlug}
      photoAlt={place.name || 'Saved place'}
      compactMobile
      footer={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          disabled={isRemoving}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <TrashIcon className="h-4 w-4" />
          {isRemoving ? 'Removing...' : 'Remove'}
        </button>
      }
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
  const {
    session,
    isSessionLoading,
    isFavoritesLoading,
    favoritesError,
    favorites,
    removeFavorite,
    clearAllFavorites,
  } = useSavedFavorites()

  const savedPlaces = useMemo(
    () => favorites.filter((favorite) => Boolean(favorite.place)),
    [favorites]
  )

  const filteredSavedPlaces = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return savedPlaces.filter((favorite) => {
      const place = favorite.place as FavoritePlace
      const haystack = getPlaceSearchText(place)

      return !normalizedQuery || haystack.includes(normalizedQuery)
    })
  }, [savedPlaces, searchQuery])
  const visibleSavedPlaces = useMemo(
    () => filteredSavedPlaces.slice(0, visibleFavoritesCount),
    [filteredSavedPlaces, visibleFavoritesCount]
  )
  const hasMoreSavedPlaces = visibleSavedPlaces.length < filteredSavedPlaces.length

  const handleRemoveFavorite = async (favoriteId: string) => {
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

  const handleClearAll = () => {
    if (isClearingAll) {
      return
    }

    setIsClearAllDialogOpen(true)
  }

  const confirmClearAll = async () => {
    if (isClearingAll) {
      return
    }

    try {
      setIsClearingAll(true)
      setClearAllError('')
      await clearAllFavorites()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to clear favorites. Please try again.'
      setClearAllError(message)
    } finally {
      setIsClearingAll(false)
      setIsClearAllDialogOpen(false)
      setVisibleFavoritesCount(FAVORITES_LOAD_MORE_BATCH_SIZE)
    }
  }

  return (
    <PageShell reserveBottomNav={false}>
      <AppHeader showTaglishChip={false} />

      <main className={`favorites-page w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-8 ${BOTTOM_NAV_RESERVED_CLASS}`}>
        <PageContainer size="wide">
          <div className="mb-5">
            <MinimalBackNav to="/home" label="Home" preferHistory={false} />
          </div>

          <PageHeroHeader
            eyebrow="Favorites"
            title="Saved places"
            description="Your favorite gala spots, ready when you are."
            icon={<PinIcon />}
            badges={
              <>
                <span className="gala-count-pill">
                  {savedPlaces.length} saved place{savedPlaces.length === 1 ? '' : 's'}
                </span>
                  <span className="gala-count-pill">
                    {searchQuery.trim() ? `Filtering "${searchQuery.trim()}"` : 'Quick access'}
                  </span>
                </>
              }
              divider={false}
              className="pb-0"
            />

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
            <CardSurface pad="default" className="mt-6">
              <InlineSkeleton />
            </CardSurface>
          ) : null}

          {!isSessionLoading && !session?.user ? (
            <CardSurface pad="loose" className="mt-6">
              <h2 className="text-lg font-black text-slate-950">Sign in to view favorites</h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
                Your saved places are connected to your account.
              </p>
              <GoogleSignInButton className="mt-4" redirectTo={getPublicSiteUrl('/favorites')} />
            </CardSurface>
          ) : null}

          {!isSessionLoading && session?.user ? (
            <Stack gap="tight">
              <label className="relative block mt-2">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                  <SearchIcon className="h-5 w-5" />
                </span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search saved places"
                  className="gala-field px-12 text-base"
                />
              </label>

              {clearAllError ? (
                <p className="pt-1 text-sm font-medium text-red-600">{clearAllError}</p>
              ) : null}

              {isFavoritesLoading && savedPlaces.length === 0 ? (
                <ListingSkeleton count={4} className="pt-1" />
              ) : favoritesError ? (
                <p className="pt-1 text-sm font-medium text-red-600">{favoritesError}</p>
              ) : null}

              {savedPlaces.length === 0 && !isFavoritesLoading && !favoritesError ? (
                <EmptyState
                  title="Wala ka pang saved places."
                  description="Mag-search muna ng places para ma-save mo sila dito."
                  variant="plain"
                />
              ) : null}

              {savedPlaces.length > 0 && filteredSavedPlaces.length === 0 ? (
                <div className="flex items-center justify-center py-16 sm:py-24">
                  <p className="text-center text-sm font-black text-slate-950">No saved places match that search.</p>
                </div>
              ) : null}

              {filteredSavedPlaces.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="favorites-history-section-title text-lg font-black uppercase tracking-[0.2em] text-[var(--accent-deep)]">Saved</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <p className="text-xs font-semibold text-[var(--muted)] sm:text-right">
                        Showing {visibleSavedPlaces.length} of {filteredSavedPlaces.length} place{filteredSavedPlaces.length === 1 ? '' : 's'}
                      </p>
                      <button
                        type="button"
                        onClick={handleClearAll}
                        disabled={isClearingAll}
                        className="favorites-history-destructive-button inline-flex h-9 w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5 sm:self-end"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        {isClearingAll ? 'Removing...' : 'Remove all'}
                      </button>
                    </div>
                  </div>
                  <div className={FAVORITES_GRID_CLASSNAME}>
                    {visibleSavedPlaces.map((favorite) => (
                      <FavoriteCard
                        key={favorite.id}
                        favorite={favorite}
                        onRemove={() => void handleRemoveFavorite(favorite.place?.id || favorite.id)}
                        isRemoving={removingIds.has(favorite.place?.id || favorite.id)}
                      />
                    ))}
                  </div>
                  {hasMoreSavedPlaces ? (
                    <div className="flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => setVisibleFavoritesCount((current) => current + FAVORITES_LOAD_MORE_BATCH_SIZE)}
                        className="favorites-history-load-more-button inline-flex h-10 items-center justify-center rounded-lg border border-[var(--accent)] bg-white px-5 text-sm font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
                      >
                        Load more
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Stack>
          ) : null}
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default FavoritesPage
