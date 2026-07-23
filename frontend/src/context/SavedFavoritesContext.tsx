import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseAccessToken, shouldPropagateSessionChange, supabase } from '../supabase'
import { getApiUrl } from '../utils/apiClient'
import { trackFavoriteAdded } from '../utils/analytics'

type FavoritePlace = {
  id: string
  name: string | null
  slug: string | null
  category?: string | null
  address?: string | null
  city?: string | null
  area?: string | null
  budget_label?: string | null
  budget_min?: number | null
  budget_max?: number | null
  budget_notes?: string | null
  is_free?: boolean | null
  google_maps_url?: string | null
  latitude?: number | null
  longitude?: number | null
  rating?: number | null
  photo_url?: string | null
  photos?: string[] | null
}

type FavoriteRow = {
  id: string
  created_at: string
  place: FavoritePlace | null
}

type SaveFavoriteResult = {
  status: 'saved' | 'already-saved' | 'guest'
  message: string
}

type SavedFavoritesContextValue = {
  session: Session | null
  isSessionLoading: boolean
  isFavoritesLoading: boolean
  favoritesError: string
  favorites: FavoriteRow[]
  savedPlaceKeys: Set<string>
  isPlaceSaved: (placeSlugOrId?: string | null) => boolean
  saveFavorite: (placeId: string, placeSlug?: string | null) => Promise<SaveFavoriteResult>
  removeFavorite: (placeId: string, placeSlug?: string | null) => Promise<string>
  clearAllFavorites: () => Promise<string>
}

type FavoritesResponse = {
  favorites?: FavoriteRow[]
  favorite?: {
    id: string
    created_at: string
  }
  place?: FavoritePlace
  message?: string
}

type FavoritesResumeCache = {
  favorites: FavoriteRow[]
  cachedAt: number
}

const SavedFavoritesContext = createContext<SavedFavoritesContextValue | null>(null)
const FAVORITES_RESUME_CACHE_PREFIX = 'galatayo:favorites:'
const FAVORITES_RESUME_CACHE_TTL_MS = 30 * 60 * 1000



function getFavoritesResumeCacheKey(userId: string) {
  return `${FAVORITES_RESUME_CACHE_PREFIX}${userId}`
}

function readFavoritesResumeCache(userId: string): FavoriteRow[] | null {
  try {
    const rawCache = window.localStorage.getItem(getFavoritesResumeCacheKey(userId))

    if (!rawCache) {
      return null
    }

    const parsedCache = JSON.parse(rawCache) as Partial<FavoritesResumeCache>
    if (
      typeof parsedCache.cachedAt !== 'number' ||
      !Number.isFinite(parsedCache.cachedAt) ||
      Date.now() - parsedCache.cachedAt > FAVORITES_RESUME_CACHE_TTL_MS ||
      !Array.isArray(parsedCache.favorites)
    ) {
      window.localStorage.removeItem(getFavoritesResumeCacheKey(userId))
      return null
    }

    return dedupeFavoritesBySlug(parsedCache.favorites)
  } catch {
    return null
  }
}

function writeFavoritesResumeCache(userId: string, favorites: FavoriteRow[]) {
  try {
    window.localStorage.setItem(
      getFavoritesResumeCacheKey(userId),
      JSON.stringify({
        favorites,
        cachedAt: Date.now(),
      } satisfies FavoritesResumeCache)
    )
  } catch {
    // localStorage may be unavailable, ignore
  }
}

function clearFavoritesResumeCache(userId: string) {
  try {
    window.localStorage.removeItem(getFavoritesResumeCacheKey(userId))
  } catch {
    // localStorage may be unavailable, ignore
  }
}

function normalizeKnownPlaceKey(placeSlugOrId: string) {
  return placeSlugOrId.trim().toLowerCase()
}

function dedupeFavoritesBySlug(favorites: FavoriteRow[]) {
  const seenKeys = new Set<string>()

  return favorites.filter((favorite) => {
    const slug = favorite.place?.slug?.trim()
    const id = favorite.place?.id?.trim()
    const key = slug || id

    if (!key) {
      return false
    }

    const normalizedKey = normalizeKnownPlaceKey(key)

    if (seenKeys.has(normalizedKey)) {
      return false
    }

    seenKeys.add(normalizedKey)
    return true
  })
}

function getSavedPlaceKeys(favorites: FavoriteRow[]) {
  return new Set(
    favorites
      .flatMap((favorite) => [favorite.place?.slug, favorite.place?.id])
      .filter((slugOrId): slugOrId is string => Boolean(slugOrId?.trim()))
      .map(normalizeKnownPlaceKey)
  )
}

function SavedFavoritesProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false)
  const [favoritesError, setFavoritesError] = useState('')
  const [favorites, setFavorites] = useState<FavoriteRow[]>([])
  const [savedPlaceKeys, setSavedPlaceKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsSessionLoading(false)
      }
    }).catch(() => {
      if (isMounted) {
        setIsSessionLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setIsSessionLoading(false)
      setSession((currentSession) =>
        shouldPropagateSessionChange(event, currentSession, nextSession) ? nextSession : currentSession
      )
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user?.id) {
      setFavorites([])
      setSavedPlaceKeys(new Set())
      setFavoritesError('')
      return undefined
    }

    setIsFavoritesLoading(true)
    setFavoritesError('')

    const cachedFavorites = readFavoritesResumeCache(session.user.id)
    if (cachedFavorites) {
      setFavorites(cachedFavorites)
      setSavedPlaceKeys(getSavedPlaceKeys(cachedFavorites))
      setIsFavoritesLoading(false)
    }

    const controller = new AbortController()

    const loadFavorites = async () => {
      try {
        const token = await getSupabaseAccessToken(session)

        if (!token) {
          throw new Error('Sign in is required.')
        }

        setFavoritesError('')

        const response = await fetch(getApiUrl('/favorites'), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        const data = (await response.json()) as FavoritesResponse

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load favorites.')
        }

        const nextFavorites = dedupeFavoritesBySlug(data.favorites || [])
        setFavorites(nextFavorites)
        setSavedPlaceKeys(getSavedPlaceKeys(nextFavorites))
        writeFavoritesResumeCache(session.user.id, nextFavorites)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          const message = error instanceof Error ? error.message : 'Failed to load favorites.'
          setFavoritesError(message)
          console.warn('Favorites state unavailable:', message)
        }
      } finally {
        setIsFavoritesLoading(false)
      }
    }

    void loadFavorites()

    return () => controller.abort()
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) {
      return
    }

    writeFavoritesResumeCache(session.user.id, favorites)
  }, [favorites, session?.user?.id])

  const value = useMemo<SavedFavoritesContextValue>(() => {
    const isPlaceSaved = (placeSlugOrId?: string | null) => {
      if (!placeSlugOrId) {
        return false
      }

      return savedPlaceKeys.has(normalizeKnownPlaceKey(placeSlugOrId))
    }

    const saveFavorite = async (placeId: string, placeSlug?: string | null): Promise<SaveFavoriteResult> => {
      const normalizedPlaceId = normalizeKnownPlaceKey(placeId)
      const normalizedPlaceSlug = placeSlug?.trim().toLowerCase() || ''

      const token = await getSupabaseAccessToken(session)

      if (!token) {
        return {
          status: 'guest',
          message: 'Sign in to save favorites.',
        }
      }

      if (savedPlaceKeys.has(normalizedPlaceId)) {
        return {
          status: 'already-saved',
          message: 'Place already saved to favorites.',
        }
      }

      setSavedPlaceKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys)
        nextKeys.add(normalizedPlaceId)
        if (normalizedPlaceSlug) {
          nextKeys.add(normalizedPlaceSlug)
        }
        return nextKeys
      })

      try {
        const response = await fetch(getApiUrl('/favorites'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            placeId: normalizedPlaceId,
            placeSlug: normalizedPlaceSlug || undefined,
          }),
        })

        const data = (await response.json()) as FavoritesResponse

        if (!response.ok) {
          throw new Error(data.message || 'Failed to save favorite.')
        }

        setSavedPlaceKeys((currentKeys) => {
          const nextKeys = new Set(currentKeys)
          nextKeys.add(normalizedPlaceId)
          if (normalizedPlaceSlug) {
            nextKeys.add(normalizedPlaceSlug)
          }
          if (data.place?.id) {
            nextKeys.add(normalizeKnownPlaceKey(data.place.id))
          }
          if (data.place?.slug) {
            nextKeys.add(normalizeKnownPlaceKey(data.place.slug))
          }
          return nextKeys
        })

        if (data.favorites) {
          const nextFavorites = dedupeFavoritesBySlug(data.favorites)
          setFavorites(nextFavorites)
          setSavedPlaceKeys(getSavedPlaceKeys(nextFavorites))
          if (session?.user?.id) {
            writeFavoritesResumeCache(session.user.id, nextFavorites)
          }
        } else if (data.place) {
          setFavorites((currentFavorites) => {
            if (currentFavorites.some((favorite) => favorite.place?.id && normalizeKnownPlaceKey(favorite.place.id) === normalizedPlaceId)) {
              return currentFavorites
            }

            const nextFavorites = dedupeFavoritesBySlug([
              {
                id: data.favorite?.id || `saved-${normalizedPlaceId}`,
                created_at: data.favorite?.created_at || new Date().toISOString(),
                place: data.place || null,
              },
              ...currentFavorites,
            ])

            if (session?.user?.id) {
              writeFavoritesResumeCache(session.user.id, nextFavorites)
            }

            return nextFavorites
          })
        }

        if (data.message !== 'Place already saved to favorites.') {
          trackFavoriteAdded({
            placeSlug: normalizedPlaceSlug || data.place?.slug || null,
          })
        }

        return {
          status: data.message === 'Place already saved to favorites.' ? 'already-saved' : 'saved',
          message: data.message || 'Place saved to favorites.',
        }
      } catch (error) {
        setSavedPlaceKeys((currentKeys) => {
          const nextKeys = new Set(currentKeys)
          nextKeys.delete(normalizedPlaceId)
          if (normalizedPlaceSlug) {
            nextKeys.delete(normalizedPlaceSlug)
          }
          return nextKeys
        })

        throw error
      }
    }

    const removeFavorite = async (placeId: string, placeSlug?: string | null) => {
      const normalizedPlaceId = normalizeKnownPlaceKey(placeId)
      const normalizedPlaceSlug = placeSlug?.trim().toLowerCase() || ''

      const token = await getSupabaseAccessToken(session)

      if (!token) {
        throw new Error('Sign in to manage favorites.')
      }

      const routeIdentifier = normalizedPlaceId || normalizedPlaceSlug

      const previousFavorites = favorites
      const previousSavedPlaceKeys = savedPlaceKeys

      setSavedPlaceKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys)
        nextKeys.delete(normalizedPlaceId)
        if (normalizedPlaceSlug) {
          nextKeys.delete(normalizedPlaceSlug)
        }
        return nextKeys
      })
      setFavorites((currentFavorites) =>
        currentFavorites.filter((favorite) => {
          const id = favorite.place?.id
          const slug = favorite.place?.slug

          if (id && normalizeKnownPlaceKey(id) === normalizedPlaceId) {
            return false
          }

          if (slug && normalizedPlaceSlug && normalizeKnownPlaceKey(slug) === normalizedPlaceSlug) {
            return false
          }

          return true
        })
      )

      try {
        const response = await fetch(getApiUrl(`/favorites/${encodeURIComponent(routeIdentifier)}`), {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            placeId: normalizedPlaceId,
            placeSlug: normalizedPlaceSlug || undefined,
          }),
        })

        const data = (await response.json()) as FavoritesResponse

        if (!response.ok) {
          throw new Error(data.message || 'Failed to remove favorite.')
        }

        setSavedPlaceKeys((currentKeys) => {
          const nextKeys = new Set(currentKeys)
          nextKeys.delete(normalizedPlaceId)
          if (normalizedPlaceSlug) {
            nextKeys.delete(normalizedPlaceSlug)
          }
          if (data.place?.id) {
            nextKeys.delete(normalizeKnownPlaceKey(data.place.id))
          }
          if (data.place?.slug) {
            nextKeys.delete(normalizeKnownPlaceKey(data.place.slug))
          }
          return nextKeys
        })

        if (data.favorites) {
          const nextFavorites = dedupeFavoritesBySlug(data.favorites)
          setFavorites(nextFavorites)
          setSavedPlaceKeys(getSavedPlaceKeys(nextFavorites))
          if (session?.user?.id) {
            writeFavoritesResumeCache(session.user.id, nextFavorites)
          }
        }

        return data.message || 'Favorite removed'
      } catch (error) {
        setFavorites(previousFavorites)
        setSavedPlaceKeys(previousSavedPlaceKeys)
        throw error
      }
    }

    const clearAllFavorites = async () => {
      const token = await getSupabaseAccessToken(session)

      if (!token) {
        throw new Error('Sign in to manage favorites.')
      }

      const response = await fetch(getApiUrl('/favorites'), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to clear favorites.')
      }

      setFavorites([])
      setSavedPlaceKeys(new Set())
      if (session?.user?.id) {
        clearFavoritesResumeCache(session.user.id)
      }

      return data.message || 'All favorites cleared.'
    }

    return {
      session,
      isSessionLoading,
      isFavoritesLoading,
      favoritesError,
      favorites,
      savedPlaceKeys,
      isPlaceSaved,
      saveFavorite,
      removeFavorite,
      clearAllFavorites,
    }
  }, [favorites, favoritesError, isFavoritesLoading, isSessionLoading, savedPlaceKeys, session])

  return <SavedFavoritesContext.Provider value={value}>{children}</SavedFavoritesContext.Provider>
}

function useSavedFavorites() {
  const context = useContext(SavedFavoritesContext)

  if (!context) {
    throw new Error('useSavedFavorites must be used inside SavedFavoritesProvider.')
  }

  return context
}

export { SavedFavoritesProvider, useSavedFavorites }
export type { FavoritePlace, FavoriteRow }
