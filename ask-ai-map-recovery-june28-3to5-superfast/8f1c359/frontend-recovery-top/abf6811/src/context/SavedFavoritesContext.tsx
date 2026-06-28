import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseAccessToken, shouldPropagateSessionChange, supabase } from '../supabase'

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

const SavedFavoritesContext = createContext<SavedFavoritesContextValue | null>(null)

function getApiEndpoint(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

function normalizeKnownPlaceKey(placeSlugOrId: string) {
  return placeSlugOrId.trim().toLowerCase()
}

function dedupeFavoritesBySlug(favorites: FavoriteRow[]) {
  const seenSlugs = new Set<string>()

  return favorites.filter((favorite) => {
    const slug = favorite.place?.slug?.trim()

    if (!slug) {
      return false
    }

    const normalizedSlug = normalizeKnownPlaceKey(slug)

    if (seenSlugs.has(normalizedSlug)) {
      return false
    }

    seenSlugs.add(normalizedSlug)
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
      setIsFavoritesLoading(false)
      setFavoritesError('')
      return undefined
    }

    const controller = new AbortController()

    const loadFavorites = async () => {
      try {
        const token = await getSupabaseAccessToken(session)

        if (!token) {
          throw new Error('Sign in is required.')
        }

        setIsFavoritesLoading(favorites.length === 0)
        setFavoritesError('')

        const response = await fetch(getApiEndpoint('/favorites'), {
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

      const response = await fetch(getApiEndpoint('/favorites'), {
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
      } else if (data.place) {
        setFavorites((currentFavorites) => {
          if (currentFavorites.some((favorite) => favorite.place?.id && normalizeKnownPlaceKey(favorite.place.id) === normalizedPlaceId)) {
            return currentFavorites
          }

          return dedupeFavoritesBySlug([
            {
              id: data.favorite?.id || `saved-${normalizedPlaceId}`,
              created_at: data.favorite?.created_at || new Date().toISOString(),
              place: data.place || null,
            },
            ...currentFavorites,
          ])
        })
      }

      return {
        status: data.message === 'Place already saved to favorites.' ? 'already-saved' : 'saved',
        message: data.message || 'Place saved to favorites.',
      }
    }

    const removeFavorite = async (placeId: string, placeSlug?: string | null) => {
      const normalizedPlaceId = normalizeKnownPlaceKey(placeId)
      const normalizedPlaceSlug = placeSlug?.trim().toLowerCase() || ''

      const token = await getSupabaseAccessToken(session)

      if (!token) {
        throw new Error('Sign in to manage favorites.')
      }

      const routeIdentifier = normalizedPlaceSlug || normalizedPlaceId

      const response = await fetch(getApiEndpoint(`/favorites/${encodeURIComponent(routeIdentifier)}`), {
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
      setFavorites((currentFavorites) =>
        currentFavorites.filter((favorite) => {
          const id = favorite.place?.id
          return !id || normalizeKnownPlaceKey(id) !== normalizedPlaceId
        })
      )

      if (data.favorites) {
        const nextFavorites = dedupeFavoritesBySlug(data.favorites)
        setFavorites(nextFavorites)
        setSavedPlaceKeys(getSavedPlaceKeys(nextFavorites))
      }

      return data.message || 'Favorite removed'
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
