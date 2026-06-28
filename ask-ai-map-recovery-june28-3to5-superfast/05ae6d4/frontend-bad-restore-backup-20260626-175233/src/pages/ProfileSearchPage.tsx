import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import ProfileAvatar from '../components/ProfileAvatar'
import { normalizeUsername, searchProfiles, type PublicProfile } from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'
import { supabase } from '../supabase'

function ProfileSearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const normalizedQuery = useMemo(() => normalizeUsername(query), [query])

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setCurrentUserId(data.session?.user.id ?? null)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user.id ?? null)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setResults([])
      setIsSearching(false)
      setErrorMessage('')
      return undefined
    }

    if (normalizedQuery.length > 20) {
      setResults([])
      setIsSearching(false)
      setErrorMessage('Search up to 20 characters.')
      return undefined
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      const loadResults = async () => {
        try {
          setIsSearching(true)
          setErrorMessage('')
          const data = await searchProfiles(normalizedQuery)

          if (!controller.signal.aborted) {
            setResults(data.results)
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setResults([])
            setErrorMessage(error instanceof Error ? error.message : 'Failed to search profiles.')
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false)
          }
        }
      }

      void loadResults()
    }, 300)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [normalizedQuery])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-[880px] px-4 py-6 sm:px-6 lg:py-10">
        <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-[0_18px_42px_rgba(47,116,232,0.1)] sm:p-7">
          <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Search members</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--muted)]">
            Find GalaTayo members by username.
          </p>
          <label className="mt-5 flex h-13 items-center rounded-lg border border-[var(--line-strong)] bg-white px-4 focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-soft)]">
            <span className="text-lg font-black text-[var(--accent-deep)]">@</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value.toLowerCase())}
              className="min-w-0 flex-1 border-0 bg-transparent px-2 text-lg font-black text-slate-950 outline-none"
              placeholder="Search username"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
        </section>

        <section className="mt-5 grid gap-3">
          {normalizedQuery.length > 0 && normalizedQuery.length < 2 ? (
            <p className="rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--muted)]">
              Type at least 2 characters.
            </p>
          ) : null}

          {isSearching ? (
            <p className="rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--muted)]">
              Searching...
            </p>
          ) : null}

          {errorMessage ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errorMessage}</p> : null}

          {!isSearching && normalizedQuery.length >= 2 && !errorMessage && results.length === 0 ? (
            <p className="rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--muted)]">
              No members found.
            </p>
          ) : null}

          {results.map((profile) => {
            const isOwnProfile = Boolean(currentUserId && profile.user_id === currentUserId)

            return (
              <button
                key={profile.user_id}
                type="button"
                onClick={() => navigateToPath(isOwnProfile ? '/profile' : `/u/${encodeURIComponent(profile.username)}`)}
                className="flex w-full items-center gap-4 rounded-lg border border-[var(--line)] bg-white p-4 text-left shadow-sm transition hover:border-[var(--accent)] hover:bg-[var(--chip)]"
              >
                <ProfileAvatar profile={profile} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-lg font-black text-slate-950">@{profile.username}</span>
                    {isOwnProfile ? (
                      <span className="shrink-0 rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[11px] font-black text-[var(--accent-deep)]">
                        You
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm font-semibold leading-5 text-[var(--muted)]">
                    {profile.bio || 'No bio yet.'}
                  </span>
                </span>
              </button>
            )
          })}
        </section>
      </main>
    </div>
  )
}

export default ProfileSearchPage
