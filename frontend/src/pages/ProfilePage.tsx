import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BookMarked, CalendarDays, ChevronRight, Eye, Heart, History, Lock, LogOut, Moon, Settings, Share2, ShieldCheck, Sparkles, Stamp as StampIcon, Sun, UserPlus } from 'lucide-react'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import InternalLink from '../components/InternalLink'
import ProfileAvatar from '../components/ProfileAvatar'
import { Button, Empty, Page, Row, SectionHead, Sheet, Skeleton, Stamp, Tabs, Tag } from '../components/ui'
import { useSystemMessage } from '../context/SystemMessageContext'
import { useTheme } from '../context/ThemeContext'
import { signOut } from '../services/authApi'
import { useAppUser } from '../context/AppUserContext'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import {
  getDisplayAvatar,
  getFollowers,
  getFollowing,
  getFollowRequests,
  getMyProfile,
  respondToFollowRequest,
  type FollowListUser,
  type FollowRequest,
  type Profile,
} from '../utils/profileApi'
import { formatGalaPlanDate, listMyGalaPlans, type GalaPlanSummary } from '../utils/galaPlansApi'
import { daysUntil, getPlanDate } from '../utils/galaPlanTrip'
import { getMyPassport, type CityStamp } from '../utils/passportApi'
import { preloadAvatarImage } from '../utils/avatarImageCache'
import { navigateToPath } from '../utils/navigation'
import { shareLink } from '../utils/share'
import { getPublicSiteOrigin } from '../utils/site'

type ProfilePageProps = {
  session: Session | null
}

type ProfileTab = 'plans' | 'stamps'

const PROFILE_CACHE_PREFIX = 'galatayo:profile-page:'
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000
const TAB_PREVIEW_LIMIT = 6

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

let memCache: { profile: Profile; followRequests: FollowRequest[] } | null = null
let memCachedUserId: string | null = null

function planDateLabel(plan: GalaPlanSummary) {
  const date = getPlanDate(plan)
  if (!date) return formatGalaPlanDate(plan.description)
  const days = daysUntil(date)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  const year = date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  return date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year })
}

type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string }

/** Compact plan row for a `g-group` list: 64px thumbnail, title, one meta line. */
export function PlanCard({ href, title, imageUrl, tag, date, meta }: { href: string; title: string; imageUrl?: string | null; tag?: string; date?: string; meta: string }) {
  return (
    <InternalLink href={href} className="g-group-row py-2" ariaLabel={title}>
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-[var(--r-2)] object-cover" />
      ) : (
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--r-2)]" style={{ background: 'var(--sea-soft)', color: 'var(--sea)' }}>
          <CalendarDays className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="g-h3 block truncate">{title}</span>
        <span className="g-sm g-mut block truncate">{[tag, date, meta].filter(Boolean).join(' · ')}</span>
      </span>
      <ChevronRight className="g-ic shrink-0" aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
    </InternalLink>
  )
}

