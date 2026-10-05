import { useEffect, useMemo, useState } from 'react'
import { MapPin } from '@phosphor-icons/react/dist/csr/MapPin'
import { Trash as Trash2 } from '@phosphor-icons/react/dist/csr/Trash'
import { X } from '@phosphor-icons/react/dist/csr/X'
import GoogleSignInButton from '../components/GoogleSignInButton'
import DestructiveConfirmModal from '../components/DestructiveConfirmModal'
import InternalLink from '../components/InternalLink'
import { Button, Empty, Page, Skeleton } from '../components/ui'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { useBottomNav } from '../context/BottomNavContext'
import { getSupabaseAccessToken } from '../supabase'
import { getPlacePhoto } from '../utils/placePhoto'
import { getApiUrl } from '../utils/apiClient'
import { getPublicSiteUrl } from '../utils/site'

const HISTORY_CACHE_PREFIX = 'galatayo:history:'
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000
const HISTORY_LOAD_MORE_BATCH_SIZE = 10

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

function getPlaceMeta(place: HistoryPlace) {
  const parts = [place.category?.trim(), place.area?.trim() || place.city?.trim()].filter(Boolean)
  return Array.from(new Set(parts)).join(' · ')
}

function formatViewedTime(value: string) {
  const viewedAt = parseSupabaseTimestamp(value)
  return viewedAt ? viewedAt.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : ''
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

function getHistoryDay(value: string) {
  const viewedAt = parseSupabaseTimestamp(value)
  if (!viewedAt) return { key: 'earlier', title: 'Earlier' }

  const key = getManilaDateKey(viewedAt)
  const now = new Date()
  const yesterday = new Date(now.getTime() - 86400000)
  if (key === getManilaDateKey(now)) return { key, title: 'Today' }
  if (key === getManilaDateKey(yesterday)) return { key, title: 'Yesterday' }
  const sameYear = key.slice(0, 4) === getManilaDateKey(now).slice(0, 4)
  return {
    key,
    title: viewedAt.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric', timeZone: 'Asia/Manila' }),
  }
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
    const grouped = new Map<string, { title: string; items: HistoryItem[] }>()
    visibleHistoryItems.forEach((item) => {
      const day = getHistoryDay(item.created_at)
      const section = grouped.get(day.key) ?? { title: day.title, items: [] }
      section.items.push(item)
      grouped.set(day.key, section)
    })
    return Array.from(grouped.values())
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
    <Page>
      <header>
        <h1 className="g-h1">History</h1>
        <p className="g-mut mt-2">Places you opened recently, easy to revisit.</p>
      </header>

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
        <Empty
          title="Sign in to see your history."
          description="Your recently viewed places are private to your account."
          action={<GoogleSignInButton redirectTo={getPublicSiteUrl('/history')} />}
        />
      ) : null}

      {(currentUserId || isSessionLoading) && isHistoryLoading && !displayHistory && !errorMessage ? (
        <div className="mt-6 grid gap-2" aria-label="Loading history">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : null}

      {!shouldShowBlankHistoryArea && currentUserId && (displayHistory !== null || errorMessage) ? (
        <div className="mt-4 flex min-w-0 flex-col gap-4">
          {errorMessage ? (
            <p role="alert" className="g-sm" style={{ color: 'var(--bad)' }}>
              {errorMessage}
            </p>
          ) : null}

          {!errorMessage && displayHistory !== null && visibleHistory.length === 0 ? (
            <Empty
              title="Wala ka pang viewed places."
              description="Places you open show up here."
              action={<Button variant="ink" href="/search">Explore places</Button>}
            />
          ) : null}

          {historySections.map((section, index) => (
            <section key={section.title} aria-labelledby={`history-${index}`}>
              <div className="mb-3 mt-2 flex min-h-[44px] items-center justify-between gap-3">
                <h2 id={`history-${index}`} className="g-h3">
                  {section.title}
                </h2>
                {index === 0 && canClearHistory ? (
                  <Button variant="text" size="sm" onClick={() => void handleClearHistory()} disabled={isClearing}>
                    <Trash2 aria-hidden="true" />
                    {isClearing ? 'Clearing...' : 'Clear history'}
                  </Button>
                ) : null}
              </div>
              <div className="g-group">
                {section.items.map((item) => {
                  const place = item.place as HistoryPlace
                  const name = place.name || 'Viewed place'
                  const meta = [getPlaceMeta(place), formatViewedTime(item.created_at)].filter(Boolean).join(' · ')
                  const photo = getPlacePhoto(place)
                  return (
                    <div key={item.id} className="flex min-w-0 items-center gap-1 pr-2">
                      <InternalLink href={`/places/${encodeURIComponent(place.slug as string)}`} className="g-group-row min-w-0 flex-1 py-2 pr-1">
                        {photo ? (
                          <img src={photo} alt="" loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-[var(--r-2)] object-cover" />
                        ) : (
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--r-2)]" style={{ background: 'var(--sea-soft)', color: 'var(--sea)' }}>
                            <MapPin className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="g-h3 block truncate">{name}</span>
                          {meta ? <span className="g-sm g-mut block truncate">{meta}</span> : null}
                        </span>
                      </InternalLink>
                      <Button
                        variant="text"
                        size="sm"
                        iconOnly
                        className="shrink-0"
                        aria-label={`Remove ${name} from history`}
                        disabled={deletingIds.has(item.id)}
                        onClick={() => void handleDeleteHistoryItem(item.id)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {hasMoreHistory ? (
            <div className="flex flex-col items-center gap-3">
              <p className="g-xs g-mut">
                Showing {visibleHistoryItems.length} of {visibleHistory.length} visits
              </p>
              <Button variant="line" onClick={() => setVisibleHistoryCount((current) => current + HISTORY_LOAD_MORE_BATCH_SIZE)}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Page>
  )
}

export default HistoryPage
