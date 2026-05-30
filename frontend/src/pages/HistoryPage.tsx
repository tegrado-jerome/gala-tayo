import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { getCuratedPlaceImages } from '../data/curatedPlaceImages'

type HistoryPlace = {
  id: string
  slug: string | null
  name: string | null
  category?: string | null
  city?: string | null
  address?: string | null
  photo_url?: string | null
  photos?: string[] | null
  image_url?: string | null
  curated_image_urls?: string[] | null
}

type HistoryItem = {
  id: string
  type: string
  query?: string | null
  place_id?: string | null
  created_at: string
  place: HistoryPlace | null
}

type HistoryResponse = {
  history?: HistoryItem[]
  message?: string
}

function ClockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.7l3 1.8" />
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

function ImageIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m7 17 3.3-3.4a1.4 1.4 0 0 1 2 0l1.1 1.1.8-.8a1.4 1.4 0 0 1 2 0L18 15.8" />
    </svg>
  )
}

function getApiEndpoint(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

function getPhotoUrl(place: HistoryPlace) {
  const curatedImages = getCuratedPlaceImages(place.slug || place.name || '')

  return (
    place.photo_url?.trim() ||
    place.image_url?.trim() ||
    place.photos?.find((photo) => photo?.trim())?.trim() ||
    place.curated_image_urls?.find((photo) => photo?.trim())?.trim() ||
    curatedImages[0]?.trim() ||
    null
  )
}

function getPlaceLocation(place: HistoryPlace) {
  const address = place.address?.trim() || ''
  const city = place.city?.trim() || ''

  if (address && city && !address.toLowerCase().includes(city.toLowerCase())) {
    return `${address}, ${city}`
  }

  return address || city || 'Location unavailable'
}

function parseSupabaseTimestamp(value: string) {
  const trimmedValue = value.trim()
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmedValue)
  const normalizedValue = hasTimezone ? trimmedValue : `${trimmedValue}Z`
  const parsedDate = new Date(normalizedValue)

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

function getManilaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

function getManilaYear(date: Date) {
  return new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
  }).format(date)
}

