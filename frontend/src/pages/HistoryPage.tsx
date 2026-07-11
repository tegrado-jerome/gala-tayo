import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import GoogleSignInButton from '../components/GoogleSignInButton'
import PageHeroHeader from '../components/PageHeroHeader'
import { PageContainer, PageShell, CardSurface, EmptyState, Stack, ChibiIllustration } from '../components/layout/ResponsiveLayouts'
import ActivityPlaceCard from '../components/ActivityPlaceCard'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { getSupabaseAccessToken } from '../supabase'
import { getPlacePhoto } from '../utils/placePhoto'
import { getApiUrl } from '../utils/apiClient'
import historyActiveChibi from '../assets/chibis/features/history/chibi-history-active-state.webp'

const HISTORY_CACHE_PREFIX = 'galatayo:history:'
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000

function getHistoryCacheKey(userId: string) {
  return `${HISTORY_CACHE_PREFIX}${userId}`
}

function readHistoryCache(userId: string): HistoryItem[] | null {
  try {
    const raw = localStorage.getItem(getHistoryCacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { items: HistoryItem[]; cachedAt: number } | null
    if (!parsed || typeof parsed.cachedAt !== 'number' || Date.now() - parsed.cachedAt > HISTORY_CACHE_TTL_MS) {
      if (parsed) localStorage.removeItem(getHistoryCacheKey(userId))
      return null
    }
    return parsed.items
  } catch {
    return null
  }
}

function writeHistoryCache(userId: string, items: HistoryItem[]) {
  try {
    localStorage.setItem(getHistoryCacheKey(userId), JSON.stringify({ items, cachedAt: Date.now() }))
  } catch {
    /* ignore */
  }
}

type HistoryPlace = {
  id: string
  slug: string | null
  name: string | null
  category?: string | null
  address?: string | null
  area?: string | null
  city?: string | null
  google_maps_url?: string | null
  latitude?: number | null
  longitude?: number | null
  description?: string | null
  budget_label?: string | null
  photo_url?: string | null
  photos?: string[] | null
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

function getHistoryErrorMessage(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage
  const normalizedMessage = message.trim().toLowerCase()

  if (
    normalizedMessage === 'missing or invalid authorization header.' ||
    normalizedMessage === 'missing authorization header.' ||
    normalizedMessage === 'invalid authorization header format.' ||
    normalizedMessage === 'invalid or expired token.'
  ) {
    return 'Sign in to view your history.'
  }

  return message
}

function getPlaceLocation(place: HistoryPlace) {
  const address = place.address?.trim() || ''
  const area = place.area?.trim() || ''
  const city = place.city?.trim() || ''

  if (address && city && !address.toLowerCase().includes(city.toLowerCase())) {
    return `${address}, ${city}`
  }

  return address || area || city || 'Location unavailable'
}

function ClockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.7l3 1.8" />
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

function getPlaceCategory(place: HistoryPlace) {
  return place.category?.trim() || 'Place'
}

function getPlaceChips(place: HistoryPlace) {
  const chips = [getPlaceCategory(place), place.area, place.city]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())

  return Array.from(new Set(chips)).slice(0, 3)
}

function HistoryChibi() {
  return (
    <div className="flex justify-center overflow-visible py-4 md:justify-end" aria-hidden="true">
      <ChibiIllustration
        src={historyActiveChibi}
        alt=""
        variant="feature"
        className="!w-[clamp(240px,74vw,380px)] !max-h-[320px] sm:!w-[clamp(170px,20vw,280px)] sm:!max-h-[240px]"
      />
    </div>
  )
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

function getHistorySectionTitle(value: string) {
  const viewedAt = parseSupabaseTimestamp(value)

  if (!viewedAt) {
    return 'Earlier'
  }

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (getManilaDateKey(viewedAt) === getManilaDateKey(now)) {
    return 'Today'
  }

  if (getManilaDateKey(viewedAt) === getManilaDateKey(yesterday)) {
    return 'Yesterday'
  }

  const elapsedDays = Math.floor((now.getTime() - viewedAt.getTime()) / 86400000)

  if (elapsedDays < 7) {
    return 'Earlier this week'
  }

  return 'Older'
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

function HistoryCard({
  item,
  onRemove,
  isRemoving,
}: {
  item: HistoryItem
  onRemove: () => void
  isRemoving: boolean
}) {
  const place = item.place as HistoryPlace
  const placeSlug = place.slug as string
  const location = getPlaceLocation(place)
  const chips = getPlaceChips(place)
  const budgetLabel = place.budget_label?.trim() || 'Check details'
  const photoUrl = getPlacePhoto(place)

  return (
    <ActivityPlaceCard
      title={place.name || 'Viewed place'}
      categoryLabel={chips.slice(0, 2).join(' / ')}
      location={location}
      chips={chips}
      budgetLabel={budgetLabel}
      description={place.description?.trim() || `Recently viewed ${getPlaceCategory(place).toLowerCase()} spot in ${location}.`}
      photoUrl={photoUrl}
      placeSlug={placeSlug}
      photoAlt={place.name || 'Viewed place'}
      compactMobile
      secondaryRows={[
        {
          icon: ClockIcon,
          label: formatViewedAt(item.created_at),
        },
      ]}
      footer={
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          disabled={isRemoving}
          className="inline-flex h-6 w-full items-center justify-center gap-1 rounded-md border border-red-200 bg-white text-[10px] font-black text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-7 sm:text-xs"
        >
          <TrashIcon className="h-3 w-3" />
          {isRemoving ? 'Removing...' : 'Remove'}
        </button>
      }
    />
  )
}

function HistoryPage() {
  const { session, isSessionLoading } = useSavedFavorites()
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    return session?.user?.id ? readHistoryCache(session.user.id) ?? [] : []
  })
  const [isClearing, setIsClearing] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!session?.user?.id) {
      setHistory([])
      setErrorMessage('')
      return
    }

    const controller = new AbortController()

    const loadHistory = async () => {
      try {
        const token = await getSupabaseAccessToken(session)

        if (!token) {
          throw new Error('Sign in to view your history.')
        }

        setErrorMessage('')

        const response = await fetch(getApiUrl('/history'), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        const data = (await response.json()) as HistoryResponse

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load history. Please try again.')
        }

        const items = data.history || []
        setHistory(items)
        writeHistoryCache(session.user.id, items)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setErrorMessage(getHistoryErrorMessage(error, 'Unable to load history. Please try again.'))
        }
      }
    }

    void loadHistory()

    return () => controller.abort()
  }, [session])

  const visibleHistory = useMemo(
    () => history.filter((item) => item.place?.slug),
    [history]
  )
  const historySections = useMemo(() => {
    const grouped = new Map<string, HistoryItem[]>()

    visibleHistory.forEach((item) => {
      const title = getHistorySectionTitle(item.created_at)
      grouped.set(title, [...(grouped.get(title) || []), item])
    })

    return ['Today', 'Yesterday', 'Earlier this week', 'Older']
      .map((title) => ({
        title,
        items: grouped.get(title) || [],
      }))
      .filter((section) => section.items.length > 0)
  }, [visibleHistory])
  const canClearHistory = Boolean(session?.user?.id) && visibleHistory.length > 0

  const handleDeleteHistoryItem = async (itemId: string) => {
    setDeletingIds((current) => new Set(current).add(itemId))

    try {
      const token = await getSupabaseAccessToken(session)

      if (!token) {
        throw new Error('Sign in to manage your history.')
      }

      const response = await fetch(getApiUrl(`/history/${encodeURIComponent(itemId)}`), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(data.message || 'Unable to delete history item.')
      }

      setHistory((current) => current.filter((item) => item.id !== itemId))
    } catch (error) {
      setErrorMessage(getHistoryErrorMessage(error, 'Unable to delete history item.'))
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleClearHistory = async () => {
    if (!session?.user?.id || isClearing) {
      return
    }

    const shouldClear = window.confirm('Clear all history?')

    if (!shouldClear) {
      return
    }

    try {
      const token = await getSupabaseAccessToken(session)

      if (!token) {
        throw new Error('Sign in to manage your history.')
      }

      setIsClearing(true)
      setErrorMessage('')

      const response = await fetch(getApiUrl('/history'), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(data.message || 'Unable to clear history. Please try again.')
      }

      setHistory([])
    } catch (error) {
      setErrorMessage(getHistoryErrorMessage(error, 'Unable to clear history. Please try again.'))
    } finally {
      setIsClearing(false)
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
            eyebrow="History"
            title="Recently viewed"
            description="Places you checked before, easy to revisit anytime."
            icon={<ClockIcon />}
            badges={
              <>
                <span className="gala-count-pill">
                  {visibleHistory.length} visit{visibleHistory.length === 1 ? '' : 's'}
                </span>
                <span className="gala-count-pill">
                  {historySections.length > 0 ? `${historySections.length} time section${historySections.length === 1 ? '' : 's'}` : 'Private to your account'}
                </span>
                {canClearHistory ? (
                  <button
                    type="button"
                    onClick={() => void handleClearHistory()}
                    disabled={isClearing}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    {isClearing ? 'Clearing...' : 'Clear history'}
                  </button>
                ) : null}
              </>
            }
            aside={<HistoryChibi />}
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
              <h2 className="text-lg font-black text-slate-950">Please sign in to view your history.</h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
                Your recently viewed places are private to your account.
              </p>
              <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/history`} />
            </CardSurface>
          ) : null}

          {!isSessionLoading && session?.user ? (
            <Stack gap="default">
              {errorMessage ? (
                <p className="text-sm font-medium text-red-600">{errorMessage}</p>
              ) : null}

              {!errorMessage && visibleHistory.length === 0 ? (
                <EmptyState
                  title="No viewed places yet."
                  description="Start exploring places and they'll appear here."
                  variant="plain"
                />
              ) : null}

              {historySections.length > 0 ? (
                <Stack gap="loose">
                  {historySections.map((section) => (
                    <section key={section.title}>
                      <div className="mb-3 flex items-center gap-3">
                        <h2 className="shrink-0 text-base font-black text-slate-950 lg:text-lg">{section.title}</h2>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2.5 sm:gap-4 xl:justify-start xl:[grid-template-columns:repeat(auto-fill,minmax(340px,340px))]">
                        {section.items.map((item) => (
                          <HistoryCard
                            key={item.id}
                            item={item}
                            onRemove={() => void handleDeleteHistoryItem(item.id)}
                            isRemoving={deletingIds.has(item.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                  <CardSurface pad="default" tone="soft" className="text-sm font-semibold text-slate-700">
                    <span className="font-black text-[var(--accent-deep)]">Tip:</span> Places you view will appear here for easy access. Save the ones you love to keep them in Favorites.
                  </CardSurface>
                </Stack>
              ) : null}
            </Stack>
          ) : null}
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default HistoryPage
