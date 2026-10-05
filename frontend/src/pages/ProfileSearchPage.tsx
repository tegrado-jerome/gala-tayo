import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { CircleNotch as Loader2 } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { MagnifyingGlass as Search } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { UserPlus } from '@phosphor-icons/react/dist/csr/UserPlus'
import { X } from '@phosphor-icons/react/dist/csr/X'
import InternalLink from '../components/InternalLink'
import ProfileAvatar from '../components/ProfileAvatar'
import { Button, Empty, Page, SectionHead, Skeleton, Tag } from '../components/ui'
import { useSystemMessage } from '../context/SystemMessageContext'
import {
  followProfile,
  getFollowing,
  getMyProfile,
  getProfileSuggestions,
  normalizeUsername,
  searchProfiles,
  unfollowProfile,
  type FollowListUser,
  type PublicProfile,
  type RelationshipState,
} from '../utils/profileApi'
import { supabase } from '../supabase'
import '../design/me.css'

function formatCompactCount(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value)
}

type PersonProfile = FollowListUser & Partial<Pick<PublicProfile, 'is_public' | 'followers_count' | 'following_count'>>

const FOLLOW_LABELS: Record<RelationshipState, string> = {
  self: 'You',
  following: 'Following',
  pending: 'Requested',
  not_following: 'Follow',
  blocked: 'Follow',
}

type PersonProps = {
  profile: PersonProfile
  currentUserId: string | null
  relationship: RelationshipState
  followersCount?: number
  onToggleFollow: (profile: PersonProfile) => void
}

function personInfo({ profile, currentUserId, relationship, followersCount }: PersonProps) {
  const isOwnProfile = Boolean(currentUserId && profile.user_id === currentUserId)
  return {
    isOwnProfile,
    href: isOwnProfile ? '/profile' : `/u/${encodeURIComponent(profile.username)}`,
    title: profile.display_name?.trim() || `@${profile.username}`,
    isFollowing: relationship === 'following' || relationship === 'pending',
    counts:
      followersCount !== undefined || profile.following_count !== undefined
        ? `${formatCompactCount(followersCount ?? 0)} followers · ${formatCompactCount(profile.following_count ?? 0)} following`
        : null,
  }
}

function FollowButton({ profile, relationship, isFollowing, onToggleFollow, block }: Pick<PersonProps, 'profile' | 'relationship' | 'onToggleFollow'> & { isFollowing: boolean; block?: boolean }) {
  const Icon = relationship === 'following' ? Check : relationship === 'pending' ? Clock : UserPlus
  return (
    <Button
      variant={isFollowing ? 'soft' : 'ink'}
      size="sm"
      block={block}
      className={block ? undefined : 'min-w-[104px]'}
      aria-label={`${FOLLOW_LABELS[relationship]} @${profile.username}`}
      onClick={(event) => {
        event.stopPropagation()
        onToggleFollow(profile)
      }}
    >
      <Icon aria-hidden="true" />
      {FOLLOW_LABELS[relationship]}
    </Button>
  )
}

/** List row for people you follow and search matches: avatar, name, handle, counts, follow button. */
function PersonRow(props: PersonProps) {
  const { profile, relationship, onToggleFollow } = props
  const { isOwnProfile, href, title, isFollowing, counts } = personInfo(props)

  return (
    <div className="me-prow">
      <ProfileAvatar profile={profile} size="sm" />
      <InternalLink href={href}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="g-h3 truncate">{title}</span>
          {isOwnProfile ? <Tag className="shrink-0">You</Tag> : null}
        </span>
        <span className="g-sm g-mut block truncate">@{profile.username}</span>
        {counts ? <span className="g-xs g-fnt block truncate">{counts}</span> : null}
      </InternalLink>
      {isOwnProfile ? null : <FollowButton profile={profile} relationship={relationship} isFollowing={isFollowing} onToggleFollow={onToggleFollow} />}
    </div>
  )
}

/** Suggestion card: big avatar, name, handle, counts, full-width follow button. */
function PersonCard(props: PersonProps) {
  const { profile, relationship, onToggleFollow } = props
  const { isOwnProfile, href, title, isFollowing, counts } = personInfo(props)

  return (
    <div className="me-pcard">
      <ProfileAvatar profile={profile} size="md" />
      <InternalLink href={href} ariaLabel={`${title}, @${profile.username}`}>
        <span className="me-pcard-n block">{title}</span>
      </InternalLink>
      <span className="me-pcard-s">@{profile.username}</span>
      {counts ? <span className="g-xs g-fnt max-w-full truncate">{counts}</span> : null}
      {isOwnProfile ? (
        <Tag className="mt-3">You</Tag>
      ) : (
        <FollowButton profile={profile} relationship={relationship} isFollowing={isFollowing} onToggleFollow={onToggleFollow} block />
      )}
    </div>
  )
}

