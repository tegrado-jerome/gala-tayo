import { useMemo, useState } from 'react'
import AppFooter from '../components/AppFooter'
import AppHeader from '../components/AppHeader'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { useSavedFavorites, type FavoritePlace, type FavoriteRow } from '../context/SavedFavoritesContext'
import { navigateToPath, navigateToPlace } from '../utils/navigation'
import { getPlacePhoto } from '../utils/placePhoto'
import favoritesActiveChibi from '../assets/chibis/features/favorites/chibi-favorites-active-state.webp'
import favoritesEmptyChibi from '../assets/chibis/features/favorites/chibi-favorites-empty-state.webp'

type IconProps = {
  className?: string
}

function BackIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
    </svg>
  )
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
      <img
        src={favoritesActiveChibi}
        alt=""
        className="gala-hero-asset max-h-[420px] w-[420px] max-w-none"
        loading="lazy"
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
  favorite: FavoriteRow
  removingPlaceId: string
  onRemove: (placeId: string) => void
}) {
  const place = favorite.place as FavoritePlace
  const placeId = place.id as string
  const placeSlug = place.slug as string
  const chips = getPlaceChips(place)
  const location = getPlaceLocation(place)
  const category = getPlaceCategory(place)
  const budgetLabel = place.budget_label?.trim() || 'Check details'
  const photoUrl = getPlacePhoto(place)

  return (
    <article className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(28,77,160,0.05)] transition hover:border-[var(--line-strong)] hover:shadow-[0_16px_34px_rgba(28,77,160,0.08)]">
      <div className="flex flex-col gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={place.name || 'Saved place'}
            className="h-[76px] w-[76px] shrink-0 rounded-lg border border-[var(--line)] object-cover lg:h-36 lg:w-full"
            loading="lazy"
          />
        ) : (
          <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--chip)] text-[var(--accent-deep)] lg:h-36 lg:w-full">
            <PinIcon className="h-8 w-8" />
          </div>
        )}

        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--muted)]">{chips.slice(0, 2).join(' / ')}</p>
          <h2 className="mt-1 text-lg font-black leading-tight text-slate-950 lg:text-xl">
            {place.name || 'Saved place'}
          </h2>
          <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-[var(--muted)]">
            <PinIcon className="h-4 w-4" />
            {location}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={`${favorite.id}-${chip}`}
                className="rounded-md border border-[var(--line)] bg-[var(--chip)] px-2 py-0.5 text-xs font-bold text-[var(--accent-deep)]"
              >
                {chip}
              </span>
            ))}
          </div>

          <p className="mt-4 text-sm text-slate-950">
            <span className="font-black">Budget:</span> {budgetLabel}
          </p>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-700">
            Saved {category.toLowerCase()} spot in {location}. Open the details for hours, budget notes, and planning info.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={() => navigateToPlace(placeSlug)}
          className="h-11 rounded-lg border border-[var(--accent)] bg-white px-4 text-sm font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
        >
          View Details
        </button>
        <button
          type="button"
          onClick={() => onRemove(placeId)}
          disabled={removingPlaceId === placeId}
          className="h-9 text-sm font-bold text-[var(--muted)] underline underline-offset-4 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {removingPlaceId === placeId ? 'Removing...' : 'Remove from saved'}
        </button>
      </div>
    </article>
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
    () => favorites.filter((favorite) => favorite.place?.slug),
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
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fbff,#edf4ff)] text-[var(--text)]">
      <AppHeader showTaglishChip={false} />

      <main className="mx-auto flex w-full max-w-[1480px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        <button
          type="button"
          onClick={() => navigateToPath('/search')}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-sm font-black text-slate-700 transition hover:text-[var(--accent-deep)]"
        >
          <BackIcon className="h-5 w-5" />
          Back
        </button>

        <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_420px] md:items-center">
          <div>
            <h1 className="text-[34px] font-black leading-tight text-slate-950 sm:text-[42px]">Saved places</h1>
            <p className="mt-3 max-w-xl text-lg font-semibold leading-relaxed text-slate-600">
              Your favorite gala spots, ready when you are.
            </p>
          </div>
          <SavedChibi />
        </section>

        {isSessionLoading ? (
          <section className="rounded-lg border border-[var(--line)] bg-white px-4 py-5 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <p className="text-sm text-[var(--muted)]">Checking account...</p>
          </section>
        ) : null}

        {!isSessionLoading && !session?.user ? (
          <section className="rounded-lg border border-[var(--line)] bg-white px-5 py-6 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <h2 className="text-lg font-black text-slate-950">Sign in to view favorites</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
              Your saved places are connected to your account.
            </p>
            <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/favorites`} />
          </section>
        ) : null}

        {!isSessionLoading && session?.user ? (
          <>
            <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="grid gap-2">
                <label className="relative block">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <SearchIcon className="h-5 w-5" />
                  </span>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search saved places"
                    className="h-12 w-full rounded-lg border border-[var(--line-strong)] bg-white px-12 text-base font-semibold text-slate-950 shadow-[0_10px_24px_rgba(28,77,160,0.04)] outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[rgba(47,116,232,0.14)]"
                  />
                </label>
              </div>
            </section>

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
              <section className="rounded-lg border border-dashed border-[var(--line-strong)] bg-white/82 px-5 py-8 text-center shadow-[0_14px_30px_rgba(28,77,160,0.06)]">
                <img src={favoritesEmptyChibi} alt="" className="mx-auto h-32 w-32 object-contain" loading="lazy" />
                <h2 className="mt-3 text-lg font-black text-slate-950">Wala ka pang saved places.</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
                  Mag-search muna ng places para ma-save mo sila dito.
                </p>
              </section>
            ) : null}

            {!isFavoritesLoading && savedPlaces.length > 0 && filteredSavedPlaces.length === 0 ? (
              <section className="rounded-lg border border-dashed border-[var(--line-strong)] bg-white/82 px-5 py-8 text-center shadow-[0_14px_30px_rgba(28,77,160,0.06)]">
                <p className="text-sm font-black text-slate-950">No saved places match that search.</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-3 rounded-lg border border-[var(--accent)] bg-white px-4 py-2 text-sm font-black text-[var(--accent-deep)]"
                >
                  Clear search
                </button>
              </section>
            ) : null}

            {filteredSavedPlaces.length > 0 ? (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredSavedPlaces.map((favorite) => (
                  <FavoriteCard
                    key={favorite.id}
                    favorite={favorite}
                    removingPlaceId={removingPlaceId}
                    onRemove={(placeId) => void handleRemove(placeId)}
                  />
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
      <AppFooter />
    </div>
  )
}

export default FavoritesPage
