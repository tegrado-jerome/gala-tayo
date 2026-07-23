import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import GoogleSignInButton from '../components/GoogleSignInButton'
import PageHeroHeader from '../components/PageHeroHeader'
import { PageContainer, PageShell, CardSurface, EmptyState, Stack } from '../components/layout/ResponsiveLayouts'
import { BOTTOM_NAV_RESERVED_CLASS } from '../components/layout/Primitives'
import ActivityPlaceCard from '../components/ActivityPlaceCard'
import DestructiveConfirmModal from '../components/DestructiveConfirmModal'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { useBottomNav } from '../context/BottomNavContext'
import { getSupabaseAccessToken } from '../supabase'
import { getPlacePhoto } from '../utils/placePhoto'
import { getApiUrl } from '../utils/apiClient'
import { getPublicSiteUrl } from '../utils/site'
import { HistorySkeleton } from '../components/loading/SkeletonStates'

const HISTORY_CACHE_PREFIX = 'galatayo:history:'
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000
const HISTORY_LOAD_MORE_BATCH_SIZE = 10
const HISTORY_GRID_CLASSNAME =
  'grid w-full grid-cols-1 items-start gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-4'

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

function clearHistoryCache(userId: string) {
  try {
    localStorage.removeItem(getHistoryCacheKey(userId))
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
  const photoUrl = getPlacePhoto(place)

  return (
    <ActivityPlaceCard
      title={place.name || 'Viewed place'}
      categoryLabel={chips.slice(0, 2).join(' / ')}
      location={location}
      chips={chips}
      photoUrl={photoUrl}
      placeSlug={placeSlug}
      photoAlt={place.name || 'Viewed place'}
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

function HistoryPage() {
  const { session, isSessionLoading } = useSavedFavorites()
  const currentUserId = session?.user?.id ?? null
  const cachedHistory = currentUserId ? readHistoryCache(currentUserId) : null
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [historyUserId, setHistoryUserId] = useState<string | null>(null)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(HISTORY_LOAD_MORE_BATCH_SIZE)
  const [isClearing, setIsClearing] = useState(false)
  const [isClearHistoryDialogOpen, setIsClearHistoryDialogOpen] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState('')

  const displayHistory = currentUserId && historyUserId === currentUserId ? history : cachedHistory?.length ? cachedHistory : null
  const { setHidden } = useBottomNav()

  useEffect(() => {
    setHidden(Boolean(currentUserId) && displayHistory === null && !errorMessage && isSessionLoading)
    return () => setHidden(false)
  }, [currentUserId, displayHistory, errorMessage, isSessionLoading, setHidden])

  useEffect(() => {
    if (!currentUserId) {
      setHistory(null)
      setHistoryUserId(null)
      setErrorMessage('')
      return
    }

    const controller = new AbortController()

    setHistory(null)
    setHistoryUserId(null)
    setIsHistoryLoading(true)
    setErrorMessage('')

    const loadHistory = async () => {
      try {
        const token = await getSupabaseAccessToken(session)

        if (!token) {
          throw new Error('Sign in to view your history.')
        }

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
        setHistoryUserId(currentUserId)
        writeHistoryCache(currentUserId, items)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          const cachedItems = readHistoryCache(currentUserId)
          if (cachedItems?.length) {
            setHistory(cachedItems)
            setHistoryUserId(currentUserId)
          } else {
            setErrorMessage(getHistoryErrorMessage(error, 'Unable to load history. Please try again.'))
          }
        }
      } finally {
        setIsHistoryLoading(false)
      }
    }

    void loadHistory()

    return () => controller.abort()
  }, [currentUserId, session])

  const visibleHistory = useMemo(
    () => (displayHistory || []).filter((item) => item.place?.slug),
    [displayHistory]
  )
  const visibleHistoryItems = useMemo(
    () => visibleHistory.slice(0, visibleHistoryCount),
    [visibleHistory, visibleHistoryCount]
  )
  const historySections = useMemo(() => {
    const grouped = new Map<string, HistoryItem[]>()

    visibleHistoryItems.forEach((item) => {
      const title = getHistorySectionTitle(item.created_at)
      grouped.set(title, [...(grouped.get(title) || []), item])
    })

    return ['Today', 'Yesterday', 'Earlier this week', 'Older']
      .map((title) => ({
        title,
        items: grouped.get(title) || [],
      }))
      .filter((section) => section.items.length > 0)
  }, [visibleHistoryItems])
  const hasMoreHistory = visibleHistoryItems.length < visibleHistory.length
  const canClearHistory = Boolean(currentUserId) && visibleHistory.length > 0
  const shouldShowBlankHistoryArea = Boolean(currentUserId) && !displayHistory && (isSessionLoading || (isHistoryLoading && !errorMessage))

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

      setHistoryUserId(currentUserId)
      setHistory((current) => {
        const nextHistory = current ?? displayHistory ?? []
        const nextItems = nextHistory.filter((item) => item.id !== itemId)

        if (currentUserId) {
          if (nextItems.length > 0) {
            writeHistoryCache(currentUserId, nextItems)
          } else {
            clearHistoryCache(currentUserId)
          }
        }

        return nextItems
      })
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
    if (!currentUserId || isClearing) {
      return
    }

    setIsClearHistoryDialogOpen(true)
  }

  const confirmClearHistory = async () => {
    if (!currentUserId || isClearing) {
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
      setHistoryUserId(currentUserId)
      setVisibleHistoryCount(HISTORY_LOAD_MORE_BATCH_SIZE)
      clearHistoryCache(currentUserId)
    } catch (error) {
      setErrorMessage(getHistoryErrorMessage(error, 'Unable to clear history. Please try again.'))
    } finally {
      setIsClearing(false)
      setIsClearHistoryDialogOpen(false)
    }
  }

  return (
    <PageShell reserveBottomNav={false}>
      <AppHeader showTaglishChip={false} />

      <main className={`history-page w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-8 ${BOTTOM_NAV_RESERVED_CLASS}`}>
        <PageContainer size="wide">
          <div className="mb-5">
            <MinimalBackNav to="/home" label="Home" preferHistory={false} />
          </div>

          <DestructiveConfirmModal
            isOpen={isClearHistoryDialogOpen}
            title="Clear all history?"
            description="This will remove every item from your recently viewed history. You can rebuild it by browsing again."
            confirmLabel="Clear history"
            isConfirming={isClearing}
            onCancel={() => setIsClearHistoryDialogOpen(false)}
            onConfirm={() => void confirmClearHistory()}
          />

          {!isSessionLoading && !currentUserId ? (
            <CardSurface pad="loose" className="mt-6">
              <h2 className="text-lg font-black text-slate-950">Please sign in to view your history.</h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
                Your recently viewed places are private to your account.
              </p>
              <GoogleSignInButton className="mt-4" redirectTo={getPublicSiteUrl('/history')} />
            </CardSurface>
          ) : null}

          {(currentUserId || isSessionLoading) && isHistoryLoading && !displayHistory && !errorMessage ? (
            <HistorySkeleton count={8} className="mt-6" />
          ) : null}

          {!shouldShowBlankHistoryArea && currentUserId && (displayHistory !== null || errorMessage) ? (
            <Stack gap="default">
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
                  </>
                }
                divider={false}
                className="pb-0"
              />

              {errorMessage ? (
                <p className="text-sm font-medium text-red-600">{errorMessage}</p>
              ) : null}

              {!errorMessage && displayHistory !== null && visibleHistory.length === 0 ? (
                <EmptyState
                  title="Wala ka pang viewed places."
                  description="Mag-explore ng places at lalabas sila dito."
                  variant="plain"
                />
              ) : null}

              {historySections.length > 0 ? (
                <Stack gap="loose">
                  {historySections.map((section) => (
                    <section key={section.title}>
                      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="favorites-history-section-title min-w-0 flex-1 text-lg font-black uppercase tracking-[0.2em] text-[var(--accent-deep)]">
                          {section.title}
                        </p>
                        {section.title === historySections[0]?.title && canClearHistory ? (
                          <button
                            type="button"
                            onClick={handleClearHistory}
                            disabled={isClearing}
                            className="favorites-history-destructive-button inline-flex h-9 w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5 sm:self-end"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            {isClearing ? 'Clearing...' : 'Clear history'}
                          </button>
                        ) : null}
                      </div>
                      <div className={`mt-3 sm:mt-4 ${HISTORY_GRID_CLASSNAME}`}>
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
                  {hasMoreHistory ? (
                    <div className="flex flex-col items-center gap-3 pt-1">
                      <p className="text-xs font-semibold text-[var(--muted)]">
                        Showing {visibleHistoryItems.length} of {visibleHistory.length} visits
                      </p>
                      <button
                        type="button"
                        onClick={() => setVisibleHistoryCount((current) => current + HISTORY_LOAD_MORE_BATCH_SIZE)}
                        className="favorites-history-load-more-button inline-flex h-10 items-center justify-center rounded-lg border border-[var(--accent)] bg-white px-5 text-sm font-black text-[var(--accent-deep)] transition hover:bg-[var(--accent-wash)]"
                      >
                        Load {HISTORY_LOAD_MORE_BATCH_SIZE} more
                      </button>
                    </div>
                  ) : null}
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
