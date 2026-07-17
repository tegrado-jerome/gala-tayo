import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import MinimalBackNav from '../components/MinimalBackNav'
import { AppIcon } from '../components/AppIcon'
import PageHeroHeader from '../components/PageHeroHeader'
import ProfileAvatar from '../components/ProfileAvatar'
import { PageContainer, PageShell, CardSurface } from '../components/layout/ResponsiveLayouts'
import { useSystemMessage } from '../context/SystemMessageContext'
import { useAppUser } from '../context/AppUserContext'
import { updateAccountPassword } from '../services/authApi'
import {
  getDisplayAvatar,
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
import { preloadAvatarImage } from '../utils/avatarImageCache'
import { navigateToPath } from '../utils/navigation'
import { FormSkeleton } from '../components/loading/SkeletonStates'

type ProfilePageProps = {
  session: Session | null
}

const PROFILE_CACHE_PREFIX = 'galatayo:profile-page:'
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000

type ProfilePageCache = {
  profile: Profile
  followRequests: FollowRequest[]
  cachedAt: number
}

function getCacheKey(userId: string) {
  return `${PROFILE_CACHE_PREFIX}${userId}`
}

function readCache(userId: string): ProfilePageCache | null {
  try {
    const raw = localStorage.getItem(getCacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProfilePageCache>
    if (typeof parsed.cachedAt !== 'number' || Date.now() - parsed.cachedAt > PROFILE_CACHE_TTL_MS) {
      localStorage.removeItem(getCacheKey(userId))
      return null
    }
    return parsed as ProfilePageCache
  } catch {
    return null
  }
}

function writeCache(userId: string, cache: ProfilePageCache) {
  try {
    localStorage.setItem(getCacheKey(userId), JSON.stringify(cache))
  } catch {
    /* ignore */
  }
}

const planVisibilityLabel: Record<Profile['default_gala_plan_visibility'], string> = {
  private: 'Private',
  followers: 'Followers only',
  public: 'Public',
  unlisted: 'Unlisted',
}

let memCache: { profile: Profile; followRequests: FollowRequest[] } | null = null
let memCachedUserId: string | null = null

const guestProfile: Profile = {
  user_id: 'guest',
  username: 'guest',
  avatar_url: null,
  provider_avatar_url: null,
  bio: null,
  is_public: true,
  show_followers: 'everyone',
  show_following: 'everyone',
  default_gala_plan_visibility: 'private',
  followers_count: 0,
  following_count: 0,
  onboarding_completed_at: null,
  created_at: '',
  updated_at: '',
}

function ProfilePage({ session }: ProfilePageProps) {
  const { currentProfile } = useAppUser()
  const isGuestProfile = !session?.user?.id
  const cachedAtRender = useMemo(() => {
    if (memCache && memCachedUserId === session?.user?.id) {
      return memCache
    }
    if (!session?.user?.id) return null
    const ls = readCache(session.user.id)
    if (ls) {
      memCache = { profile: ls.profile, followRequests: ls.followRequests }
      memCachedUserId = session.user.id
      return memCache
    }
    return null
  }, [session?.user?.id])

  const [profile, setProfile] = useState<Profile | null>(() => {
    if (!session?.user?.id) return guestProfile
    if (cachedAtRender?.profile) return cachedAtRender.profile
    if (currentProfile) {
      return {
        user_id: session?.user?.id ?? '',
        username: currentProfile.username,
        avatar_url: currentProfile.avatarUrl,
        provider_avatar_url: currentProfile.providerAvatarUrl,
        bio: currentProfile.bio,
        is_public: currentProfile.isPublic,
        show_followers: 'everyone',
        show_following: 'everyone',
        default_gala_plan_visibility: 'private',
        followers_count: 0,
        following_count: 0,
        onboarding_completed_at: null,
        created_at: '',
        updated_at: '',
      } as Profile
    }
    return null
  })
  const [isLoading, setIsLoading] = useState(false)
  const [, setIsRefreshing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [usernameInput, setUsernameInput] = useState(() => cachedAtRender?.profile.username ?? '')
  const [bioInput, setBioInput] = useState(() => cachedAtRender?.profile.bio ?? '')
  const [isPublic, setIsPublic] = useState(() => cachedAtRender?.profile.is_public ?? true)
  const [defaultPlanVisibility, setDefaultPlanVisibility] = useState<Profile['default_gala_plan_visibility']>(
    () => cachedAtRender?.profile.default_gala_plan_visibility ?? 'private',
  )
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>(() => cachedAtRender?.followRequests ?? [])
  const [listTitle, setListTitle] = useState('')
  const [listUsers, setListUsers] = useState<FollowListUser[] | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [securityError, setSecurityError] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const { showSystemMessage } = useSystemMessage()

  const normalizedUsername = useMemo(() => normalizeUsername(usernameInput), [usernameInput])
  const usernameError = normalizedUsername ? validateUsername(normalizedUsername) : 'Username is required.'
  const bioCharacterCount = bioInput.trim().length

  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(guestProfile)
      setFollowRequests([])
      setIsLoading(false)
      setErrorMessage('')
      return
    }

    let isMounted = true
    const controller = new AbortController()

    const loadProfile = async () => {
      try {
        if (profile) {
          setIsRefreshing(true)
        }
        setErrorMessage('')

        const [data, requestsData] = await Promise.all([
          getMyProfile(session),
          getFollowRequests(session).catch(() => ({ requests: [] as FollowRequest[] })),
        ])

        if (!isMounted) return

        if (data.profile) {
          setProfile(data.profile)
          setUsernameInput(data.profile.username ?? '')
          setBioInput(data.profile.bio ?? '')
          setIsPublic(data.profile.is_public)
          setDefaultPlanVisibility(data.profile.default_gala_plan_visibility ?? 'private')

          const avatarUrl = getDisplayAvatar(data.profile)
          if (avatarUrl) {
            void preloadAvatarImage(avatarUrl)
          }
        }

        setFollowRequests(requestsData.requests)

        if (data.profile) {
          memCache = { profile: data.profile, followRequests: requestsData.requests }
          memCachedUserId = session.user.id
          writeCache(session.user.id, {
            profile: data.profile,
            followRequests: requestsData.requests,
            cachedAt: Date.now(),
          })
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load profile.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    void loadProfile()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [session?.user?.id])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (usernameError) {
      setErrorMessage(usernameError)
      return
    }

    try {
      setIsSaving(true)
      setErrorMessage('')
      const data = await updateMyProfile(
        {
          username: normalizedUsername,
          bio: bioInput.trim() || null,
          is_public: isPublic,
          default_gala_plan_visibility: defaultPlanVisibility,
        },
        session,
      )

      if (data.profile) {
        setProfile(data.profile)
        setUsernameInput(data.profile.username ?? '')
        setBioInput(data.profile.bio ?? '')
        setIsPublic(data.profile.is_public)
        setDefaultPlanVisibility(data.profile.default_gala_plan_visibility ?? 'private')

        const avatarUrl = getDisplayAvatar(data.profile)
        if (avatarUrl) {
          void preloadAvatarImage(avatarUrl)
        }

        if (memCache) {
          memCache.profile = data.profile
        }
        if (session?.user?.id) {
          writeCache(session.user.id, {
            profile: data.profile,
            followRequests,
            cachedAt: Date.now(),
          })
        }
      }
      setIsEditing(false)
      showSystemMessage({
        title: 'Profile Update Successful!',
        description: 'Your public profile details were updated.',
      })
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
      return
    }

    if (newPassword !== confirmNewPassword) {
      setSecurityError('Passwords do not match.')
      return
    }

    try {
      setIsSavingPassword(true)
      setSecurityError('')
      await updateAccountPassword(newPassword)
      setNewPassword('')
      setConfirmNewPassword('')
      showSystemMessage({
        title: 'Password Updated!',
        description: 'You can now use email and password login for this account.',
      })
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not update password. Please try again.')
    } finally {
      setIsSavingPassword(false)
    }
  }

  const profileContent = (
    <>
      <div className="mb-5">
        <MinimalBackNav to="/home" label="Home" preferHistory={false} className="hidden sm:inline-flex" />
      </div>

      <PageHeroHeader
        eyebrow="Profile"
        title="Your GalaTayo profile"
        description="Update how you show up, manage privacy, and keep your account details in sync."
        icon={<AppIcon name="profile" className="h-4 w-4" />}
        className="pb-0"
      />

      {isLoading && !profile ? <FormSkeleton rows={5} className="mt-5" /> : null}
      {profile ? (
        <>
          <CardSurface pad="loose">
            <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                <div>
                  <ProfileAvatar profile={profile} size="lg" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chip)] px-3 py-1 text-[var(--accent-deep)]">
                      <AppIcon name={profile.is_public ? 'eye' : 'lock'} className="h-3.5 w-3.5" />
                      {profile.is_public ? 'Public profile' : 'Private profile'}
                    </span>
                    <span>Default plans: {planVisibilityLabel[defaultPlanVisibility]}</span>
                  </div>
                  <h1 className="mt-3 truncate text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
                    @{profile.username}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
                    {profile.bio || 'Give your profile a short intro so people know your vibe before they follow.'}
                  </p>
                </div>
              </div>

              {profile.username ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigateToPath(isGuestProfile ? '/login' : '/find-friends')}
                    className="app-button app-button-secondary app-button-md"
                  >
                    <AppIcon name="users" className="h-4 w-4" />
                    {isGuestProfile ? 'Log in' : 'Find friends'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigateToPath(isGuestProfile ? '/signup' : `/u/${encodeURIComponent(profile.username || '')}`)
                    }
                    className="app-button app-button-secondary app-button-md"
                  >
                    <AppIcon name="share" className="h-4 w-4" />
                    {isGuestProfile ? 'Create account' : 'View public'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-3 pt-4 text-sm">
              <button type="button" onClick={() => void openList('followers')} className="inline-flex items-center gap-2 font-semibold text-slate-600 transition hover:text-slate-950">
                <span className="text-lg font-black text-slate-950">{profile.followers_count ?? 0}</span>
                <span>Followers</span>
              </button>
              <button type="button" onClick={() => void openList('following')} className="inline-flex items-center gap-2 font-semibold text-slate-600 transition hover:text-slate-950">
                <span className="text-lg font-black text-slate-950">{profile.following_count ?? 0}</span>
                <span>Following</span>
              </button>
              <span className="inline-flex items-center gap-2 font-semibold text-slate-600">
                <AppIcon name={profile.is_public ? 'eye' : 'lock'} className="h-4 w-4 text-slate-400" />
                {profile.is_public ? 'Follower and following lists are visible system-wide' : 'Follower and following names stay hidden system-wide'}
              </span>
              <span className="inline-flex items-center gap-2 font-semibold text-slate-600">
                <AppIcon name="profile" className="h-4 w-4 text-slate-400" />
                {followRequests.length} pending requests
              </span>
            </div>
          </CardSurface>

          {isEditing && !isGuestProfile ? (
            <form className="gala-card mt-8 overflow-hidden" onSubmit={handleSave}>
              <section className="grid gap-4 px-5 py-6 sm:px-6">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Profile</p>
                  <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">Identity and presentation</h2>
                </div>
                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Username</span>
                    <span className="flex h-12 items-center rounded-2xl border border-[var(--line-strong)] bg-white px-4 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
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
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-black text-slate-900">
                        Bio
                        <span className="optional-label">Optional</span>
                      </span>
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{bioInput.length}/280</span>
                    </div>
                    <textarea
                      value={bioInput}
                      onChange={(event) => setBioInput(event.target.value)}
                      className="min-h-32 resize-none rounded-2xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      maxLength={280}
                    />
                  </label>
                </div>
              </section>

              <section className="grid gap-4 border-t border-[var(--line)] px-5 py-6 sm:px-6">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Privacy</p>
                  <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">Audience and access</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 sm:col-span-2">
                    <span className="text-sm font-black text-slate-900">Profile Visibility</span>
                    <select value={isPublic ? 'public' : 'private'} onChange={(event) => setIsPublic(event.target.value === 'public')} className="h-12 rounded-2xl border border-[var(--line-strong)] bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]">
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      {isPublic ? 'Anyone can view your profile and your follower/following lists.' : 'People need to request to follow you, and follower/following names stay hidden.'}
                    </span>
                  </label>
                  <label className="grid gap-2 sm:col-span-2">
                    <span className="text-sm font-black text-slate-900">Default Gala Plan Visibility</span>
                    <select value={defaultPlanVisibility} onChange={(event) => setDefaultPlanVisibility(event.target.value as Profile['default_gala_plan_visibility'])} className="h-12 rounded-2xl border border-[var(--line-strong)] bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]">
                      <option value="private">Private</option>
                      <option value="followers">Followers only</option>
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                    </select>
                    <span className="text-xs font-semibold text-[var(--muted)]">
                      Unlisted plan: Anyone with the link can view, but it will not appear on your profile.
                    </span>
                  </label>
                </div>
              </section>

              <section className="grid gap-4 border-t border-[var(--line)] px-5 py-6 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Preview</p>
                    <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">How your profile looks</h2>
                  </div>
                  <div className="text-sm font-semibold text-slate-500">
                    Bio length: <span className="font-black text-slate-950">{bioCharacterCount}/280</span>
                  </div>
                </div>
                <div className="grid gap-4 rounded-[24px] bg-[var(--surface-alt)] p-4 sm:grid-cols-[auto,minmax(0,1fr)] sm:items-center">
                  <ProfileAvatar
                    profile={{
                      username: normalizedUsername || 'your-name',
                      avatar_url: profile.avatar_url,
                      provider_avatar_url: profile.provider_avatar_url,
                    }}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                      {isPublic ? 'Public profile' : 'Private profile'}
                    </p>
                    <p className="mt-1 truncate text-2xl font-black tracking-[-0.04em] text-slate-950">@{normalizedUsername || 'your-name'}</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                      {bioInput.trim() || 'Add a short bio so other people know your vibe.'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 border-t border-[var(--line)] px-5 py-6 sm:px-6">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Security</p>
                  <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">Account access</h2>
                </div>
                <div className="grid gap-4 sm:max-w-xl">
                  <p className="text-sm font-semibold leading-6 text-[var(--muted)]">
                    Add or update email/password login for this same GalaTayo account.
                  </p>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">New Password</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      className="h-12 rounded-2xl border border-[var(--line-strong)] bg-white px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Confirm Password</span>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      className="h-12 rounded-2xl border border-[var(--line-strong)] bg-white px-4 text-sm font-semibold outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleUpdatePassword()}
                    disabled={isSavingPassword || !newPassword || !confirmNewPassword}
                    className="app-button app-button-primary app-button-md"
                  >
                    {isSavingPassword ? 'Updating password...' : 'Set password'}
                  </button>
                  {securityError ? <span className="text-sm font-bold text-red-600">{securityError}</span> : null}
                </div>
              </section>

              {errorMessage ? <p className="border-t border-[var(--line)] px-5 py-4 text-sm font-bold text-red-700 sm:px-6">{errorMessage}</p> : null}

              <div className="flex flex-col gap-3 border-t border-[var(--line)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm font-semibold text-slate-600">Changes update your public profile and future plan defaults.</p>
                <button
                  type="submit"
                  disabled={Boolean(usernameError) || isSaving}
                  className="app-button app-button-primary app-button-md"
                >
                  {isSaving ? 'Saving...' : 'Save profile'}
                </button>
              </div>
            </form>
          ) : null}

          <section className="mt-8">
            <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Social</p>
                <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-slate-950">Follow requests</h2>
                <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                  {profile.is_public ? 'Public profiles accept followers automatically.' : 'Approve who can see your private activity.'}
                </p>
              </div>
              <span className="inline-flex items-center gap-2 self-start rounded-full bg-[var(--chip)] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--accent-deep)]">
                <AppIcon name="profile" className="h-3.5 w-3.5" />
                {followRequests.length} pending
              </span>
            </div>

            {followRequests.length === 0 ? (
              <p className="pt-5 text-sm font-semibold text-[var(--muted)]">
                {profile.is_public ? 'Public profiles accept followers automatically.' : 'Approve who can see your private activity.'}
              </p>
            ) : (
              <div className="divide-y divide-[var(--line)] pt-3">
                {followRequests.map((request) => (
                  <article key={request.id} className="flex items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">@{request.follower.username}</p>
                      <p className="truncate text-xs font-semibold text-[var(--muted)]">{request.follower.bio || 'Wants to follow you.'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void handleFollowRequest(request.id, 'accept')} className="h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-black text-white">
                        Accept
                      </button>
                      <button type="button" onClick={() => void handleFollowRequest(request.id, 'reject')} className="h-9 rounded-full border border-[var(--line)] bg-white px-4 text-xs font-black text-slate-700">
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <p className="rounded-3xl border border-red-100 bg-white px-5 py-6 text-sm font-semibold text-red-700">
          {errorMessage || 'Profile unavailable.'}
        </p>
      )}

      {listUsers ? (
        <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-slate-950/35 px-4">
          <section className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-950">{listTitle}</h2>
              <button type="button" onClick={() => setListUsers(null)} className="h-9 rounded-full border border-[var(--line)] px-3 text-sm font-black">Close</button>
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
    </>
  )

  return (
    <>
      {isGuestProfile ? (
        <PageShell tone="surface" reserveBottomNav={false}>
          <AppHeader />
          <main className="relative flex min-h-0 flex-1 overflow-hidden px-4 pb-12 pt-4 text-[var(--text)] sm:px-6 sm:pb-14 sm:pt-5 lg:py-10">
            <div className="pointer-events-none absolute inset-0 select-none overflow-hidden blur-[3px] opacity-40">
              <PageContainer size="wide">{profileContent}</PageContainer>
            </div>

            <div className="relative z-20 flex w-full items-center justify-center">
              <div className="w-full max-w-[420px] lg:max-w-[440px] xl:max-w-[460px] 2xl:max-w-[480px]">
                <GuestAuthPrompt variant="profile" mode="inline-card" />
              </div>
            </div>
          </main>
        </PageShell>
      ) : (
        <PageShell>
          <AppHeader />
          <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
            <PageContainer size="wide">{profileContent}</PageContainer>
          </main>
        </PageShell>
      )}
    </>
  )
}

export default ProfilePage