function formatViewedAt(value: string) {
  const viewedAt = parseSupabaseTimestamp(value)

  if (!viewedAt) {
    return 'Viewed recently'
  }

  const now = new Date()
  const elapsedSeconds = Math.max(0, Math.round((now.getTime() - viewedAt.getTime()) / 1000))

  if (elapsedSeconds < 60) {
    return 'Viewed just now'
  }

  if (elapsedSeconds < 3600) {
    const minutes = Math.max(1, Math.round(elapsedSeconds / 60))
    return `Viewed ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }

  if (elapsedSeconds < 86400) {
    const hours = Math.max(1, Math.round(elapsedSeconds / 3600))
    return `Viewed ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (getManilaDateKey(viewedAt) === getManilaDateKey(yesterday)) {
    return 'Viewed yesterday'
  }

  return `Viewed ${viewedAt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
    year: getManilaYear(viewedAt) === getManilaYear(now) ? undefined : 'numeric',
  })}`
}

function openPlace(slug: string) {
  window.history.pushState(null, '', `/places/${encodeURIComponent(slug)}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function HistoryPage() {
  const { session, isSessionLoading } = useSavedFavorites()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!session?.access_token) {
      setHistory([])
      setIsLoading(false)
      setErrorMessage('')
      return undefined
    }

    const controller = new AbortController()

    const loadHistory = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')

        const response = await fetch(getApiEndpoint('/history'), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        })

        const data = (await response.json()) as HistoryResponse

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load history. Please try again.')
        }

        setHistory(data.history || [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load history. Please try again.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadHistory()

    return () => controller.abort()
  }, [session?.access_token])

  const visibleHistory = useMemo(
    () => history.filter((item) => item.place?.slug),
    [history]
  )
  const canClearHistory = Boolean(session?.access_token) && visibleHistory.length > 0

  const handleClearHistory = async () => {
    if (!session?.access_token || isClearing) {
      return
    }

    const shouldClear = window.confirm('Clear all history?')

    if (!shouldClear) {
      return
    }

    try {
      setIsClearing(true)
      setErrorMessage('')

      const response = await fetch(getApiEndpoint('/history'), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const data = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(data.message || 'Unable to clear history. Please try again.')
      }

      setHistory([])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to clear history. Please try again.')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader showTaglishChip={false} />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <section className="flex flex-col gap-3 border-b border-[var(--line)] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/78 px-3 py-1 text-xs font-medium text-[var(--accent-deep)] shadow-[0_8px_18px_rgba(28,77,160,0.06)]">
              <ClockIcon className="h-3.5 w-3.5" />
              Recently viewed
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              History
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
              Places you opened recently.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canClearHistory ? (
              <button
                type="button"
                onClick={() => void handleClearHistory()}
                disabled={isClearing}
                className="inline-flex w-fit items-center justify-center rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow-[0_8px_18px_rgba(28,77,160,0.08)] transition hover:-translate-y-[1px] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isClearing ? 'Clearing...' : 'Clear history'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                window.history.pushState(null, '', '/')
                window.dispatchEvent(new PopStateEvent('popstate'))
              }}
              className="inline-flex w-fit items-center justify-center rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_8px_18px_rgba(28,77,160,0.08)] transition hover:-translate-y-[1px] hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
            >
              Back to search
            </button>
          </div>
        </section>

        {isSessionLoading ? (
          <section className="rounded-lg border border-[var(--line)] bg-white px-4 py-5 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <p className="text-sm text-[var(--muted)]">Checking account...</p>
          </section>
        ) : null}

        {!isSessionLoading && !session?.user ? (
          <section className="rounded-lg border border-[var(--line)] bg-white px-5 py-6 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <h2 className="text-lg font-semibold text-slate-950">Please sign in to view your history.</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
              Your recently viewed places are private to your account.
            </p>
            <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/history`} />
          </section>
        ) : null}

        {!isSessionLoading && session?.user ? (
          <>
            <div className="min-h-5">
              {isLoading ? (
                <p className="text-sm text-[var(--accent-deep)]">Loading your history...</p>
              ) : errorMessage ? (
                <p className="text-sm font-medium text-red-600">{errorMessage}</p>
              ) : null}
            </div>

            {!isLoading && !errorMessage && visibleHistory.length === 0 ? (
              <section className="rounded-lg border border-dashed border-[var(--line-strong)] bg-white/82 px-5 py-8 text-center shadow-[0_14px_30px_rgba(28,77,160,0.06)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent-deep)]">
                  <ClockIcon className="h-5 w-5" />
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-950">No viewed places yet.</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
                  Start exploring places and they&apos;ll appear here.
                </p>
              </section>
            ) : null}

            {visibleHistory.length > 0 ? (
              <section className="grid gap-3">
                {visibleHistory.map((item) => {
                  const place = item.place as HistoryPlace
                  const placeSlug = place.slug as string
                  const photoUrl = getPhotoUrl(place)
                  const location = getPlaceLocation(place)

                  return (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-[0_14px_30px_rgba(28,77,160,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_40px_rgba(28,77,160,0.1)]"
                    >
                      <button
                        type="button"
                        onClick={() => openPlace(placeSlug)}
                        className="flex w-full items-stretch gap-3 p-3 text-left sm:gap-4 sm:p-4"
                      >
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={place.name || 'Viewed place'}
                            className="h-[88px] w-[88px] shrink-0 rounded-lg border border-[var(--line)] object-cover sm:h-[108px] sm:w-[132px]"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--line-strong)] bg-[linear-gradient(180deg,#fbfdff,#eef4fb)] text-center text-slate-500 sm:h-[108px] sm:w-[132px]">
                            <ImageIcon />
                            <span className="px-2 text-[10px] font-medium">No photo</span>
                          </div>
                        )}

                        <div className="min-w-0 flex-1 py-0.5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <h2 className="truncate text-base font-semibold text-slate-950">
                                {place.name || 'Viewed place'}
                              </h2>
                              <p className="mt-1 flex items-start gap-1.5 text-sm text-[var(--muted)]">
                                <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span className="line-clamp-2">{location}</span>
                              </p>
                            </div>
                            <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-[var(--accent-wash)] px-2 py-1 text-xs font-medium text-[var(--accent-deep)]">
                              <ClockIcon className="h-3.5 w-3.5" />
                              {formatViewedAt(item.created_at)}
                            </span>
                          </div>

                          <p className="mt-3 text-xs font-semibold text-[var(--accent-deep)]">
                            View details
                          </p>
                        </div>
                      </button>
                    </article>
                  )
                })}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  )
}

export default HistoryPage