function RowsSkeleton() {
  return (
    <div className={LIST_GRID} aria-label="Loading">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-3">
          <Skeleton className="h-12 w-12 shrink-0 !rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CardsSkeleton() {
  return (
    <div className="me-people" aria-label="Loading">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[196px] !rounded-[var(--r-3)]" />
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

const LIST_GRID = 'grid lg:grid-cols-2 lg:gap-x-10'

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
  const [relationships, setRelationships] = useState<Record<string, RelationshipState>>({})
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({})
  const followRequestsInFlight = useRef(new Set<string>())
  const { showSystemMessage } = useSystemMessage()
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

  const getRelationship = (username: string): RelationshipState =>
    relationships[username] ?? (followingUsernames.has(username) ? 'following' : 'not_following')

  const getFollowersCount = (profile: PersonProfile) => followerCounts[profile.username] ?? profile.followers_count

  const handleToggleFollow = async (profile: PersonProfile) => {
    const { username } = profile
    if (followRequestsInFlight.current.has(username)) return
    followRequestsInFlight.current.add(username)

    const previousState = getRelationship(username)
    const previousCount = getFollowersCount(profile)
    const isUndo = previousState === 'following' || previousState === 'pending'
    const optimisticState: RelationshipState = isUndo ? 'not_following' : profile.is_public === false ? 'pending' : 'following'
    const countDelta = previousState === 'following' ? -1 : optimisticState === 'following' ? 1 : 0

    setRelationships((current) => ({ ...current, [username]: optimisticState }))
    if (previousCount !== undefined) {
      setFollowerCounts((current) => ({ ...current, [username]: Math.max(0, previousCount + countDelta) }))
    }

    try {
      const data = isUndo ? await unfollowProfile(username) : await followProfile(username)
      setRelationships((current) => ({ ...current, [username]: data.relationship_state }))
      if (previousCount !== undefined) {
        setFollowerCounts((current) => ({ ...current, [username]: data.followers_count }))
      }
    } catch (error) {
      setRelationships((current) => ({ ...current, [username]: previousState }))
      if (previousCount !== undefined) {
        setFollowerCounts((current) => ({ ...current, [username]: previousCount }))
      }
      showSystemMessage({ title: 'Could not update follow', description: error instanceof Error ? error.message : 'Try again in a bit.' })
    } finally {
      followRequestsInFlight.current.delete(username)
    }
  }

  const personProps = (profile: PersonProfile): PersonProps => ({
    profile,
    currentUserId,
    relationship: getRelationship(profile.username),
    followersCount: getFollowersCount(profile),
    onToggleFollow: (target) => void handleToggleFollow(target),
  })
  const renderPerson = (profile: PersonProfile) => <PersonRow key={profile.user_id} {...personProps(profile)} />
  const renderCard = (profile: PersonProfile) => <PersonCard key={profile.user_id} {...personProps(profile)} />

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
        <p className="g-mut mt-1">Search usernames and build your barkada on GalaTayo.</p>

        <label className="g-search mt-5 !h-14 shadow-[var(--sh-2)] focus-within:border-[var(--ink)]">
          <Search className="g-ic" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value.toLowerCase())}
            placeholder="Search by @username"
            aria-label="Search by username"
            className="focus:shadow-none focus:outline-none focus-visible:shadow-none focus-visible:outline-none"
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
            {visibleResults.map(renderPerson)}
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
                  {followingProfiles.map(renderPerson)}
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
            {isLoadingSuggestions || isLoadingFollowing ? <CardsSkeleton /> : null}
            {suggestionsErrorMessage ? <ErrorLine>{suggestionsErrorMessage}</ErrorLine> : null}
            {!isLoadingSuggestions && !isLoadingFollowing && !suggestionsErrorMessage && visibleSuggestions.length === 0 ? (
              <Empty title="No suggested users yet." description="Search a username above instead." />
            ) : null}
            {!isLoadingSuggestions && !isLoadingFollowing && visibleSuggestions.length > 0 ? (
              <div className="me-people">
                {visibleSuggestions.map(renderCard)}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </Page>
  )
}

export default ProfileSearchPage
