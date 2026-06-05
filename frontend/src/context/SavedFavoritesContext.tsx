import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'

type FavoritePlace = {
  id: string
  name: string | null
  slug: string | null
  category?: string | null
  address?: string | null
  city?: string | null
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
  savedPlaceSlugs: Set<string>
  isPlaceSaved: (placeSlug?: string | null) => boolean
  saveFavorite: (placeSlug: string) => Promise<SaveFavoriteResult>
  removeFavorite: (placeSlug: string) => Promise<string>
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

function normalizeKnownSlug(placeSlug: string) {
  return placeSlug.trim().toLowerCase()
}

function getSavedSlugs(favorites: FavoriteRow[]) {
  return new Set(
    favorites
      .map((favorite) => favorite.place?.slug)
      .filter((slug): slug is string => Boolean(slug?.trim()))
      .map(normalizeKnownSlug)
  )
}

function SavedFavoritesProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false)
  const [favoritesError, setFavoritesError] = useState('')
  const [favorites, setFavorites] = useState<FavoriteRow[]>([])
  const [savedPlaceSlugs, setSavedPlaceSlugs] = useState<Set<string>>(new Set())

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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.access_token) {
      setFavorites([])
      setSavedPlaceSlugs(new Set())
      setIsFavoritesLoading(false)
      setFavoritesError('')
      return undefined
    }

    const controller = new AbortController()

    const loadFavorites = async () => {
      try {
        setIsFavoritesLoading(true)
        setFavoritesError('')

        const response = await fetch(getApiEndpoint('/favorites'), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        })

        const data = (await response.json()) as FavoritesResponse

        if (!response.ok) {
          throw new Error(data.message || 'Failed to load favorites.')
        }

        const nextFavorites = data.favorites || []
        setFavorites(nextFavorites)
        setSavedPlaceSlugs(getSavedSlugs(nextFavorites))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          const message = error instanceof Error ? error.message : 'Failed to load favorites.'
          setFavoritesError(message)
          setFavorites([])
          setSavedPlaceSlugs(new Set())
          console.warn('Favorites state unavailable:', message)
        }
      } finally {
        setIsFavoritesLoading(false)
      }
    }

    void loadFavorites()

    return () => controller.abort()
  }, [session?.access_token])

  const value = useMemo<SavedFavoritesContextValue>(() => {
    const isPlaceSaved = (placeSlug?: string | null) => {
      if (!placeSlug) {
        return false
      }

      return savedPlaceSlugs.has(normalizeKnownSlug(placeSlug))
    }

    const saveFavorite = async (placeSlug: string): Promise<SaveFavoriteResult> => {
      const normalizedSlug = normalizeKnownSlug(placeSlug)

      if (!session?.access_token) {
        return {
          status: 'guest',
          message: 'Sign in to save favorites.',
        }
      }

      if (savedPlaceSlugs.has(normalizedSlug)) {
        return {
          status: 'already-saved',
          message: 'Place already saved to favorites.',
        }
      }

      const response = await fetch(getApiEndpoint('/favorites'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ placeSlug: normalizedSlug }),
      })

      const data = (await response.json()) as FavoritesResponse

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save favorite.')
      }

      setSavedPlaceSlugs((currentSlugs) => new Set(currentSlugs).add(normalizedSlug))

      if (data.favorites) {
        setFavorites(data.favorites)
      } else if (data.place) {
        setFavorites((currentFavorites) => {
          if (currentFavorites.some((favorite) => favorite.place?.slug === normalizedSlug)) {
            return currentFavorites
          }

          return [
            {
              id: data.favorite?.id || `saved-${normalizedSlug}`,
              created_at: data.favorite?.created_at || new Date().toISOString(),
              place: data.place || null,
            },
            ...currentFavorites,
          ]
        })
      }

      return {
        status: data.message === 'Place already saved to favorites.' ? 'already-saved' : 'saved',
        message: data.message || 'Place saved to favorites.',
      }
    }

    const removeFavorite = async (placeSlug: string) => {
      const normalizedSlug = normalizeKnownSlug(placeSlug)

      if (!session?.access_token) {
        throw new Error('Sign in to manage favorites.')
      }

      const response = await fetch(getApiEndpoint(`/favorites/${encodeURIComponent(normalizedSlug)}`), {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const data = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove favorite.')
      }

      setSavedPlaceSlugs((currentSlugs) => {
        const nextSlugs = new Set(currentSlugs)
        nextSlugs.delete(normalizedSlug)
        return nextSlugs
      })
      setFavorites((currentFavorites) =>
        currentFavorites.filter((favorite) => favorite.place?.slug !== normalizedSlug)
      )

      return data.message || 'Favorite removed'
    }

    return {
      session,
      isSessionLoading,
      isFavoritesLoading,
      favoritesError,
      favorites,
      savedPlaceSlugs,
      isPlaceSaved,
      saveFavorite,
      removeFavorite,
    }
  }, [favorites, favoritesError, isFavoritesLoading, isSessionLoading, savedPlaceSlugs, session])

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
