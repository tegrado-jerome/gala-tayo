import { useEffect, useState } from 'react'
import { Check, Clock, Lock, Settings, Share2, UserPlus } from 'lucide-react'
import ProfileAvatar from '../components/ProfileAvatar'
import { Button, Empty, Page, SectionHead, Skeleton, Tag } from '../components/ui'
import { FollowListSheet, PlanCard } from './ProfilePage'
import { useSystemMessage } from '../context/SystemMessageContext'
import {
  followProfile,
  getDisplayName,
  getFollowers,
  getFollowing,
  getPublicProfile,
  unfollowProfile,
  type FollowListUser,
  type PublicGalaPlanSummary,
  type PublicProfile,
  type RelationshipState,
} from '../utils/profileApi'
import { shareLink } from '../utils/share'
import { getPublicSiteOrigin } from '../utils/site'
import { getSupabaseAccessToken } from '../supabase'

type PublicProfilePageProps = {
  username: string
}

const RELATIONSHIP_LABELS: Record<RelationshipState, string> = {
  self: 'You',
  following: 'Following',
  pending: 'Requested',
  not_following: 'Follow',
  blocked: 'Follow',
}

function PublicProfilePage({ username }: PublicProfilePageProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [plans, setPlans] = useState<PublicGalaPlanSummary[]>([])
  const [lockedMessage, setLockedMessage] = useState('')
  const [relationshipState, setRelationshipState] = useState<RelationshipState>('not_following')
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [listTitle, setListTitle] = useState('')
  const [listUsers, setListUsers] = useState<FollowListUser[] | null>(null)
  const { showSystemMessage } = useSystemMessage()
  const loadedProfile = profile?.username.toLowerCase() === username.toLowerCase() ? profile : null
  const canOpenFollowLists = relationshipState === 'self' || Boolean(loadedProfile?.is_public)

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        setIsLoading(true)
        setProfile(null)
        setPlans([])
        setLockedMessage('')
        setNotFound(false)
        setErrorMessage('')
        setNotice('')
        setRelationshipState('not_following')
        const data = await getPublicProfile(username)

        if (!isMounted) return
        setProfile(data.profile)
        setPlans(data.plans ?? [])
        setLockedMessage(data.locked ? data.message || 'This profile is private.' : '')
        setRelationshipState(data.relationship_state)
      } catch (error) {
        if (!isMounted) return
        if ((error as Error & { status?: number }).status === 404) {
          setNotFound(true)
        } else {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load profile.')
        }
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadProfile()

    return () => {
      isMounted = false
    }
  }, [username])

  const handleFollow = async () => {
    if (!profile) return

    const token = await getSupabaseAccessToken()
    if (!token) {
      setNotice('Log in to follow this profile.')
      return
    }

    const previousProfile = profile
    const previousState = relationshipState

    try {
      if (relationshipState === 'following' || relationshipState === 'pending') {
        setRelationshipState('not_following')
        if (relationshipState === 'following') {
          setProfile({ ...profile, followers_count: Math.max(0, profile.followers_count - 1) })
        }
        const data = await unfollowProfile(profile.username)
        setRelationshipState(data.relationship_state)
        setProfile((current) => (current ? { ...current, followers_count: data.followers_count } : current))
      } else {
        const nextState = profile.is_public ? 'following' : 'pending'
        setRelationshipState(nextState)
        if (nextState === 'following') {
          setProfile({ ...profile, followers_count: profile.followers_count + 1 })
        }
        const data = await followProfile(profile.username)
        setRelationshipState(data.relationship_state)
        setProfile((current) => (current ? { ...current, followers_count: data.followers_count } : current))
      }
    } catch (error) {
      setProfile(previousProfile)
      setRelationshipState(previousState)
      setNotice(error instanceof Error ? error.message : 'Follow update failed.')
    }
  }

  const openList = async (kind: 'followers' | 'following') => {
    if (!profile) return

    try {
      setListTitle(kind === 'followers' ? 'Followers' : 'Following')
      const data = kind === 'followers' ? await getFollowers(profile.username) : await getFollowing(profile.username)
      setListUsers(data.users)
    } catch (error) {
      setListTitle(kind === 'followers' ? 'Followers' : 'Following')
      setListUsers([])
      setNotice(
        (error as Error & { status?: number }).status === 403
          ? 'This list is private.'
          : error instanceof Error
            ? error.message
            : `Failed to load ${kind}.`,
      )
    }
  }

  const handleShare = async () => {
    if (!loadedProfile) return
    const canNativeShare = typeof navigator.share === 'function'
    try {
      await shareLink({ url: `${getPublicSiteOrigin()}/u/${encodeURIComponent(loadedProfile.username)}`, title: `@${loadedProfile.username} on GalaTayo` })
      if (!canNativeShare) showSystemMessage({ title: 'Link copied', description: 'The profile link is ready to paste.' })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') showSystemMessage({ title: 'Could not share', description: 'Try again in a bit.' })
    }
  }

  const FollowIcon = relationshipState === 'following' ? Check : relationshipState === 'pending' ? Clock : UserPlus

  return (
    <Page>
      {isLoading && !loadedProfile ? (
        <div className="flex items-center gap-4" aria-label="Loading profile">
          <Skeleton className="h-[88px] w-[88px] !rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
      ) : null}

      {notFound ? (
        <Empty title="Profile not found." description="Baka mali ang username. Try searching for them." action={<Button variant="ink" href="/find-friends">Find friends</Button>} />
      ) : errorMessage ? (
        <Empty title="Hindi ma-load ang profile." description={<span role="alert">{errorMessage}</span>} />
      ) : loadedProfile ? (
        <>
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
            <div className="flex min-w-0 gap-4 lg:gap-6">
              <ProfileAvatar profile={loadedProfile} size="xl" />
              <div className="min-w-0 flex-1">
                <h1 className="g-h1 truncate">{getDisplayName(loadedProfile)}</h1>
                <p className="g-sm g-mut mt-1 flex items-center gap-2">
                  <span className="truncate">@{loadedProfile.username}</span>
                  {!loadedProfile.is_public ? (
                    <Tag>
                      <Lock aria-hidden="true" />
                      Private
                    </Tag>
                  ) : null}
                  {relationshipState === 'self' ? <Tag tone="tara">Your public view</Tag> : null}
                </p>
                <p className="mt-2 max-w-[60ch]">{loadedProfile.bio || 'No bio yet.'}</p>
              </div>
            </div>

            <div className="g-stats">
              <button type="button" className="g-stat text-left" onClick={() => void openList('followers')} disabled={!canOpenFollowLists}>
                <b>{loadedProfile.followers_count}</b>
                <span>Followers</span>
              </button>
              <button type="button" className="g-stat text-left" onClick={() => void openList('following')} disabled={!canOpenFollowLists}>
                <b>{loadedProfile.following_count}</b>
                <span>Following</span>
              </button>
              <div className="g-stat">
                <b>{plans.length}</b>
                <span>{plans.length === 1 ? 'Plan' : 'Plans'}</span>
              </div>
            </div>
          </section>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {relationshipState === 'self' ? (
              <Button variant="line" size="sm" href="/account-settings">
                <Settings aria-hidden="true" />
                Edit profile
              </Button>
            ) : (
              <Button variant={relationshipState === 'following' || relationshipState === 'pending' ? 'line' : 'tara'} size="sm" onClick={() => void handleFollow()}>
                <FollowIcon aria-hidden="true" />
                {RELATIONSHIP_LABELS[relationshipState]}
              </Button>
            )}
            <Button variant="soft" size="sm" iconOnly aria-label="Share profile" onClick={() => void handleShare()}>
              <Share2 aria-hidden="true" />
            </Button>
          </div>

          {notice ? (
            <p role="status" className="g-sm mt-4 rounded-[var(--r-2)] px-3 py-2" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
              {notice}
            </p>
          ) : null}

          <SectionHead title="Plans" sub={plans.length ? `${plans.length} public ${plans.length === 1 ? 'plan' : 'plans'}` : undefined} />

          {lockedMessage ? (
            <Empty title="This profile is private." description={lockedMessage} />
          ) : plans.length === 0 ? (
            <Empty title="Wala pang public plans." description={relationshipState === 'self' ? 'Make a plan public so it shows up here.' : 'Check back soon.'} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const placeCount = plan.places_count ?? 0
                return (
                  <PlanCard
                    key={plan.id}
                    href={`/u/${encodeURIComponent(loadedProfile.username)}/plans/${encodeURIComponent(plan.slug)}`}
                    title={plan.title}
                    imageUrl={plan.preview_places?.[0]?.image_url}
                    meta={`${placeCount} ${placeCount === 1 ? 'stop' : 'stops'}${plan.hearts_count ? ` · ${plan.hearts_count} ♥` : ''}`}
                  />
                )
              })}
            </div>
          )}
        </>
      ) : null}

      <FollowListSheet title={listTitle} users={listUsers} emptyLabel="This list is private." onClose={() => setListUsers(null)} />
    </Page>
  )
}

export default PublicProfilePage
