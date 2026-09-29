import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import { AppIcon } from '../components/AppIcon'
import ProfileAvatar from '../components/ProfileAvatar'
import { PageContainer, PageShell, CardSurface, Stack } from '../components/layout/ResponsiveLayouts'
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
import { FormSkeleton } from '../components/loading/SkeletonStates'
import { getSupabaseAccessToken } from '../supabase'

type PublicProfilePageProps = {
  username: string
}

function PublicProfilePage({ username }: PublicProfilePageProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [relationshipState, setRelationshipState] = useState<RelationshipState>('not_following')
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [listTitle, setListTitle] = useState('')
  const [listUsers, setListUsers] = useState<FollowListUser[] | null>(null)
  const loadedProfile = profile?.username.toLowerCase() === username.toLowerCase() ? profile : null
  const canOpenFollowLists = relationshipState === 'self' || Boolean(loadedProfile?.is_public)

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        setIsLoading(true)
        setProfile(null)
        setNotFound(false)
        setErrorMessage('')
        setNotice('')
        setRelationshipState('not_following')
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

  return (
    <PageShell>
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="wide" className="profile-page-container">
          <div className="mb-5">
            <MinimalBackNav to="/home" label="Home" preferHistory={false} className="hidden sm:inline-flex" />
          </div>

          {isLoading && !loadedProfile ? <FormSkeleton rows={4} /> : null}
          {notFound ? (
            <CardSurface pad="loose" className="text-center">
              <h1 className="text-2xl font-black text-slate-950">Profile not found.</h1>
            </CardSurface>
          ) : errorMessage ? (
            <CardSurface pad="loose" className="text-center text-sm font-bold text-red-700">{errorMessage}</CardSurface>
          ) : isLoading && !loadedProfile ? null : loadedProfile ? (
            <Stack gap="loose">
              <CardSurface pad="loose" className="profile-summary-card">
                <div className="profile-summary-header">
                  <div className="profile-summary-identity">
                    <div className="shrink-0">
                      <ProfileAvatar profile={loadedProfile} size="lg" />
                    </div>
                    <div className="profile-summary-copy">
                      <div className="profile-summary-meta">
                        <span className="profile-summary-chip">
                          <AppIcon name={loadedProfile.is_public ? 'eye' : 'lock'} className="h-3.5 w-3.5" />
                          {relationshipState === 'self' ? 'Your public view' : loadedProfile.is_public ? 'Public profile' : 'Private profile'}
                        </span>
                        <span className="profile-summary-state"><span aria-hidden="true" />{relationshipState === 'self' ? 'You' : relationshipState === 'following' ? 'Connected' : relationshipState === 'pending' ? 'Pending request' : 'Visitor mode'}</span>
                      </div>
                      <h1 className="profile-summary-title">{getDisplayName(loadedProfile)}</h1>
                      <p className="profile-summary-username">@{loadedProfile.username}</p>
                      <p className="profile-summary-bio">
                        {loadedProfile.bio || 'No bio yet.'}
                      </p>
                    </div>
                  </div>
                  <div className="profile-summary-actions">
                    <button
                      type="button"
                      onClick={() => relationshipState === 'self' ? navigateToPath('/account-settings') : void handleFollow()}
                      className={`app-button app-button-md ${
                        relationshipState === 'following'
                          ? 'app-button-secondary'
                        : relationshipState === 'pending'
                            ? 'app-button-warning'
                            : relationshipState === 'self'
                              ? 'app-button-secondary'
                              : 'app-button-primary'
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
                  </div>
              </div>

              <div className="profile-summary-stats">
                <button
                  type="button"
                  onClick={() => {
                    if (canOpenFollowLists) {
                      void openList('followers')
                    }
                  }}
                  disabled={!canOpenFollowLists}
                  className={`profile-summary-stat ${canOpenFollowLists ? '' : 'profile-summary-stat-disabled'}`}
                >
                  <span>{loadedProfile.followers_count}</span>
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
                  className={`profile-summary-stat ${canOpenFollowLists ? '' : 'profile-summary-stat-disabled'}`}
                >
                  <span>{loadedProfile.following_count}</span>
                  <span>Following</span>
                </button>
              </div>

              {notice ? <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{notice}</p> : null}

            </CardSurface>
            </Stack>
          ) : null}

        {listUsers ? (
          <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-slate-950/35 px-4">
            <section className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-slate-950">{listTitle}</h2>
                <button type="button" onClick={() => setListUsers(null)} className="h-9 rounded-full border border-[var(--line)] px-3 text-sm font-black">Close</button>
              </div>
              {listUsers.length === 0 ? <p className="mt-4 text-sm font-bold text-[var(--muted)]">This list is private.</p> : null}
              <div className="mt-4 grid gap-2 max-h-[20rem] overflow-y-auto pr-1">
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

        </PageContainer>
      </main>
    </PageShell>
  )
}

export default PublicProfilePage