export function FollowListSheet({ title, users, emptyLabel, onClose }: { title: string; users: FollowListUser[] | null; emptyLabel: string; onClose: () => void }) {
  return (
    <Sheet open={users !== null} onClose={onClose} title={title} labelledBy="follow-list-title">
      {users?.length === 0 ? <p className="g-sm g-mut">{emptyLabel}</p> : null}
      <div className="g-list">
        {users?.map((user) => (
          <Row
            key={user.user_id}
            onClick={() => {
              onClose()
              navigateToPath(`/u/${encodeURIComponent(user.username)}`)
            }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar profile={user} size="xs" />
              <div className="min-w-0">
                <div className="g-h3 truncate">@{user.username}</div>
                <div className="g-sm g-mut truncate">{user.bio || 'View profile'}</div>
              </div>
            </div>
          </Row>
        ))}
      </div>
      <Button variant="line" block className="mt-4" onClick={onClose}>
        Close
      </Button>
    </Sheet>
  )
}

function ProfilePage({ session }: ProfilePageProps) {
  const { currentProfile } = useAppUser()
  const { favorites } = useSavedFavorites()
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
    if (!session?.user?.id) return null
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
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>(() => cachedAtRender?.followRequests ?? [])
  const [listTitle, setListTitle] = useState('')
  const [listUsers, setListUsers] = useState<FollowListUser[] | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [activeTab, setActiveTab] = useState<ProfileTab>('plans')
  const [plans, setPlans] = useState<Loadable<GalaPlanSummary[]>>({ status: 'loading' })
  const [stamps, setStamps] = useState<Loadable<CityStamp[]>>({ status: 'loading' })
  const [isSigningOut, setIsSigningOut] = useState(false)
  const { showSystemMessage } = useSystemMessage()
  const { resolvedTheme, setThemePreference } = useTheme()

  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user?.id) return
    let isMounted = true
    const toMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

    listMyGalaPlans(session)
      .then((data) => isMounted && setPlans({ status: 'ready', data: data.plans }))
      .catch((error) => isMounted && setPlans({ status: 'error', message: toMessage(error) }))
    getMyPassport(session)
      .then((data) => isMounted && setStamps({ status: 'ready', data: data.available ? data.stamps.filter((stamp) => stamp.collected) : [] }))
      .catch((error) => isMounted && setStamps({ status: 'error', message: toMessage(error) }))

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

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

  const handleShare = async () => {
    if (!profile?.username) return
    const canNativeShare = typeof navigator.share === 'function'
    try {
      await shareLink({ url: `${getPublicSiteOrigin()}/u/${encodeURIComponent(profile.username)}`, title: `@${profile.username} on GalaTayo` })
      if (!canNativeShare) showSystemMessage({ title: 'Link copied', description: 'Your profile link is ready to paste.' })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') showSystemMessage({ title: 'Could not share', description: 'Try again in a bit.' })
    }
  }

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      setErrorMessage('')
      await signOut({ scope: 'local' })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign out failed. Try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  if (isGuestProfile) {
    return (
      <Page narrow className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-[440px]">
          <GuestAuthPrompt variant="profile" mode="inline-card" />
        </div>
      </Page>
    )
  }

  const savedPlaces = favorites.filter((favorite) => favorite.place)
  const stampCount = stamps.status === 'ready' ? stamps.data.length : null
  const planCount = plans.status === 'ready' ? plans.data.length : null
  const displayName = currentProfile?.displayName?.trim() || profile?.username || 'Your profile'
  const showFollowRequests = !profile?.is_public || followRequests.length > 0
  const shortcuts = [
    { href: '/passport', label: 'Passport', sub: stampCount ? `${stampCount} ${stampCount === 1 ? 'stamp' : 'stamps'}` : '', icon: StampIcon },
    { href: '/favorites', label: 'Saved places', sub: savedPlaces.length ? String(savedPlaces.length) : '', icon: Heart },
    { href: '/history', label: 'History', sub: '', icon: History },
    { href: '/find-friends', label: 'Find friends', sub: '', icon: UserPlus },
    { href: `/u/${encodeURIComponent(profile?.username || '')}`, label: 'View public profile', sub: '', icon: Eye },
  ]
  const accountLinks = [
    { href: '/account-settings', label: 'Settings', icon: Settings },
    { href: '/privacy-center', label: 'Privacy center', icon: ShieldCheck },
  ]
  const isDark = resolvedTheme === 'dark'
  const ThemeIcon = isDark ? Sun : Moon

  return (
    <Page>
      {isLoading && !profile ? (
        <div className="flex items-center gap-4" aria-label="Loading profile">
          <Skeleton className="h-[72px] w-[72px] !rounded-full lg:h-24 lg:w-24" />
          <div className="flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
      ) : null}

      {profile ? (
        <>
          <section className="lg:max-w-[720px]">
            <div className="flex items-start gap-4 lg:gap-6">
              <ProfileAvatar profile={{ ...profile, display_name: currentProfile?.displayName }} size="xl" />
              <div className="min-w-0 flex-1">
                <h1 className="g-h1 truncate">{displayName}</h1>
                <p className="flex min-w-0 items-center gap-2">
                  <span className="g-mut truncate">@{profile.username}</span>
                  {profile.is_public ? null : (
                    <Tag tone="warn" className="shrink-0">
                      <Lock aria-hidden="true" />
                      Private
                    </Tag>
                  )}
                </p>
                <p className="g-sm mt-3 flex flex-wrap items-center gap-x-1">
                  <button type="button" className="inline-flex min-h-11 items-center gap-1" onClick={() => void openList('followers')}>
                    <b>{profile.followers_count ?? 0}</b>
                    <span className="g-mut">{profile.followers_count === 1 ? 'follower' : 'followers'}</span>
                  </button>
                  <span className="g-mut" aria-hidden="true">·</span>
                  <button type="button" className="inline-flex min-h-11 items-center gap-1" onClick={() => void openList('following')}>
                    <b>{profile.following_count ?? 0}</b>
                    <span className="g-mut">following</span>
                  </button>
                  <span className="g-mut" aria-hidden="true">·</span>
                  <InternalLink href="/passport" className="inline-flex min-h-11 items-center gap-1 no-underline" ariaLabel={`${stampCount ?? 0} city stamps, open passport`}>
                    <b style={{ color: 'var(--ink)' }}>{stampCount ?? '–'}</b>
                    <span className="g-mut">{stampCount === 1 ? 'stamp' : 'stamps'}</span>
                  </InternalLink>
                </p>
              </div>
            </div>

            <p className="mt-3 max-w-[60ch]">{profile.bio || 'Add a short bio so people know your vibe before they follow.'}</p>
            {followRequests.length > 0 ? (
              <p className="g-sm g-mut mt-2">{`${followRequests.length} pending request${followRequests.length === 1 ? '' : 's'}`}</p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="line" block href="/account-settings">
                Edit profile
              </Button>
              <Button variant="line" block onClick={() => void handleShare()}>
                <Share2 aria-hidden="true" />
                Share profile
              </Button>
            </div>

            <nav className="mt-5 grid gap-4" aria-label="Your stuff">
              <div className="g-group">
                {shortcuts.map(({ href, label, sub, icon: Icon }) => (
                  <InternalLink key={href} href={href} className="g-group-row">
                    <Icon aria-hidden="true" />
                    {label}
                    <span className="g-group-end">
                      {sub}
                      <ChevronRight className="g-ic" aria-hidden="true" />
                    </span>
                  </InternalLink>
                ))}
              </div>
              <div className="g-group">
                {accountLinks.map(({ href, label, icon: Icon }) => (
                  <InternalLink key={href} href={href} className="g-group-row">
                    <Icon aria-hidden="true" />
                    {label}
                    <span className="g-group-end">
                      <ChevronRight className="g-ic" aria-hidden="true" />
                    </span>
                  </InternalLink>
                ))}
                <button type="button" role="switch" aria-checked={isDark} className="g-group-row" onClick={() => setThemePreference(isDark ? 'light' : 'dark')}>
                  <ThemeIcon aria-hidden="true" />
                  Dark mode
                  <span className="g-group-end">{isDark ? 'On' : 'Off'}</span>
                </button>
                <button type="button" className="g-group-row disabled:opacity-60" onClick={() => void handleSignOut()} disabled={isSigningOut}>
                  <LogOut aria-hidden="true" />
                  {isSigningOut ? 'Logging out...' : 'Log out'}
                </button>
              </div>
            </nav>
          </section>

          {errorMessage ? (
            <p role="alert" className="g-sm mt-4" style={{ color: 'var(--bad)' }}>
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-8">
            <Tabs
              label="Profile sections"
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: 'plans', label: planCount ? `Plans ${planCount}` : 'Plans' },
                { value: 'stamps', label: stampCount ? `Stamps ${stampCount}` : 'Stamps' },
              ]}
            />

            {activeTab === 'plans' ? (
              plans.status === 'loading' ? (
                <div className="grid gap-2 lg:max-w-[720px]" aria-label="Loading plans">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-20" />
                  ))}
                </div>
              ) : plans.status === 'error' ? (
                <Empty title="Hindi ma-load ang plans mo." description={plans.message} />
              ) : plans.data.length === 0 ? (
                <Empty
                  title="Wala pang plans."
                  description="Describe your gala in one line and let AI draft it."
                  action={
                    <Button variant="ink" href="/plan-with-ai">
                      <Sparkles aria-hidden="true" />
                      Plan with AI
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="g-group lg:max-w-[720px]">
                    {plans.data.slice(0, TAB_PREVIEW_LIMIT).map((plan) => {
                      const placeCount = plan.places_count ?? plan.place_count ?? 0
                      const hearts = plan.hearts_count ?? plan.heart_count ?? 0
                      return (
                        <PlanCard
                          key={plan.id}
                          href={`/gala-plans/${encodeURIComponent(plan.id)}`}
                          title={plan.title}
                          imageUrl={plan.preview_places?.[0]?.image_url}
                          tag={plan.visibility === 'public' ? 'Public' : 'Private'}
                          date={planDateLabel(plan)}
                          meta={`${placeCount} ${placeCount === 1 ? 'stop' : 'stops'}${hearts ? ` · ${hearts} ♥` : ''}`}
                        />
                      )
                    })}
                  </div>
                  {plans.data.length > TAB_PREVIEW_LIMIT ? (
                    <div className="mt-4 flex justify-center">
                      <Button variant="line" href="/gala-plans">
                        All {plans.data.length} plans
                      </Button>
                    </div>
                  ) : null}
                </>
              )
            ) : null}

            {activeTab === 'stamps' ? (
              stamps.status === 'loading' ? (
                <div className="grid grid-cols-2 justify-items-center gap-6 md:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-[100px] w-[100px] !rounded-full" />
                  ))}
                </div>
              ) : stamps.status === 'error' ? (
                <Empty title="Hindi ma-load ang stamps mo." description={stamps.message} />
              ) : stamps.data.length === 0 ? (
                <Empty
                  title="Wala pang stamps."
                  description="Visit a place and tap “I'm here” to earn that city's stamp."
                  action={<Button variant="line" href="/passport">Open passport</Button>}
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-8 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {stamps.data.map((stamp) => (
                      <Stamp key={stamp.city} title={stamp.city} sub={`${stamp.places} ${stamp.places === 1 ? 'spot' : 'spots'}`} />
                    ))}
                  </div>
                  <div className="mt-6 flex justify-center">
                    <Button variant="line" href="/passport">
                      <BookMarked aria-hidden="true" />
                      Open passport
                    </Button>
                  </div>
                </>
              )
            ) : null}
          </div>

          {showFollowRequests ? (
            <>
              <SectionHead
                title="Follow requests"
                sub={profile.is_public ? 'Public profiles accept followers automatically.' : 'Approve who can see your private activity.'}
                action={<Tag>{followRequests.length} pending</Tag>}
              />
              {followRequests.length === 0 ? (
                <p className="g-sm g-mut">Walang pending requests.</p>
              ) : (
                <div className="g-list lg:max-w-[640px]">
                  {followRequests.map((request) => (
                    <Row
                      key={request.id}
                      action={
                        <div className="flex shrink-0 gap-2">
                          <Button variant="ink" size="sm" onClick={() => void handleFollowRequest(request.id, 'accept')}>
                            Accept
                          </Button>
                          <Button variant="line" size="sm" onClick={() => void handleFollowRequest(request.id, 'reject')}>
                            Reject
                          </Button>
                        </div>
                      }
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ProfileAvatar profile={request.follower} size="xs" />
                        <div className="min-w-0">
                          <div className="g-h3 truncate">@{request.follower.username}</div>
                          <div className="g-sm g-mut truncate">{request.follower.bio || 'Wants to follow you.'}</div>
                        </div>
                      </div>
                    </Row>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </>
      ) : !isLoading ? (
        <Empty title="Profile unavailable." description={<span role="alert">{errorMessage || 'Try again in a bit.'}</span>} />
      ) : null}

      <FollowListSheet title={listTitle} users={listUsers} emptyLabel="No users yet." onClose={() => setListUsers(null)} />
    </Page>
  )
}

export default ProfilePage
