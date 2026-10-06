import { useEffect, useState } from 'react'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { Lock } from '@phosphor-icons/react/dist/csr/Lock'
import { GearSix as Settings } from '@phosphor-icons/react/dist/csr/GearSix'
import { ShareNetwork as Share2 } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { UserPlus } from '@phosphor-icons/react/dist/csr/UserPlus'
import ProfileAvatar from '../components/ProfileAvatar'
import { Button, Empty, Page, Skeleton, Tag } from '../components/ui'
import { FollowListSheet, PlanTile, joinedLabel } from './ProfilePage'
import { getPlacePhoto } from '../utils/placePhoto'
import '../design/me.css'
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
      await shareLink({ url: `${getPublicSiteOrigin()}/u/${encodeURIComponent(loadedProfile.username)}`, title: `@${loadedProfile.username} on GalaTayo`, contentType: 'profile' })
      if (!canNativeShare) showSystemMessage({ title: 'Link copied', description: 'The profile link is ready to paste.' })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') showSystemMessage({ title: 'Could not share', description: 'Try again in a bit.' })
    }
  }

  const displayName = loadedProfile ? loadedProfile.display_name?.trim() || getDisplayName(loadedProfile) : ''
  const firstName = displayName.split(/\s+/)[0]
  const joined = joinedLabel(loadedProfile?.created_at)
  const FollowIcon = relationshipState === 'following' ? Check : relationshipState === 'pending' ? Clock : UserPlus

  return (
    <Page>
      {isLoading && !loadedProfile ? (
        <div className="me-card mx-auto max-w-[520px]" aria-label="Loading profile">
          <div className="me-id">
            <Skeleton className="h-24 w-24 !rounded-full" />
            <Skeleton className="mt-3 h-5 w-32" />
          </div>
          <div className="grid gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      ) : null}

      {notFound ? (
        <Empty title="Profile not found." description="The username may be wrong. Try searching for them." action={<Button variant="tara" href="/find-friends">Find friends</Button>} />
      ) : errorMessage ? (
        <Empty title="Couldn't load the profile." description={<span role="alert">{errorMessage}</span>} />
      ) : loadedProfile ? (
        <div className="grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-16">
          <aside className="min-w-0 lg:sticky lg:top-24">
            <section className="me-card" aria-label={`${displayName} profile`}>
              <div className="me-id">
                <ProfileAvatar profile={loadedProfile} size="xxl" />
                <h1 className="g-h2">{displayName}</h1>
                <p className="me-id-sub">
                  <span className="truncate">@{loadedProfile.username}</span>
                  {loadedProfile.is_public ? null : (
                    <Tag className="shrink-0">
                      <Lock aria-hidden="true" />
                      Private
                    </Tag>
                  )}
                </p>
                {joined ? <p className="g-xs g-fnt mt-1">{joined}</p> : null}
              </div>
              <div className="me-nums">
                <button type="button" className="me-num" onClick={() => void openList('followers')} disabled={!canOpenFollowLists}>
                  <b>{loadedProfile.followers_count}</b>
                  <span>{loadedProfile.followers_count === 1 ? 'Follower' : 'Followers'}</span>
                </button>
                <button type="button" className="me-num" onClick={() => void openList('following')} disabled={!canOpenFollowLists}>
                  <b>{loadedProfile.following_count}</b>
                  <span>Following</span>
                </button>
                <div className="me-num">
                  <b>{lockedMessage ? '–' : plans.length}</b>
                  <span>{plans.length === 1 ? 'Public plan' : 'Public plans'}</span>
                </div>
              </div>
            </section>

            {loadedProfile.bio ? <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed">{loadedProfile.bio}</p> : null}
            {relationshipState === 'self' ? (
              <p className="mt-3">
                <Tag tone="sea">Your public view</Tag>
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              {relationshipState === 'self' ? (
                <Button variant="line" block href="/account-settings">
                  <Settings aria-hidden="true" />
                  Edit profile
                </Button>
              ) : (
                <Button variant={relationshipState === 'following' || relationshipState === 'pending' ? 'line' : 'tara'} block onClick={() => void handleFollow()}>
                  <FollowIcon aria-hidden="true" />
                  {RELATIONSHIP_LABELS[relationshipState]}
                </Button>
              )}
              <Button variant="line" block onClick={() => void handleShare()}>
                <Share2 aria-hidden="true" />
                Share
              </Button>
            </div>

            {notice ? (
              <p role="status" className="me-note">
                {notice}
              </p>
            ) : null}
          </aside>

          <section className="min-w-0" aria-labelledby="public-plans-title">
            <h2 id="public-plans-title" className="g-h2">{relationshipState === 'self' ? 'Your public plans' : `${firstName}’s plans`}</h2>
            <p className="g-sm g-mut mt-1 mb-4">
              {lockedMessage ? 'Follow to see their plans.' : plans.length ? `${plans.length} public ${plans.length === 1 ? 'plan' : 'plans'}` : 'Shared plans show up here.'}
            </p>

            {lockedMessage ? (
              <Empty title="This profile is private." description={lockedMessage} />
            ) : plans.length === 0 ? (
              relationshipState === 'self' ? (
                <Empty title="No public plans yet." description="Make a plan public so it shows up here." />
              ) : (
                <Empty title={`${firstName} hasn't shared a plan yet.`} description="Follow them to catch the next one." />
              )
            ) : (
              <div className="me-tiles">
                {plans.map((plan) => {
                  const placeCount = plan.places_count ?? 0
                  return (
                    <PlanTile
                      key={plan.id}
                      href={`/u/${encodeURIComponent(loadedProfile.username)}/plans/${encodeURIComponent(plan.slug)}`}
                      title={plan.title}
                      imageUrl={plan.preview_places?.[0] ? getPlacePhoto({ slug: plan.preview_places[0].slug, photo_url: plan.preview_places[0].image_url }) : null}
                      meta={`${placeCount} ${placeCount === 1 ? 'stop' : 'stops'}${plan.hearts_count ? ` · ${plan.hearts_count} ${plan.hearts_count === 1 ? 'heart' : 'hearts'}` : ''}`}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
      ) : null}

      <FollowListSheet title={listTitle} users={listUsers} emptyLabel="This list is private." onClose={() => setListUsers(null)} />
    </Page>
  )
}

export default PublicProfilePage
