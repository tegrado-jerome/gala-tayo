import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import ProfileAvatar from '../components/ProfileAvatar'
import { updateAccountPassword } from '../services/authApi'
import {
  getFollowers,
  getFollowing,
  getFollowRequests,
  getMyProfile,
  normalizeUsername,
  respondToFollowRequest,
  type FollowListUser,
  type FollowRequest,
  type Profile,
  updateMyProfile,
  validateUsername,
} from '../utils/profileApi'
import { navigateToPath } from '../utils/navigation'

type ProfilePageProps = {
  session: Session
}

function ProfilePage({ session }: ProfilePageProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [bioInput, setBioInput] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [showFollowers, setShowFollowers] = useState<Profile['show_followers']>('everyone')
  const [showFollowing, setShowFollowing] = useState<Profile['show_following']>('everyone')
  const [defaultPlanVisibility, setDefaultPlanVisibility] = useState<Profile['default_gala_plan_visibility']>('private')
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([])
  const [listTitle, setListTitle] = useState('')
  const [listUsers, setListUsers] = useState<FollowListUser[] | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [securityMessage, setSecurityMessage] = useState('')
  const [securityError, setSecurityError] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  const normalizedUsername = useMemo(() => normalizeUsername(usernameInput), [usernameInput])
  const usernameError = normalizedUsername ? validateUsername(normalizedUsername) : 'Username is required.'

  useEffect(() => {
    let isMounted = true

    const loadProfile = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        const data = await getMyProfile(session)

        if (!isMounted) {
          return
        }

        if (data.profile) {
          setProfile(data.profile)
          setUsernameInput(data.profile.username ?? '')
          setBioInput(data.profile.bio ?? '')
          setIsPublic(data.profile.is_public)
          setShowFollowers(data.profile.show_followers ?? 'everyone')
          setShowFollowing(data.profile.show_following ?? 'everyone')
          setDefaultPlanVisibility(data.profile.default_gala_plan_visibility ?? 'private')
        }
        const requestsData = await getFollowRequests(session).catch(() => ({ requests: [] }))
        if (isMounted) {
          setFollowRequests(requestsData.requests)
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load profile.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      isMounted = false
    }
  }, [session])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (usernameError) {
      setErrorMessage(usernameError)
      return
    }

    try {
      setIsSaving(true)
      setErrorMessage('')
      setSaveMessage('')
      const data = await updateMyProfile(
        {
          username: normalizedUsername,
          bio: bioInput.trim() || null,
          is_public: isPublic,
          show_followers: showFollowers,
          show_following: showFollowing,
          default_gala_plan_visibility: defaultPlanVisibility,
        },
        session,
      )

      if (data.profile) {
        setProfile(data.profile)
        setUsernameInput(data.profile.username ?? '')
        setBioInput(data.profile.bio ?? '')
        setIsPublic(data.profile.is_public)
        setShowFollowers(data.profile.show_followers ?? 'everyone')
        setShowFollowing(data.profile.show_following ?? 'everyone')
        setDefaultPlanVisibility(data.profile.default_gala_plan_visibility ?? 'private')
      }
      setIsEditing(false)
      setSaveMessage('Profile updated.')
    } catch (error) {
      const status = (error as Error & { status?: number }).status
      setErrorMessage(
        status === 409
          ? 'That username is taken. Try another one.'
          : error instanceof Error
            ? error.message
            : 'Failed to update profile.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleFollowRequest = async (requestId: string, action: 'accept' | 'reject') => {
    setFollowRequests((requests) => requests.filter((request) => request.id !== requestId))
    await respondToFollowRequest(requestId, action, session).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update request.')
    })
  }

  const openList = async (kind: 'followers' | 'following') => {
    if (!profile?.username) return

    try {
      setListTitle(kind === 'followers' ? 'Followers' : 'Following')
      const data = kind === 'followers' ? await getFollowers(profile.username) : await getFollowing(profile.username)
      setListUsers(data.users)
    } catch (error) {
      setListTitle(kind === 'followers' ? 'Followers' : 'Following')
      setListUsers([])
      setErrorMessage(error instanceof Error ? error.message : `Failed to load ${kind}.`)
    }
  }

  const handleUpdatePassword = async () => {
    if (newPassword.length < 8) {
      setSecurityError('Use a stronger password with at least 8 characters.')
      setSecurityMessage('')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setSecurityError('Passwords do not match.')
      setSecurityMessage('')
      return
    }

    try {
      setIsSavingPassword(true)
      setSecurityError('')
      setSecurityMessage('')
      await updateAccountPassword(newPassword)
      setNewPassword('')
      setConfirmNewPassword('')
      setSecurityMessage('Password updated. You can use email/password login for this account.')
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not update password. Please try again.')
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <AppHeader />
      <main className="mx-auto w-full max-w-[860px] px-4 py-6 sm:px-6 lg:py-10">
        <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-[0_18px_42px_rgba(47,116,232,0.1)] sm:p-7">
          {isLoading ? (
            <p className="text-sm font-semibold text-[var(--muted)]">Loading profile...</p>
          ) : profile ? (
            <>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <ProfileAvatar profile={profile} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-black text-slate-950">@{profile.username}</p>
                    <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                      {profile.is_public ? 'Public profile' : 'Private profile'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {profile.username ? (
                    <button
                      type="button"
                      onClick={() => navigateToPath(`/u/${encodeURIComponent(profile.username || '')}`)}
                      className="h-11 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-black text-[var(--accent-deep)] transition hover:bg-[var(--chip)]"
                    >
                      View public
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing((currentValue) => !currentValue)
                      setErrorMessage('')
                      setSaveMessage('')
                    }}
                    className="h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-black text-white transition hover:bg-[var(--accent-deep)]"
                  >
                    {isEditing ? 'Cancel' : 'Edit profile'}
                  </button>
                </div>
              </div>

              <p className="mt-6 max-w-2xl text-base font-semibold leading-7 text-slate-700">
                {profile.bio || 'No bio yet.'}
              </p>

              <div className="mt-4 flex flex-wrap gap-4">
                <button type="button" onClick={() => void openList('followers')} className="text-sm font-black text-slate-800">
                  {profile.followers_count ?? 0} Followers
                </button>
                <button type="button" onClick={() => void openList('following')} className="text-sm font-black text-slate-800">
                  {profile.following_count ?? 0} Following
                </button>
              </div>

              {isEditing ? (
                <form className="mt-7 grid gap-6 border-t border-[var(--line)] pt-6" onSubmit={handleSave}>
                  <section className="grid gap-4">
                    <h2 className="text-lg font-black text-slate-950">Profile Settings</h2>
                    <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Username</span>
                    <span className="flex h-12 items-center rounded-lg border border-[var(--line-strong)] bg-white px-4 focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-soft)]">
                      <span className="font-black text-[var(--accent-deep)]">@</span>
                      <input
                        value={usernameInput}
                        onChange={(event) => setUsernameInput(event.target.value.toLowerCase())}
                        className="min-w-0 flex-1 border-0 bg-transparent px-1 text-base font-black text-slate-950 outline-none"
                        autoCapitalize="none"
                        autoComplete="username"
                        spellCheck={false}
                      />
                    </span>
                    <span className={`text-xs font-semibold ${usernameError ? 'text-red-600' : 'text-[var(--muted)]'}`}>
                      {usernameError || 'This is how friends find you on GalaTayo.'}
                    </span>
                    </label>

                    <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Bio</span>
                    <textarea
                      value={bioInput}
                      onChange={(event) => setBioInput(event.target.value)}
                      className="min-h-28 resize-none rounded-lg border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-900 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                      maxLength={280}
                    />
                    </label>
                  </section>

                  <section className="grid gap-4">
                    <h2 className="text-lg font-black text-slate-950">Privacy Settings</h2>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-slate-900">Profile visibility</span>
                      <select value={isPublic ? 'public' : 'private'} onChange={(event) => setIsPublic(event.target.value === 'public')} className="h-12 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-black text-slate-950">
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                      <span className="text-xs font-semibold text-[var(--muted)]">
                        {isPublic ? 'Anyone can view your public profile.' : 'People need to request to follow you.'}
                      </span>
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-black text-slate-900">Show followers</span>
                        <select value={showFollowers} onChange={(event) => setShowFollowers(event.target.value as Profile['show_followers'])} className="h-12 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-black text-slate-950">
                          <option value="everyone">Everyone</option>
                          <option value="followers">Followers only</option>
                          <option value="only_me">Only me</option>
                        </select>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-black text-slate-900">Show following</span>
                        <select value={showFollowing} onChange={(event) => setShowFollowing(event.target.value as Profile['show_following'])} className="h-12 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-black text-slate-950">
                          <option value="everyone">Everyone</option>
                          <option value="followers">Followers only</option>
                          <option value="only_me">Only me</option>
                        </select>
                      </label>
                    </div>
                    <label className="grid gap-2">
                      <span className="text-sm font-black text-slate-900">Default gala plan visibility</span>
                      <select value={defaultPlanVisibility} onChange={(event) => setDefaultPlanVisibility(event.target.value as Profile['default_gala_plan_visibility'])} className="h-12 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-black text-slate-950">
                        <option value="private">Private</option>
                        <option value="followers">Followers only</option>
                        <option value="public">Public</option>
                        <option value="unlisted">Unlisted</option>
                      </select>
                      <span className="text-xs font-semibold text-[var(--muted)]">Unlisted plan: Anyone with the link can view, but it will not appear on your profile.</span>
                    </label>
                  </section>

                  <section className="grid gap-3">
                    <h2 className="text-lg font-black text-slate-950">Account/Security</h2>
                    <div className="grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--chip)] p-4">
                      <p className="text-sm font-semibold leading-6 text-[var(--muted)]">
                        Use this to add or update email/password login for this same GalaTayo account.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2">
                          <span className="text-sm font-black text-slate-900">New password</span>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(event) => setNewPassword(event.target.value)}
                            minLength={8}
                            autoComplete="new-password"
                            className="h-12 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="text-sm font-black text-slate-900">Confirm password</span>
                          <input
                            type="password"
                            value={confirmNewPassword}
                            onChange={(event) => setConfirmNewPassword(event.target.value)}
                            minLength={8}
                            autoComplete="new-password"
                            className="h-12 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                          />
                        </label>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={() => void handleUpdatePassword()}
                          disabled={isSavingPassword || !newPassword || !confirmNewPassword}
                          className="h-11 rounded-lg bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isSavingPassword ? 'Updating password...' : 'Set password'}
                        </button>
                        {securityMessage ? <span className="text-sm font-bold text-emerald-700">{securityMessage}</span> : null}
                        {securityError ? <span className="text-sm font-bold text-red-600">{securityError}</span> : null}
                      </div>
                    </div>
                  </section>

                  {errorMessage ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{errorMessage}</p> : null}

                  <button
                    type="submit"
                    disabled={Boolean(usernameError) || isSaving}
                    className="h-12 rounded-lg bg-[var(--accent)] px-5 text-sm font-black text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSaving ? 'Saving...' : 'Save profile'}
                  </button>
                </form>
              ) : null}

              {saveMessage ? <p className="mt-4 text-sm font-bold text-emerald-700">{saveMessage}</p> : null}

              <section className="mt-7 border-t border-[var(--line)] pt-6">
                <h2 className="text-lg font-black text-slate-950">Follow Requests</h2>
                {followRequests.length === 0 ? (
                  <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
                    {profile.is_public ? 'No pending requests. Public profiles accept followers automatically.' : 'No pending requests.'}
                  </p>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {followRequests.map((request) => (
                      <article key={request.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">@{request.follower.username}</p>
                          <p className="truncate text-xs font-semibold text-[var(--muted)]">{request.follower.bio || 'Wants to follow you.'}</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void handleFollowRequest(request.id, 'accept')} className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-black text-white">Accept</button>
                          <button type="button" onClick={() => void handleFollowRequest(request.id, 'reject')} className="h-9 rounded-lg border border-[var(--line)] px-3 text-xs font-black text-slate-700">Reject</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <p className="text-sm font-semibold text-red-700">{errorMessage || 'Profile unavailable.'}</p>
          )}
        </section>

        {listUsers ? (
          <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-slate-950/35 px-4">
            <section className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-slate-950">{listTitle}</h2>
                <button type="button" onClick={() => setListUsers(null)} className="h-9 rounded-lg border border-[var(--line)] px-3 text-sm font-black">Close</button>
              </div>
              {listUsers.length === 0 ? <p className="mt-4 text-sm font-bold text-[var(--muted)]">No users yet.</p> : null}
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

export default ProfilePage
