import { useMemo, useState } from 'react'
import AppFooter from '../components/AppFooter'
import AppHeader from '../components/AppHeader'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { useSavedFavorites, type FavoritePlace } from '../context/SavedFavoritesContext'
import { getCuratedPlaceImages } from '../data/curatedPlaceImages'
import { getDirectionsUrl, openDirectionsUrl } from '../utils/directions'
import { navigateToPath, navigateToPlace } from '../utils/navigation'

function HeartIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z" />
    </svg>
  )
}

function PinIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  )
}

function StarIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z" />
    </svg>
  )
}

function ImageIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m7 17 3.3-3.4a1.4 1.4 0 0 1 2 0l1.1 1.1.8-.8a1.4 1.4 0 0 1 2 0L18 15.8" />
    </svg>
  )
}

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

function DirectionsIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M21 3 10 14" />
      <path d="m21 3-6 18-5-7-7-5 18-6Z" />
    </svg>
  )
}

function getPhotoUrl(place: FavoritePlace) {
  const curatedImages = getCuratedPlaceImages(place.slug || place.name || '')

  return (
    place.photo_url?.trim() ||
    place.photos?.find((photo) => photo?.trim())?.trim() ||
    curatedImages[0]?.trim() ||
    null
  )
}

function getPlaceCategory(place: FavoritePlace) {
  return place.category?.trim() || 'Place'
}

function getPlaceLocation(place: FavoritePlace) {
  const address = place.address?.trim() || ''
  const city = place.city?.trim() || ''
  const area = place.area?.trim() || ''

  if (address && city && !address.toLowerCase().includes(city.toLowerCase())) {
    return `${address}, ${city}`
  }

  return address || area || city || 'Location unavailable'
}

function openPlace(slug: string) {
  navigateToPlace(slug)
}

function FavoritesPage() {
  const [statusMessage, setStatusMessage] = useState('')
  const [removingSlug, setRemovingSlug] = useState('')
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

  const handleRemove = async (placeSlug: string) => {
    if (!session?.access_token || removingSlug) {
      return
    }

    try {
      setRemovingSlug(placeSlug)
      setStatusMessage('')

      const message = await removeFavorite(placeSlug)
      setStatusMessage(message)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to remove favorite.')
    } finally {
      setRemovingSlug('')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader showTaglishChip={false} />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <section className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/78 px-3 py-1 text-xs font-medium text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(28,77,160,0.06)]">
              <HeartIcon className="h-3.5 w-3.5" />
              Saved places
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Favorites
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              Places you saved for your next gala.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              navigateToPath('/')
            }}
            className="inline-flex w-fit items-center justify-center rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_8px_18px_rgba(28,77,160,0.08)] transition hover:-translate-y-[1px] hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            Back to search
          </button>
        </section>

        {isSessionLoading ? (
          <section className="rounded-lg border border-[var(--line)] bg-white px-4 py-5 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <p className="text-sm text-[var(--muted)]">Checking account...</p>
          </section>
        ) : null}

        {!isSessionLoading && !session?.user ? (
          <section className="rounded-lg border border-[var(--line)] bg-white px-5 py-6 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <h2 className="text-lg font-semibold text-slate-950">Sign in to view favorites</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
              Your saved places are connected to your account.
            </p>
            <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/favorites`} />
          </section>
        ) : null}

        {!isSessionLoading && session?.user ? (
          <>
            <div className="min-h-5">
              {isFavoritesLoading ? (
                <p className="text-sm text-[var(--accent-deep)]">Loading favorites...</p>
              ) : favoritesError ? (
                <p className="text-sm font-medium text-red-600">{favoritesError}</p>
              ) : statusMessage ? (
                <p className="text-sm text-[var(--muted)]">{statusMessage}</p>
              ) : null}
            </div>

            {!isFavoritesLoading && savedPlaces.length === 0 && !favoritesError ? (
              <section className="rounded-lg border border-dashed border-[var(--line-strong)] bg-white/82 px-5 py-8 text-center shadow-[0_14px_30px_rgba(28,77,160,0.06)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <HeartIcon className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">Wala ka pang saved places.</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
                  Mag-search muna ng places para ma-save mo sila dito.
                </p>
              </section>
            ) : null}

            {savedPlaces.length > 0 ? (
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {savedPlaces.map((favorite) => {
                  const place = favorite.place as FavoritePlace
                  const placeSlug = place.slug as string
                  const photoUrl = getPhotoUrl(place)
                  const placeCategory = getPlaceCategory(place)
                  const placeLocation = getPlaceLocation(place)
                  const directionsUrl = getDirectionsUrl(place)

                  return (
                    <article
                      key={favorite.id}
                      className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-[0_14px_30px_rgba(28,77,160,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(28,77,160,0.1)]"
                    >
                      <button
                        type="button"
                        onClick={() => openPlace(placeSlug)}
                        className="block w-full text-left"
                      >
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={place.name || 'Saved place'}
                            className="h-40 w-full border-b border-[var(--line)] object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-40 w-full flex-col items-center justify-center gap-2 border-b border-dashed border-[var(--line-strong)] bg-[linear-gradient(180deg,#fbfdff,#eef4fb)] px-4 text-center text-slate-500">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-white">
                              <ImageIcon />
                            </span>
                            <span className="line-clamp-2 max-w-full text-sm font-semibold text-slate-700">
                              {place.name || 'Saved place'}
                            </span>
                            <span className="text-xs font-medium">No photo</span>
                          </div>
                        )}

                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h2 className="truncate text-base font-semibold text-slate-950">
                                {place.name || 'Saved place'}
                              </h2>
                              <p className="mt-1 text-xs font-medium text-[var(--accent-deep)]">
                                {placeCategory}
                              </p>
                            </div>
                            {typeof place.rating === 'number' ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                                <StarIcon className="h-3.5 w-3.5" />
                                {place.rating}
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-3 flex items-start gap-1.5 text-sm text-[var(--muted)]">
                            <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2">{placeLocation}</span>
                          </p>
                        </div>
                      </button>

                      <div className="grid grid-cols-3 border-t border-[var(--line)]">
                        <button
                          type="button"
                          onClick={() => openPlace(placeSlug)}
                          className="px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-[var(--accent-deep)]"
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          onClick={() => openDirectionsUrl(directionsUrl)}
                          disabled={!directionsUrl}
                          className="inline-flex items-center justify-center gap-1.5 border-l border-[var(--line)] px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-[var(--accent-deep)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <DirectionsIcon className="h-3.5 w-3.5" />
                          Directions
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemove(placeSlug)}
                          disabled={removingSlug === placeSlug}
                          className="inline-flex items-center justify-center gap-1.5 border-l border-[var(--line)] px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {removingSlug === placeSlug ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
                          ) : (
                            <TrashIcon className="h-3.5 w-3.5" />
                          )}
                          Remove
                        </button>
                      </div>
                    </article>
                  )
                })}
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
