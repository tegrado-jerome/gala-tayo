import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import ProfileAvatar from '../components/ProfileAvatar'
import ReportUserModal from '../components/ReportUserModal'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import { useSystemMessage } from '../context/SystemMessageContext'
import { getSupabaseAccessToken, getSupabaseSession, supabase } from '../supabase'
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
import { buildPublicGalaPlanShareUrl, shareLink } from '../utils/share'
import { getMyUserReports } from '../utils/userReportsApi'

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
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const [isReportUserOpen, setIsReportUserOpen] = useState(false)
  const [reportedUserIds, setReportedUserIds] = useState<Set<string>>(new Set())
  const canOpenFollowLists = relationshipState === 'self' || Boolean(profile?.is_public)
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  const { showSystemMessage } = useSystemMessage()

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

  useEffect(() => {
    let isMounted = true

    const syncAuthState = async () => {
      const session = await getSupabaseSession()
      const token = await getSupabaseAccessToken(session)

      if (!isMounted) return

      setAuthToken(token)

      if (!token) {
        setReportedUserIds(new Set())
        return
      }

      try {
        const reports = await getMyUserReports(token)

        if (!isMounted) return

        setReportedUserIds(new Set(reports.map((report) => report.reported_user_id)))
      } catch {
        if (isMounted) {
          setReportedUserIds(new Set())
        }
      }
    }

    void syncAuthState()

    const { data: authSubscription } = supabase.auth.onAuthStateChange(() => {
      void syncAuthState()
    })

    return () => {
      isMounted = false
      authSubscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isActionsOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setIsActionsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsActionsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isActionsOpen])

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

  const handleOpenReportUser = () => {
    setIsActionsOpen(false)

    if (!profile) return

    if (!authToken) {
      showSystemMessage({
        title: 'Login required',
        description: 'Log in to report a user.',
      })
      return
    }

    setIsReportUserOpen(true)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-10">
        {isLoading ? (
          <UnifiedLoadingState
            title="Preparing profile..."
            message="We are loading this public profile now."
          />
        ) : notFound ? (
          <section className="rounded-[28px] border border-[var(--line)] bg-white/85 p-8 text-center backdrop-blur-sm">
            <h1 className="text-2xl font-black text-slate-950">Profile not found.</h1>
          </section>
        ) : errorMessage ? (
          <section className="rounded-[28px] border border-[var(--line)] bg-white/85 p-8 text-center text-sm font-bold text-red-700 backdrop-blur-sm">{errorMessage}</section>
        ) : profile ? (
          <div className="grid gap-8">
            <section className="rounded-[32px] border border-[var(--line)] bg-white px-5 py-6 sm:px-7">
              <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                    <div>
                      <ProfileAvatar profile={profile} size="lg" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chip)] px-3 py-1 text-[var(--accent-deep)]">
                          <AppIcon name={profile.is_public ? 'eye' : 'lock'} className="h-3.5 w-3.5" />
                          {relationshipState === 'self' ? 'Your public view' : profile.is_public ? 'Public profile' : 'Private profile'}
                        </span>
                        <span>{relationshipState === 'self' ? 'Owner mode' : relationshipState === 'following' ? 'Connected' : relationshipState === 'pending' ? 'Pending request' : 'Visitor mode'}</span>
                      </div>
                      <h1 className="mt-3 truncate text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">{getDisplayName(profile)}</h1>
                      <p className="mt-1 text-sm font-black text-slate-500">@{profile.username}</p>
                      <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
                        {profile.bio || 'No bio yet.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => relationshipState === 'self' ? navigateToPath('/profile') : void handleFollow()}
                      className={`inline-flex h-11 w-fit items-center gap-2 rounded-full px-5 text-sm font-black transition ${
                        relationshipState === 'following'
                          ? 'border border-slate-300 bg-white text-slate-950 hover:bg-slate-50'
                          : relationshipState === 'pending'
                            ? 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            : 'bg-slate-950 text-white hover:bg-slate-800'
                      }`}
                    >
                      <AppIcon
                        name={
                          relationshipState === 'self'
                              ? 'settings'
                            : relationshipState === 'following'
                              ? 'check'
                              : relationshipState === 'pending'
                                ? 'history'
                                : 'profile'
                        }
                        className="h-4 w-4"
                      />
                      {relationshipState === 'self' ? 'Edit profile' : relationshipState === 'following' ? 'Following' : relationshipState === 'pending' ? 'Requested' : 'Follow'}
                    </button>

                    {relationshipState !== 'self' ? (
                      <div className="relative" ref={actionsMenuRef}>
                        <button
                          type="button"
                          aria-label="Open profile actions"
                          aria-haspopup="menu"
                          aria-expanded={isActionsOpen}
                          onClick={() => setIsActionsOpen((current) => !current)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <MoreHorizontal className="h-5 w-5" strokeWidth={2.2} />
                        </button>

                        {isActionsOpen ? (
                          <div
                            role="menu"
                            className="absolute right-0 top-12 z-20 min-w-[12rem] overflow-hidden rounded-2xl border border-[var(--line)] bg-white py-1 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={handleOpenReportUser}
                              disabled={reportedUserIds.has(profile.user_id)}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                              <AppIcon name="reports" className="h-4 w-4" />
                              {reportedUserIds.has(profile.user_id) ? 'Already reported' : 'Report user'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-3 pt-4 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (canOpenFollowLists) {
                      void openList('followers')
                    }
                  }}
                  disabled={!canOpenFollowLists}
                  className={`inline-flex items-center gap-2 font-semibold transition ${canOpenFollowLists ? 'text-slate-600 hover:text-slate-950' : 'cursor-default text-slate-500'}`}
                >
                  <span className="text-lg font-black text-slate-950">{profile.followers_count}</span>
                  <span>Followers</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (canOpenFollowLists) {
                      void openList('following')
                    }
                  }}
                  disabled={!canOpenFollowLists}
                  className={`inline-flex items-center gap-2 font-semibold transition ${canOpenFollowLists ? 'text-slate-600 hover:text-slate-950' : 'cursor-default text-slate-500'}`}
                >
                  <span className="text-lg font-black text-slate-950">{profile.following_count}</span>
                  <span>Following</span>
                </button>
                {isLocked ? (
                  <span className="inline-flex items-center gap-2 font-semibold text-slate-600">
                    <AppIcon name="lock" className="h-4 w-4 text-slate-400" />
                    Locked for followers
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-2 font-semibold text-slate-600">
                  <AppIcon name="galaPlan" className="h-4 w-4 text-slate-400" />
                  {isLocked ? 0 : plans.length} visible plans
                </span>
              </div>

              {notice ? <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{notice}</p> : null}

            </section>

            <section>
              <div className="border-b border-[var(--line)] px-1 pt-1">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Plans</p>
                    <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-950">Gala Plans</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Shared itineraries in a cleaner feed view.</p>
                  </div>
                  <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-600 sm:inline-flex">
                    {isLocked ? 0 : plans.length} visible
                  </span>
                </div>
                <div className="mt-5 flex items-center gap-6 text-sm font-black text-slate-900">
                  <span className="relative inline-flex pb-3">
                    Plans
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-slate-950" />
                  </span>
                </div>
              </div>
              {isLocked ? (
                <div className="px-1 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <AppIcon name="lock" className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-base font-black text-slate-950">Plans are private</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">Follow this profile to request access to shared gala plans.</p>
                </div>
              ) : plans.length === 0 ? (
                <div className="px-1 py-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <AppIcon name="galaPlan" className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-base font-black text-slate-950">No visible gala plans yet</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">When this user shares plans publicly, they’ll show up here like a simple social feed.</p>
                </div>
              ) : (
                <div>
                  {plans.map((plan) => {
                    const parsedDescription = parseGalaPlanDescription(plan.description)

                    return (
                      <article key={plan.id} className="border-b border-[var(--line)] px-1 py-5 last:border-b-0">
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                            <AppIcon name="galaPlan" className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                              <span>{getDisplayName(profile)}</span>
                              <span className="text-slate-300">•</span>
                              <span>{formatGalaPlanDate(plan.description)}</span>
                              <span className="text-slate-300">•</span>
                              <span>{plan.places_count} {plan.places_count === 1 ? 'place' : 'places'}</span>
                            </div>
                            <h3 className="mt-2 text-lg font-black leading-tight text-slate-950">{plan.title}</h3>
                            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                              {parsedDescription.description || 'A GalaTayo plan.'}
                            </p>
                            {plan.preview_places.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-slate-500">
                                {plan.preview_places.map((place) => (
                                  <span key={`${plan.id}-${place.id}`} className="inline-flex items-center gap-1.5">
                                    <AppIcon name="place" className="h-3.5 w-3.5 text-slate-400" />
                                    {place.name}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                          <button type="button" onClick={() => navigateToPath(`/u/${encodeURIComponent(profile.username)}/gala/${encodeURIComponent(plan.slug)}`)} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-black text-slate-700 transition hover:bg-slate-100">
                            <AppIcon name="arrowRight" className="h-4 w-4" />
                            View plan
                          </button>
                          {relationshipState !== 'self' ? (
                            <button
                              type="button"
                              onClick={() => void toggleHeart(plan)}
                              className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-black transition ${
                                plan.viewer_has_hearted
                                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <AppIcon name="favorites" className={`h-4 w-4 ${plan.viewer_has_hearted ? 'fill-current text-rose-600' : 'text-slate-500'}`} />
                              {plan.hearts_count}
                            </button>
                          ) : (
                            <span className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-black text-slate-500">
                              <AppIcon name="favorites" className="h-4 w-4" />
                              {plan.hearts_count} hearts
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              void shareLink({
                                url: buildPublicGalaPlanShareUrl(profile.username, plan.slug),
                                title: plan.title,
                                text: plan.title,
                              })
                            }
                            className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                          >
                            <AppIcon name="share" className="h-4 w-4" />
                            Share
                          </button>
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
            <section className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-slate-950">{listTitle}</h2>
                <button type="button" onClick={() => setListUsers(null)} className="h-9 rounded-full border border-[var(--line)] px-3 text-sm font-black">Close</button>
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
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-3 py-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--chip)]"
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

        <ReportUserModal
          isOpen={isReportUserOpen && Boolean(profile) && relationshipState !== 'self'}
          userId={profile && relationshipState !== 'self' ? profile.user_id : null}
          username={profile?.username}
          displayName={profile ? getDisplayName(profile) : null}
          authToken={authToken}
          onClose={() => setIsReportUserOpen(false)}
          onSubmitted={({ reportedUserId, alreadyReported, message }) => {
            setReportedUserIds((current) => new Set([...current, reportedUserId]))
            showSystemMessage({
              title: alreadyReported ? 'Already reported' : 'Report submitted',
              description: message,
            })
          }}
        />
      </main>
    </div>
  )
}

export default PublicProfilePage

