import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import ProfileAvatar from '../components/ProfileAvatar'
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
import { navigateToPath } from '../utils/navigation'
import { formatGalaPlanDate, parseGalaPlanDescription } from '../utils/galaPlanDescription'
import { heartGalaPlan, unheartGalaPlan } from '../utils/galaPlanHeartsApi'
import { shareGalaPlanLink } from '../utils/shareGalaPlan'

type PublicProfilePageProps = {
  username: string
}

function PublicProfilePage({ username }: PublicProfilePageProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [plans, setPlans] = useState<PublicGalaPlanSummary[]>([])
  const [relationshipState, setRelationshipState] = useState<RelationshipState>('not_following')
  const [isLocked, setIsLocked] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [listTitle, setListTitle] = useState('')
  const [listUsers, setListUsers] = useState<FollowListUser[] | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        setIsLoading(true)
        setNotFound(false)
        setErrorMessage('')
        setNotice('')
        const data = await getPublicProfile(username)

        if (!isMounted) return
        setProfile(data.profile)
        setPlans(data.plans)
        setRelationshipState(data.relationship_state)
        setIsLocked(data.locked)
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
        setProfile((current) => current ? { ...current, followers_count: data.followers_count } : current)
      } else {
        const nextState = profile.is_public ? 'following' : 'pending'
        setRelationshipState(nextState)
        if (nextState === 'following') {
          setProfile({ ...profile, followers_count: profile.followers_count + 1 })
        }
        const data = await followProfile(profile.username)
        setRelationshipState(data.relationship_state)
        setProfile((current) => current ? { ...current, followers_count: data.followers_count } : current)
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

  const toggleHeart = async (plan: PublicGalaPlanSummary) => {
    const previous = plan.viewer_has_hearted
    setPlans((currentPlans) => currentPlans.map((currentPlan) => currentPlan.id === plan.id ? {
      ...currentPlan,
      viewer_has_hearted: !previous,
      hearts_count: Math.max(0, currentPlan.hearts_count + (previous ? -1 : 1)),
    } : currentPlan))

    try {
      const data = previous ? await unheartGalaPlan(plan.id) : await heartGalaPlan(plan.id)
      setPlans((currentPlans) => currentPlans.map((currentPlan) => currentPlan.id === plan.id ? {
        ...currentPlan,
        viewer_has_hearted: data.viewer_has_hearted,
        hearts_count: data.hearts_count,
      } : currentPlan))
    } catch (error) {
      setPlans((currentPlans) => currentPlans.map((currentPlan) => currentPlan.id === plan.id ? plan : currentPlan))
      setNotice(error instanceof Error ? error.message : 'Log in to heart this gala plan.')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 lg:py-10">
        {isLoading ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-6 text-sm font-semibold text-[var(--muted)]">Loading profile...</section>
        ) : notFound ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-8 text-center">
            <h1 className="text-2xl font-black text-slate-950">Profile not found.</h1>
          </section>
        ) : errorMessage ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-8 text-center text-sm font-bold text-red-700">{errorMessage}</section>
        ) : profile ? (
          <div className="grid gap-5">
            <section className="rounded-lg border border-[var(--line)] bg-white p-6 shadow-[0_18px_42px_rgba(47,116,232,0.1)] sm:p-8">
              <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <ProfileAvatar profile={profile} size="lg" />
                  <div className="min-w-0">
                    <h1 className="truncate text-3xl font-black text-slate-950">{getDisplayName(profile)}</h1>
                    <p className="mt-1 text-sm font-black text-[var(--accent-deep)]">@{profile.username}</p>
                    <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-slate-700">{profile.bio || 'No bio yet.'}</p>
                    <div className="mt-4 flex flex-wrap gap-4">
                      <button type="button" onClick={() => void openList('followers')} className="text-sm font-black text-slate-800">{profile.followers_count} Followers</button>
                      <button type="button" onClick={() => void openList('following')} className="text-sm font-black text-slate-800">{profile.following_count} Following</button>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => relationshipState === 'self' ? navigateToPath('/profile') : void handleFollow()} className="h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white">
                  {relationshipState === 'self' ? 'Edit Profile' : relationshipState === 'following' ? 'Following' : relationshipState === 'pending' ? 'Requested' : 'Follow'}
                </button>
              </div>
              {notice ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{notice}</p> : null}
            </section>

            <section className="rounded-lg border border-[var(--line)] bg-white/75 p-6">
              <h2 className="text-lg font-black text-slate-950">Gala Plans</h2>
              {isLocked ? (
                <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--chip)] px-4 py-3 text-sm font-bold text-slate-700">
                  This profile is private. Follow to request access.
                </p>
              ) : plans.length === 0 ? (
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--muted)]">No visible gala plans yet.</p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {plans.map((plan) => {
                    const parsedDescription = parseGalaPlanDescription(plan.description)

                    return (
                      <article key={plan.id} className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(47,116,232,0.06)]">
                        <h3 className="text-lg font-black leading-tight text-slate-950">{plan.title}</h3>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{parsedDescription.description || 'A GalaTayo plan.'}</p>
                        <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                          {plan.places_count} {plan.places_count === 1 ? 'place' : 'places'} · {formatGalaPlanDate(plan.description)}
                        </p>
                        {plan.preview_places.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {plan.preview_places.map((place) => (
                              <span key={`${plan.id}-${place.id}`} className="rounded-full bg-[var(--chip)] px-2.5 py-1 text-xs font-bold text-[var(--accent-deep)]">{place.name}</span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => navigateToPath(`/u/${encodeURIComponent(profile.username)}/gala/${encodeURIComponent(plan.slug)}`)} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white">View plan</button>
                          {relationshipState !== 'self' ? (
                            <button type="button" onClick={() => void toggleHeart(plan)} className="h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-black">{plan.viewer_has_hearted ? '❤️' : '♡'} {plan.hearts_count}</button>
                          ) : (
                            <span className="inline-flex h-10 items-center rounded-lg border border-[var(--line)] px-3 text-sm font-black text-[var(--muted)]">{plan.hearts_count} hearts</span>
                          )}
                          <button type="button" onClick={() => void shareGalaPlanLink(profile.username, plan.slug, plan.title).then(setNotice)} className="h-10 rounded-lg border border-[var(--line)] px-3 text-sm font-black">Share</button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        ) : null}

        {listUsers ? (
          <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-slate-950/35 px-4">
            <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-slate-950">{listTitle}</h2>
                <button type="button" onClick={() => setListUsers(null)} className="h-9 rounded-lg border border-[var(--line)] px-3 text-sm font-black">Close</button>
              </div>
              {listUsers.length === 0 ? <p className="mt-4 text-sm font-bold text-[var(--muted)]">This list is private.</p> : null}
              <div className="mt-4 grid gap-2">
                {listUsers.map((user) => (
                  <button
                    key={user.user_id}
                    type="button"
                    onClick={() => {
                      setListUsers(null)
                      navigateToPath(`/u/${encodeURIComponent(user.username)}`)
                    }}
                    className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--line)] bg-white px-3 py-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--chip)]"
                  >
                    <ProfileAvatar profile={user} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-950">@{user.username}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--muted)]">
                        {user.bio || 'View profile'}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-black text-[var(--accent-deep)]">View</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default PublicProfilePage
