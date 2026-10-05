import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import ProfileAvatar from '../components/ProfileAvatar'
import { Button, Empty, Page, Row, SectionHead, Skeleton, Tag } from '../components/ui'
import { getFollowing, getMyProfile, getProfileSuggestions, normalizeUsername, searchProfiles, type FollowListUser, type PublicProfile } from '../utils/profileApi'
import { supabase } from '../supabase'

function formatCompactCount(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value)
}

function PersonRow({
  profile,
  href,
  tag,
  meta,
}: {
  profile: FollowListUser
  href: string
  tag?: string
  meta?: string
}) {
  return (
    <Row href={href}>
      <div className="flex min-w-0 items-center gap-3">
        <ProfileAvatar profile={profile} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="g-h3 truncate">@{profile.username}</span>
            {tag ? <Tag className="shrink-0">{tag}</Tag> : null}
          </div>
          <div className="g-sm g-mut truncate">{profile.bio || 'View profile'}</div>
          {meta ? <div className="g-xs g-fnt">{meta}</div> : null}
        </div>
      </div>
    </Row>
  )
}

function PublicProfileRow({ profile, currentUserId }: { profile: PublicProfile; currentUserId: string | null }) {
  const isOwnProfile = Boolean(currentUserId && profile.user_id === currentUserId)
  return (
    <PersonRow
      profile={profile}
      href={isOwnProfile ? '/profile' : `/u/${encodeURIComponent(profile.username)}`}
      tag={isOwnProfile ? 'You' : undefined}
      meta={`${formatCompactCount(profile.followers_count ?? 0)} followers · ${formatCompactCount(profile.following_count ?? 0)} following`}
    />
  )
}

function RowsSkeleton() {
  return (
    <div className="g-list" aria-label="Loading">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-[72px]" />
      ))}
    </div>
  )
}

function ErrorLine({ children }: { children: string }) {
  return (
    <p role="alert" className="g-sm" style={{ color: 'var(--bad)' }}>
      {children}
    </p>
  )
}

const LIST_GRID = 'grid gap-2.5 lg:grid-cols-2'

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

  const normalizedQuery = useMemo(() => normalizeUsername(query), [query])
  const isShowingSearchResults = normalizedQuery.length >= 2
  const followingUsernames = useMemo(() => new Set(followingProfiles.map((profile) => profile.username)), [followingProfiles])
  const visibleSuggestionPool = suggestions.filter((profile) => !followingUsernames.has(profile.username))
  const visibleResults = results
  const visibleSuggestions = visibleSuggestionPool
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

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && inputRef.current !== document.activeElement) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])


  return (
    <Page>
      <header className="max-w-[640px]">
        <h1 className="g-h1">Find friends</h1>
        <p className="g-mut mt-2">Search usernames and build your barkada on GalaTayo.</p>

        <label className="g-search mt-5">
          <Search className="g-ic" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value.toLowerCase())}
            placeholder="Search by @username"
            aria-label="Search by username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
          />
          {isSearching && normalizedQuery.length >= 2 ? (
            <Loader2 className="g-ic mr-3 animate-spin" aria-label="Searching" />
          ) : query ? (
            <Button variant="text" size="sm" iconOnly aria-label="Clear search" onClick={() => setQuery('')}>
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </label>
        <p className="g-xs g-mut mt-2">{helperCopy}</p>
      </header>

      {errorMessage ? (
        <div className="mt-6">
          <ErrorLine>{errorMessage}</ErrorLine>
        </div>
      ) : null}

      {!isSearching && isShowingSearchResults && !errorMessage && results.length === 0 ? (
        <Empty className="mt-6" title="No members found." description={`Walang @${normalizedQuery}. Try another spelling.`} />
      ) : null}

      {results.length > 0 ? (
        <section>
          <SectionHead title="Matching members" sub={`${results.length} match${results.length === 1 ? '' : 'es'}`} />
          <div className={LIST_GRID}>
            {visibleResults.map((profile) => (
              <PublicProfileRow key={profile.user_id} profile={profile} currentUserId={currentUserId} />
            ))}
          </div>
        </section>
      ) : null}

      {!isShowingSearchResults ? (
        <>
          {!isLoadingFollowing || followingErrorMessage || followingProfiles.length > 0 ? (
            <section>
              <SectionHead title="People you follow" sub={!isLoadingFollowing && followingProfiles.length > 0 ? `${followingProfiles.length} following` : undefined} />
              {isLoadingFollowing ? <RowsSkeleton /> : null}
              {followingErrorMessage ? <ErrorLine>{followingErrorMessage}</ErrorLine> : null}
              {!isLoadingFollowing && !followingErrorMessage && followingProfiles.length > 0 ? (
                <div className={LIST_GRID}>
                  {followingProfiles.map((profile) => (
                    <PersonRow key={profile.user_id} profile={profile} href={`/u/${encodeURIComponent(profile.username)}`} tag="Following" />
                  ))}
                </div>
              ) : null}
              {!isLoadingFollowing && !followingErrorMessage && followingProfiles.length === 0 ? (
                <Empty title="Wala ka pang fina-follow." description="Open a few suggested profiles below to start your circle." />
              ) : null}
            </section>
          ) : null}

          <section>
            <SectionHead
              title="Suggested for you"
              sub={!isLoadingSuggestions && !isLoadingFollowing && !suggestionsErrorMessage && visibleSuggestions.length > 0 ? `${visibleSuggestions.length} profiles` : undefined}
            />
            {isLoadingSuggestions || isLoadingFollowing ? <RowsSkeleton /> : null}
            {suggestionsErrorMessage ? <ErrorLine>{suggestionsErrorMessage}</ErrorLine> : null}
            {!isLoadingSuggestions && !isLoadingFollowing && !suggestionsErrorMessage && visibleSuggestions.length === 0 ? (
              <Empty title="No suggested users yet." description="Search a username above instead." />
            ) : null}
            {!isLoadingSuggestions && !isLoadingFollowing && visibleSuggestions.length > 0 ? (
              <div className={LIST_GRID}>
                {visibleSuggestions.map((profile) => (
                  <PublicProfileRow key={profile.user_id} profile={profile} currentUserId={currentUserId} />
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </Page>
  )
}

export default ProfileSearchPage
