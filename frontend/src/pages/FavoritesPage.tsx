import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import GoogleSignInButton from '../components/GoogleSignInButton'
import PageHeroHeader from '../components/PageHeroHeader'
import { PageContainer, PageShell, CardSurface, EmptyState, Stack, ChibiIllustration } from '../components/layout/ResponsiveLayouts'
import ActivityPlaceCard from '../components/ActivityPlaceCard'
import { useSavedFavorites, type FavoritePlace } from '../context/SavedFavoritesContext'
import { getPlacePhoto } from '../utils/placePhoto'
import favoritesActiveChibi from '../assets/chibis/features/favorites/chibi-favorites-active-state.webp'

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

function SavedChibi() {
  return (
    <div className="flex justify-center" aria-hidden="true">
      <ChibiIllustration
        src={favoritesActiveChibi}
        alt=""
        variant="feature"
        className="!w-[clamp(240px,74vw,380px)] !max-h-[320px] sm:!w-[clamp(170px,20vw,280px)] sm:!max-h-[240px]"
      />
    </div>
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

  return Array.from(new Set(chips)).slice(0, 4)
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
  removingPlaceId,
  onRemove,
}: {
  favorite: { id: string; place: FavoritePlace | null }
  removingPlaceId: string
  onRemove: (placeId: string) => void
}) {
  const place = favorite.place as FavoritePlace
  const placeId = place.id as string
  const placeSlug = place.slug?.trim() || placeId
  const chips = getPlaceChips(place)
  const location = getPlaceLocation(place)
  const category = getPlaceCategory(place)
  const budgetLabel = place.budget_label?.trim() || 'Check details'
  const photoUrl = getPlacePhoto(place)

  return (
    <ActivityPlaceCard
      title={place.name || 'Saved place'}
      categoryLabel={chips.slice(0, 2).join(' / ')}
      location={location}
      chips={chips}
      budgetLabel={budgetLabel}
      description={`Saved ${category.toLowerCase()} spot in ${location}. Open the details for hours, budget notes, and planning info.`}
      photoUrl={photoUrl}
      placeSlug={placeSlug}
      photoAlt={place.name || 'Saved place'}
      compactMobile
      footer={(
        <button
          type="button"
          onClick={() => onRemove(placeId)}
          disabled={removingPlaceId === placeId}
          className="h-8 text-[11px] font-bold text-[var(--muted)] underline underline-offset-4 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {removingPlaceId === placeId ? 'Removing...' : 'Remove from saved'}
        </button>
      )}
    />
  )
}

function FavoritesPage() {
  const [statusMessage, setStatusMessage] = useState('')
  const [removingPlaceId, setRemovingPlaceId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const {
    session,
    isSessionLoading,
    isFavoritesLoading,
    favoritesError,
    favorites,
    removeFavorite,
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

  const handleRemove = async (placeId: string) => {
    if (!session?.access_token || removingPlaceId) {
      return
    }

    try {
      setRemovingPlaceId(placeId)
      setStatusMessage('')

      const place = favorites.find((favorite) => favorite.place?.id === placeId)?.place
      const message = await removeFavorite(placeId, place?.slug)
      setStatusMessage(message)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to remove favorite.')
    } finally {
      setRemovingPlaceId('')
    }
  }

  return (
    <PageShell>
      <AppHeader showTaglishChip={false} />

      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-8">
        <PageContainer size="wide">
          <div className="mb-5">
            <MinimalBackNav to="/" label="Home" preferHistory={false} />
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
            aside={<SavedChibi />}
            divider={false}
            className="pb-0"
          />

          {isSessionLoading ? (
            <CardSurface pad="default" className="mt-6">
              <p className="text-sm text-[var(--muted)]">Checking account...</p>
            </CardSurface>
          ) : null}

          {!isSessionLoading && !session?.user ? (
            <CardSurface pad="loose" className="mt-6">
              <h2 className="text-lg font-black text-slate-950">Sign in to view favorites</h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
                Your saved places are connected to your account.
              </p>
              <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/favorites`} />
            </CardSurface>
          ) : null}

          {!isSessionLoading && session?.user ? (
            <Stack gap="default">
              <label className="relative block">
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

              <div className="min-h-5">
                {isFavoritesLoading ? (
                  <p className="text-sm font-semibold text-[var(--accent-deep)]">Loading favorites...</p>
                ) : favoritesError ? (
                  <p className="text-sm font-medium text-red-600">{favoritesError}</p>
                ) : statusMessage ? (
                  <p className="text-sm text-[var(--muted)]">{statusMessage}</p>
                ) : null}
              </div>

              {!isFavoritesLoading && savedPlaces.length === 0 && !favoritesError ? (
                <EmptyState
                  title="Wala ka pang saved places."
                  description="Mag-search muna ng places para ma-save mo sila dito."
                  variant="plain"
                />
              ) : null}

              {!isFavoritesLoading && savedPlaces.length > 0 && filteredSavedPlaces.length === 0 ? (
                <CardSurface tone="outlined" pad="loose" className="text-center">
                  <p className="text-sm font-black text-slate-950">No saved places match that search.</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-[var(--accent)] bg-white px-4 py-2 text-sm font-black text-[var(--accent-deep)]"
                  >
                    Clear search
                  </button>
                </CardSurface>
              ) : null}

              {filteredSavedPlaces.length > 0 ? (
                <div className="grid w-full grid-cols-2 gap-2.5 sm:gap-4 xl:justify-start xl:[grid-template-columns:repeat(auto-fill,minmax(340px,340px))]">
                  {filteredSavedPlaces.map((favorite) => (
                    <FavoriteCard
                      key={favorite.id}
                      favorite={favorite}
                      removingPlaceId={removingPlaceId}
                      onRemove={(placeId) => void handleRemove(placeId)}
                    />
                  ))}
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
