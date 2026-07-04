import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, LoaderCircle, Search, Users } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import ProfileAvatar from '../components/ProfileAvatar'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import { getFollowing, getMyProfile, getProfileSuggestions, getPublicProfile, normalizeUsername, searchProfiles, type FollowListUser, type PublicProfile } from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'
import { supabase } from '../supabase'

function formatCompactCount(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value)
}

function ProfileResultCard({
  profile,
  currentUserId,
  emphasis = 'default',
}: {
  profile: PublicProfile
  currentUserId: string | null
  emphasis?: 'default' | 'featured'
}) {
  const isOwnProfile = Boolean(currentUserId && profile.user_id === currentUserId)
  const followersCount = profile.followers_count ?? 0
  const followingCount = profile.following_count ?? 0
  const actionPath = isOwnProfile ? '/profile' : `/u/${encodeURIComponent(profile.username)}`

  if (emphasis === 'default') {
    return (
      <button
        type="button"
        onClick={() => navigateToPath(actionPath)}
        className="group gala-card w-full overflow-hidden px-2.5 py-3 text-left transition duration-200 hover:border-slate-300 hover:bg-slate-50 sm:px-3"
      >
        <span className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="shrink-0">
            <ProfileAvatar profile={profile} size="sm" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <span className="truncate text-[14px] font-black text-slate-950">
                @{profile.username}
              </span>
              {isOwnProfile ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                  You
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-[#e7f0ff] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-[#1669d6]">
                  New
                </span>
              )}
            </span>
            <span className="mt-1 block line-clamp-2 text-[12px] font-semibold leading-4.5 text-[var(--muted)]">
              {profile.bio || 'Public profile ready for new connections.'}
            </span>
            <span className="mt-2 flex items-center gap-2 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 sm:gap-x-3 sm:text-[10px] sm:tracking-[0.14em]">
              <span>{formatCompactCount(followersCount)} followers</span>
              <span>{formatCompactCount(followingCount)} following</span>
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-2">
            <span className="flex items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-white transition group-hover:bg-[var(--accent-deep)] sm:px-3 sm:text-[9px]">
              View
              <ArrowUpRight className="h-3 w-3" />
            </span>
          </span>
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => navigateToPath(actionPath)}
      className="group gala-card flex w-full items-center gap-2.5 overflow-hidden px-3 py-3 text-left transition duration-200 hover:border-[var(--accent)] sm:gap-3 sm:px-4"
    >
      <span className="flex shrink-0 items-center self-center">
        <ProfileAvatar profile={profile} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="truncate text-[14px] font-black text-slate-950 sm:text-[15px]">
            @{profile.username}
          </span>
          {isOwnProfile ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              You
            </span>
          ) : null}
        </span>
        <span className="mt-1 block line-clamp-2 text-[13px] font-semibold leading-5 text-[var(--muted)]">
          {profile.bio || 'Public profile ready for new connections.'}
        </span>
      </span>
      <span className="flex shrink-0 items-center self-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-white transition group-hover:bg-[var(--accent-deep)] sm:px-3 sm:text-[10px]">
        View
        <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

function FollowedProfileRow({ profile }: { profile: FollowListUser }) {
  return (
    <button
      type="button"
      onClick={() => navigateToPath(`/u/${encodeURIComponent(profile.username)}`)}
      className="group gala-card flex w-full items-center gap-2.5 overflow-hidden px-3 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50 sm:gap-3 sm:px-4"
    >
      <ProfileAvatar profile={profile} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span className="truncate text-sm font-black text-slate-950">@{profile.username}</span>
          <span className="shrink-0 rounded-full bg-[#e7f0ff] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#1669d6]">
            Following
          </span>
        </span>
        <span className="mt-1 block truncate text-sm font-semibold text-[var(--muted)]">
          {profile.bio || 'Already part of your circle.'}
        </span>
      </span>
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 transition group-hover:text-slate-700 sm:text-[11px]">
        Open
      </span>
    </button>
  )
}

function SectionMessage({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'error'
  children: ReactNode
}) {
  const toneClassName =
    tone === 'error'
      ? 'border-red-200 bg-red-50/90 text-red-700'
      : 'border-slate-200 bg-white text-[var(--muted)]'

  return (
    <p className={`rounded-lg border px-4 py-3 text-sm font-semibold ${toneClassName}`}>
      {children}
    </p>
  )
}

function SectionHeader({
  eyebrow,
  title,
  description,
  trailing,
}: {
  eyebrow: string
  title: string
  description: string
  trailing?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <span className="gala-eyebrow">{eyebrow}</span>
        <h2 className="gala-section-title mt-2">{title}</h2>
        <p className="gala-section-description mt-1">{description}</p>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}

function ProfileSearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [suggestions, setSuggestions] = useState<PublicProfile[]>([])
  const [followingProfiles, setFollowingProfiles] = useState<FollowListUser[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true)
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [suggestionsErrorMessage, setSuggestionsErrorMessage] = useState('')
  const [followingErrorMessage, setFollowingErrorMessage] = useState('')
  const [profileCountOverrides, setProfileCountOverrides] = useState<Record<string, Pick<PublicProfile, 'followers_count' | 'following_count'>>>({})
  const normalizedQuery = useMemo(() => normalizeUsername(query), [query])
  const isShowingSearchResults = normalizedQuery.length >= 2
  const followingUsernames = useMemo(() => new Set(followingProfiles.map((profile) => profile.username)), [followingProfiles])
  const visibleSuggestionPool = suggestions.filter((profile) => !followingUsernames.has(profile.username))
  const visibleResults = results.map((profile) => ({
    ...profile,
    ...profileCountOverrides[profile.username],
  }))
  const visibleSuggestions = visibleSuggestionPool.map((profile) => ({
    ...profile,
    ...profileCountOverrides[profile.username],
  }))
  const hasStatusMessage =
    (normalizedQuery.length > 0 && normalizedQuery.length < 2) ||
    Boolean(errorMessage) ||
    (!isSearching && normalizedQuery.length >= 2 && !errorMessage && results.length === 0)
  const helperCopy =
    normalizedQuery.length === 0
      ? 'Search by username or browse suggestions to discover active members.'
      : isShowingSearchResults
        ? `Showing matches for @${normalizedQuery}`
        : 'Type at least 2 characters to start searching.'

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
    let isMounted = true

    const loadFollowing = async () => {
      try {
        setIsLoadingFollowing(true)
        setFollowingErrorMessage('')
        const profileData = await getMyProfile()

        if (!isMounted || !profileData.profile?.username) {
          return
        }

        const followingData = await getFollowing(profileData.profile.username)

        if (isMounted) {
          setFollowingProfiles(followingData.users)
        }
      } catch (error) {
        if (isMounted) {
          setFollowingProfiles([])
          if ((error as Error).message !== 'Sign in is required.') {
            setFollowingErrorMessage(error instanceof Error ? error.message : 'Failed to load following.')
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingFollowing(false)
        }
      }
    }

    const loadSuggestions = async () => {
      try {
        setIsLoadingSuggestions(true)
        setSuggestionsErrorMessage('')
        const data = await getProfileSuggestions()
        if (isMounted) {
          setSuggestions(data.suggestions)
        }
      } catch (error) {
        if (isMounted) {
          setSuggestions([])
          setSuggestionsErrorMessage(error instanceof Error ? error.message : 'Failed to load suggested users.')
        }
      } finally {
        if (isMounted) {
          setIsLoadingSuggestions(false)
        }
      }
    }

    void loadFollowing()
    void loadSuggestions()

    return () => {
      isMounted = false
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

  useEffect(() => {
    const visibleProfiles = isShowingSearchResults ? results : visibleSuggestionPool
    const usernamesToHydrate = visibleProfiles
      .map((profile) => profile.username)
      .filter((username) => username && !profileCountOverrides[username])

    if (usernamesToHydrate.length === 0) {
      return
    }

    let isMounted = true

    const loadAccurateCounts = async () => {
      const settledProfiles = await Promise.allSettled(
        usernamesToHydrate.map(async (username) => {
          const data = await getPublicProfile(username)

          return {
            username,
            followers_count: data.profile.followers_count,
            following_count: data.profile.following_count,
          }
        }),
      )

      if (!isMounted) {
        return
      }

      const nextOverrides = settledProfiles.reduce<Record<string, Pick<PublicProfile, 'followers_count' | 'following_count'>>>((accumulator, result) => {
        if (result.status === 'fulfilled') {
          accumulator[result.value.username] = {
            followers_count: result.value.followers_count,
            following_count: result.value.following_count,
          }
        }

        return accumulator
      }, {})

      if (Object.keys(nextOverrides).length > 0) {
        setProfileCountOverrides((currentValue) => ({
          ...currentValue,
          ...nextOverrides,
        }))
      }
    }

    void loadAccurateCounts()

    return () => {
      isMounted = false
    }
  }, [isShowingSearchResults, profileCountOverrides, results, visibleSuggestionPool])

  const summaryCount = isShowingSearchResults ? visibleResults.length : visibleSuggestions.length

  return (
    <div className="gala-app-page">
      <AppHeader fixed />
      <main className="gala-app-main gala-app-main-fixed-header">
        <section className="gala-page-header">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[560px]">
              <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
                <Users className="h-4 w-4 text-[var(--accent)]" />
                Find Friends
              </div>
              <h1 className="gala-page-title">
                Connect with people around GalaTayo
              </h1>
              <p className="gala-page-description">
                Search usernames, open profiles fast, and browse suggested people in a familiar social layout.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span className="gala-count-pill">
                {summaryCount} {isShowingSearchResults ? 'match' : 'profile'}
                {summaryCount === 1 ? '' : 's'}
              </span>
              <span className="gala-count-pill">
                {isShowingSearchResults ? `Searching @${normalizedQuery}` : 'Suggested for you'}
              </span>
            </div>
          </div>

          <label className="gala-field mt-5 flex items-center gap-3 bg-white px-4 py-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--chip)] text-slate-500">
              <Search className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Search username
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value.toLowerCase())}
                className="mt-1 min-w-0 w-full border-0 bg-transparent p-0 text-[1.05rem] font-black text-slate-950 outline-none placeholder:font-bold placeholder:text-slate-400 sm:text-[1.15rem]"
                placeholder="@username"
                autoCapitalize="none"
                spellCheck={false}
              />
            </span>
            {isSearching ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /> : null}
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="shrink-0 rounded-lg bg-slate-950 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-slate-800"
              >
                Clear
              </button>
            ) : null}
          </label>

          <p className="gala-section-description mt-3">{helperCopy}</p>
        </section>

        {hasStatusMessage ? (
          <section className="mt-4 grid gap-3">
            {normalizedQuery.length > 0 && normalizedQuery.length < 2 ? (
              <SectionMessage>Type at least 2 characters.</SectionMessage>
            ) : null}

            {errorMessage ? <SectionMessage tone="error">{errorMessage}</SectionMessage> : null}

            {!isSearching && normalizedQuery.length >= 2 && !errorMessage && results.length === 0 ? (
              <SectionMessage>No members found.</SectionMessage>
            ) : null}
          </section>
        ) : null}

        {results.length > 0 ? (
          <section className="mt-8">
            <SectionHeader
              eyebrow="Search Results"
              title="Matching members"
              description="Relevant usernames shown in a direct, scrollable people feed."
              trailing={
                <span className="rounded-full bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  {results.length} match{results.length === 1 ? '' : 'es'}
                </span>
              }
            />
            <div className="mt-4 grid gap-3">
              {visibleResults.map((profile) => (
                <ProfileResultCard key={profile.user_id} profile={profile} currentUserId={currentUserId} emphasis="featured" />
              ))}
            </div>
          </section>
        ) : null}

        {!isShowingSearchResults ? (
          <section className="mt-6">
            <div className="grid gap-6">
              {!isLoadingFollowing || followingErrorMessage || followingProfiles.length > 0 ? (
                <section>
                  <SectionHeader
                    eyebrow="Following"
                    title="People you already follow"
                    description="A simple list of profiles already in your network."
                    trailing={
                      !isLoadingFollowing && followingProfiles.length > 0 ? (
                        <span className="rounded-full bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                          {followingProfiles.length} following
                        </span>
                      ) : undefined
                    }
                  />

                  <div className="mt-4 grid gap-2">
                    {isLoadingFollowing ? (
                      <UnifiedLoadingState
                        variant="inline"
                        title="Preparing your following list..."
                        message="We are loading people you already follow."
                      />
                    ) : null}
                    {followingErrorMessage ? <SectionMessage tone="error">{followingErrorMessage}</SectionMessage> : null}
                    {!isLoadingFollowing && !followingErrorMessage && followingProfiles.length > 0 ? (
                      <div className="grid gap-2">
                        {followingProfiles.map((profile) => (
                          <FollowedProfileRow key={profile.user_id} profile={profile} />
                        ))}
                      </div>
                    ) : null}
                    {!isLoadingFollowing && !followingErrorMessage && followingProfiles.length === 0 ? (
                      <div className="gala-empty-state px-4 py-5">
                        <span className="gala-count-pill">
                          Start your circle
                        </span>
                        <h3 className="mt-3 text-[1.05rem] font-black text-slate-950">
                          You are not following anyone yet
                        </h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--muted)]">
                          Browse the suggested users below and open a few profiles to start building your network.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section>
            <SectionHeader
              eyebrow="Suggested Users"
              title="Suggested for you"
              description="New people to discover, excluding profiles you already follow."
              trailing={
                !isLoadingSuggestions && !suggestionsErrorMessage && visibleSuggestions.length > 0 ? (
                  <span className="rounded-full bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                    {visibleSuggestions.length} profiles
                  </span>
                ) : undefined
              }
            />

            <div className="mt-4 grid gap-3">
              {isLoadingSuggestions ? (
                <UnifiedLoadingState
                  variant="inline"
                  title="Preparing suggestions..."
                  message="We are loading profiles you may want to follow."
                />
              ) : null}

              {suggestionsErrorMessage ? <SectionMessage tone="error">{suggestionsErrorMessage}</SectionMessage> : null}

              {!isLoadingSuggestions && !suggestionsErrorMessage && visibleSuggestions.length === 0 ? (
                <SectionMessage>No suggested users yet.</SectionMessage>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {visibleSuggestions.map((profile) => (
                  <ProfileResultCard key={profile.user_id} profile={profile} currentUserId={currentUserId} />
                ))}
              </div>
            </div>
              </section>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default ProfileSearchPage
