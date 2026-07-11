import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/MinimalBackNav'
import { AppIcon } from '../components/AppIcon'
import ProfileAvatar from '../components/ProfileAvatar'
import ReportUserModal from '../components/ReportUserModal'
import { PageContainer, PageShell, CardSurface, Stack } from '../components/layout/ResponsiveLayouts'
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
  type PublicProfile,
  type RelationshipState,
} from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'
import { getMyUserReports } from '../utils/userReportsApi'

type PublicProfilePageProps = {
  username: string
}

function PublicProfilePage({ username }: PublicProfilePageProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [relationshipState, setRelationshipState] = useState<RelationshipState>('not_following')
  const [isLoading, setIsLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [listTitle, setListTitle] = useState('')
  const [listUsers, setListUsers] = useState<FollowListUser[] | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const [isReportUserOpen, setIsReportUserOpen] = useState(false)
  const [reportedUserIds, setReportedUserIds] = useState<Set<string>>(new Set())
  const profileForView = profile ?? {
    user_id: '',
    username,
    display_name: username,
    avatar_url: null,
    provider_avatar_url: null,
    bio: '',
    is_public: true,
    followers_count: 0,
    following_count: 0,
  }
  const canOpenFollowLists = relationshipState === 'self' || Boolean(profile?.is_public)
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  const { showSystemMessage } = useSystemMessage()

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        setNotFound(false)
        setErrorMessage('')
        setNotice('')
        const data = await getPublicProfile(username)

        if (!isMounted) return
        setProfile(data.profile)
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
    <PageShell>
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="wide">
          <div className="mb-5">
            <MinimalBackNav to="/" label="Home" preferHistory={false} />
          </div>

          {isLoading ? <p className="text-sm text-[var(--muted)]">Refreshing profile...</p> : null}
          {notFound ? (
            <CardSurface pad="loose" className="text-center">
              <h1 className="text-2xl font-black text-slate-950">Profile not found.</h1>
            </CardSurface>
          ) : errorMessage ? (
            <CardSurface pad="loose" className="text-center text-sm font-bold text-red-700">{errorMessage}</CardSurface>
          ) : (
            <Stack gap="loose">
              <CardSurface pad="loose" className="rounded-[32px]">
              <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                    <div>
                      <ProfileAvatar profile={profileForView} size="lg" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chip)] px-3 py-1 text-[var(--accent-deep)]">
                          <AppIcon name={profileForView.is_public ? 'eye' : 'lock'} className="h-3.5 w-3.5" />
                          {relationshipState === 'self' ? 'Your public view' : profileForView.is_public ? 'Public profile' : 'Private profile'}
                        </span>
                        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />{relationshipState === 'self' ? 'You' : relationshipState === 'following' ? 'Connected' : relationshipState === 'pending' ? 'Pending request' : 'Visitor mode'}</span>
                      </div>
                      <h1 className="mt-3 truncate text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">{getDisplayName(profileForView)}</h1>
                      <p className="mt-1 text-sm font-black text-slate-500">@{profileForView.username}</p>
                      <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
                        {profileForView.bio || 'No bio yet.'}
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
                              disabled={reportedUserIds.has(profileForView.user_id)}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                              <AppIcon name="reports" className="h-4 w-4" />
                              {reportedUserIds.has(profileForView.user_id) ? 'Already reported' : 'Report user'}
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
                  <span className="text-lg font-black text-slate-950">{profileForView.followers_count}</span>
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
                  <span className="text-lg font-black text-slate-950">{profileForView.following_count}</span>
                  <span>Following</span>
                </button>
              </div>

              {notice ? <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{notice}</p> : null}

            </CardSurface>
            </Stack>
          )}

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
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default PublicProfilePage

