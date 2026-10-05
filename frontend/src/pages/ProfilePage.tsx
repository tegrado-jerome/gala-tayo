import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { ChatCenteredText } from '@phosphor-icons/react/dist/csr/ChatCenteredText'
import { ClockCounterClockwise } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise'
import { Eye } from '@phosphor-icons/react/dist/csr/Eye'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { GearSix } from '@phosphor-icons/react/dist/csr/GearSix'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { LockKey } from '@phosphor-icons/react/dist/csr/LockKey'
import { Lock } from '@phosphor-icons/react/dist/csr/Lock'
import { MapPinPlus } from '@phosphor-icons/react/dist/csr/MapPinPlus'
import { Moon } from '@phosphor-icons/react/dist/csr/Moon'
import { Notepad } from '@phosphor-icons/react/dist/csr/Notepad'
import { PencilSimple } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { ShareNetwork } from '@phosphor-icons/react/dist/csr/ShareNetwork'
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import { SignOut } from '@phosphor-icons/react/dist/csr/SignOut'
import { Sparkle } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Stamp as StampIcon } from '@phosphor-icons/react/dist/csr/Stamp'
import { Sun } from '@phosphor-icons/react/dist/csr/Sun'
import { UserPlus } from '@phosphor-icons/react/dist/csr/UserPlus'
import { User as UserIcon } from '@phosphor-icons/react/dist/csr/User'
import { GuestAuthPrompt } from '../components/GuestAuthPrompt'
import InternalLink from '../components/InternalLink'
import ProfileAvatar from '../components/ProfileAvatar'
import { Button, Empty, Page, SectionHead, Sheet, Skeleton, Tag, cx } from '../components/ui'
import { useSystemMessage } from '../context/SystemMessageContext'
import { useTheme } from '../context/ThemeContext'
import { buildAuthPath, signOut } from '../services/authApi'
import { isAnonymousSession } from '../utils/guestSession'
import { replaceWithPath } from '../utils/navigation'
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
import { shareLink } from '../utils/share'
import { getPublicSiteOrigin } from '../utils/site'
import '../design/me.css'

type ProfilePageProps = {
  session: Session | null
}

const PROFILE_CACHE_PREFIX = 'galatayo:profile-page:'
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000
const PLAN_PREVIEW_LIMIT = 4
const STAMP_PREVIEW_LIMIT = 6

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

function plural(count: number, word: string, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`
}

/** "Joined Oct 2026", or null when the date is missing. */
export function joinedLabel(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `Joined ${date.toLocaleDateString('en', { month: 'short', year: 'numeric' })}`
}

type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string }
type PassportSummary = { stamps: CityStamp[]; places: number; streak: number }

/** Airbnb-style account row: duotone icon tile, title, one-line subtitle, caret. Renders a link, a button, or a switch. */
export function MeRow({
  icon: Icon,
  title,
  sub,
  href,
  onClick,
  end,
  tone,
  checked,
  expanded,
  disabled,
}: {
  icon: PhosphorIcon
  title: ReactNode
  sub?: ReactNode
  href?: string
  onClick?: () => void
  end?: ReactNode
  tone?: 'tara' | 'sea' | 'warn' | 'bad'
  checked?: boolean
  /** Makes the row a disclosure button for an inline panel. */
  expanded?: boolean
  disabled?: boolean
}) {
  const body = (
    <>
      <span className={cx('me-ic', tone && `is-${tone}`)} aria-hidden="true">
        <Icon weight="duotone" />
      </span>
      <span className="me-row-t">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </span>
      <span className="me-row-end">
        {checked !== undefined ? <span className="me-switch" aria-hidden="true" /> : end}
        {href ? <CaretRight aria-hidden="true" /> : null}
        {expanded !== undefined ? <CaretDown aria-hidden="true" className={cx('transition-transform', expanded && 'rotate-180')} /> : null}
      </span>
    </>
  )
  if (href && /^(mailto:|https?:)/.test(href)) return <a href={href} className="me-row">{body}</a>
  if (href) return <InternalLink href={href} className="me-row">{body}</InternalLink>
  if (checked !== undefined) {
    return (
      <button type="button" role="switch" aria-checked={checked} className="me-row" onClick={onClick} disabled={disabled}>
        {body}
      </button>
    )
  }
  return (
    <button type="button" className="me-row" onClick={onClick} disabled={disabled} aria-expanded={expanded}>
      {body}
    </button>
  )
}

/** Plan tile for a `me-tiles` grid: 4:3 cover photo, title, one meta line. */
export function PlanTile({ href, title, imageUrl, tag, meta }: { href: string; title: string; imageUrl?: string | null; tag?: string; meta: string }) {
  return (
    <InternalLink href={href} className="me-tile" ariaLabel={title}>
      <span className="me-tile-art">
        <CalendarBlank size={28} weight="duotone" aria-hidden="true" />
        {imageUrl ? <img src={imageUrl} alt="" loading="lazy" decoding="async" /> : null}
        {tag ? <Tag tone="solid">{tag}</Tag> : null}
      </span>
      <span className="me-tile-t">{title}</span>
      <span className="me-tile-s block">{meta}</span>
    </InternalLink>
  )
}

export function FollowListSheet({ title, users, emptyLabel, onClose }: { title: string; users: FollowListUser[] | null; emptyLabel: string; onClose: () => void }) {
  return (
    <Sheet open={users !== null} onClose={onClose} title={title} labelledBy="follow-list-title">
      {users?.length === 0 ? <p className="g-sm g-mut">{emptyLabel}</p> : null}
      <div>
        {users?.map((user) => (
          <div key={user.user_id} className="me-prow">
            <ProfileAvatar profile={user} size="sm" />
            <InternalLink href={`/u/${encodeURIComponent(user.username)}`} onClick={onClose}>
              <span className="g-h3 block truncate">{user.display_name?.trim() || `@${user.username}`}</span>
              <span className="g-sm g-mut block truncate">{user.display_name?.trim() ? `@${user.username}` : user.bio || 'View profile'}</span>
            </InternalLink>
            <CaretRight className="g-ic shrink-0" style={{ color: 'var(--ink-3)' }} aria-hidden="true" />
          </div>
        ))}
      </div>
      <Button variant="line" block className="mt-4" onClick={onClose}>
        Close
      </Button>
    </Sheet>
  )
}

const GUEST_LOCKED_ROWS: Array<{ icon: PhosphorIcon; title: string; sub: string }> = [
  { icon: Eye, title: 'Public profile', sub: 'Share your profile and gala plans' },
  { icon: UserPlus, title: 'Followers and friends', sub: 'Follow your barkada and see their plans' },
  { icon: ChatCenteredText, title: 'Reviews, tips and photos', sub: 'Rate places and help other gala-goers' },
  { icon: MapPinPlus, title: 'Submit a place', sub: 'Add a spot we’re missing' },
  { icon: Sparkle, title: 'More AI each day', sub: 'Higher daily limits for Ask AI and Plan with AI' },
]

/** Me page for a guest (anonymous) session: their stuff, plus what an account unlocks. */
function GuestProfile({ session }: { session: Session }) {
  const { favorites } = useSavedFavorites()
  const { resolvedTheme, setThemePreference } = useTheme()
  const [planCount, setPlanCount] = useState<number | null>(null)
  const [stampCount, setStampCount] = useState<number | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const savedCount = favorites.filter((favorite) => favorite.place).length
  const signupPath = buildAuthPath('/signup', '/profile')
  const isDark = resolvedTheme === 'dark'

  useEffect(() => {
    let isMounted = true
    listMyGalaPlans(session)
      .then((data) => isMounted && setPlanCount(data.plans.length))
      .catch(() => undefined)
    getMyPassport(session)
      .then((data) => isMounted && setStampCount(data.available ? data.stamps.filter((stamp) => stamp.collected).length : 0))
      .catch(() => undefined)
    return () => {
      isMounted = false
    }
  }, [session])

  const leaveGuestMode = async () => {
    if (!window.confirm('Leave guest mode? Your saved places, plans and stamps will be lost unless you create an account first.')) return
    setIsLeaving(true)
    await signOut({ scope: 'local' }).catch(() => undefined)
    setIsLeaving(false)
  }

  return (
    <Page narrow>
      <h1 className="g-h1">Profile</h1>

      <section className="mt-5 rounded-[var(--r-4)] p-5" style={{ background: 'var(--tara-soft)' }} aria-labelledby="guest-banner-title">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--surface)]" aria-hidden="true">
            <UserIcon weight="duotone" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="g-xs g-mut">
              <Tag>Guest</Tag> #{session.user.id.slice(0, 4)}
            </p>
            <h2 id="guest-banner-title" className="g-h3 mt-1">Create an account to keep your stuff</h2>
          </div>
        </div>
        <p className="g-sm mt-2">Right now your saves, plans and stamps live on this device only. An account keeps them and syncs them everywhere.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="tara" href={signupPath}>Create account</Button>
          <Button variant="line" href={buildAuthPath('/login', '/profile')}>Log in</Button>
        </div>
      </section>

      <nav aria-label="Your stuff" className="me-sec">
        <h2>Your gala</h2>
        <div className="me-rows">
          <MeRow icon={StampIcon} tone="tara" title="Passport" sub={stampCount ? plural(stampCount, 'city stamp') : 'Tap “I’m here” at a spot to earn a city stamp'} href="/passport" />
          <MeRow icon={Heart} title="Saved" sub={savedCount ? plural(savedCount, 'saved place') : 'Tap the heart on a place to keep it'} href="/favorites" />
          <MeRow icon={CalendarBlank} title="Gala plans" sub={planCount ? plural(planCount, 'plan') : 'Plans you made or joined'} href="/gala-plans" />
          <MeRow icon={ClockCounterClockwise} title="History" sub="Places you opened recently" href="/history" />
        </div>
      </nav>

      <nav aria-label="With a free account" className="me-sec">
        <h2>With a free account</h2>
        <div className="me-rows">
          {GUEST_LOCKED_ROWS.map((row) => (
            <MeRow key={row.title} icon={row.icon} title={row.title} sub={row.sub} href={signupPath} end={<Lock aria-label="Needs an account" />} />
          ))}
        </div>
      </nav>

      <nav aria-label="Settings" className="me-sec">
        <h2>Settings</h2>
        <div className="me-rows">
          <MeRow icon={isDark ? Sun : Moon} title="Dark mode" sub={isDark ? 'On' : 'Off'} checked={isDark} onClick={() => setThemePreference(isDark ? 'light' : 'dark')} />
          <MeRow icon={ChatCenteredText} title="Send feedback" sub="Tell us what to fix or add" href="/feedback" />
          <MeRow icon={SignOut} title={isLeaving ? 'Leaving...' : 'Leave guest mode'} sub="Clears your guest stuff from this device" onClick={() => void leaveGuestMode()} disabled={isLeaving} />
        </div>
      </nav>
    </Page>
  )
}

function ProfilePage({ session }: ProfilePageProps) {
  if (isAnonymousSession(session)) {
    return <GuestProfile session={session!} />
  }
  return <AccountProfilePage session={session} />
}

function AccountProfilePage({ session }: ProfilePageProps) {
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
  const [plans, setPlans] = useState<Loadable<GalaPlanSummary[]>>({ status: 'loading' })
  const [passport, setPassport] = useState<Loadable<PassportSummary>>({ status: 'loading' })
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
      .then((data) =>
        isMounted &&
        setPassport({
          status: 'ready',
          data: data.available
            ? { stamps: data.stamps.filter((stamp) => stamp.collected), places: data.unique_places, streak: data.streak_weeks }
            : { stamps: [], places: 0, streak: 0 },
        }),
      )
      .catch((error) => isMounted && setPassport({ status: 'error', message: toMessage(error) }))

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
      await signOut({ scope: 'local', onBeforeTransitionEnd: async () => replaceWithPath('/') })
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

  const savedCount = favorites.filter((favorite) => favorite.place).length
  const passportData = passport.status === 'ready' ? passport.data : null
  const stampCount = passportData ? passportData.stamps.length : null
  const planCount = plans.status === 'ready' ? plans.data.length : null
  const displayName = currentProfile?.displayName?.trim() || profile?.username || 'Your profile'
  const showFollowRequests = !profile?.is_public || followRequests.length > 0
  const joined = joinedLabel(profile?.created_at)
  const isDark = resolvedTheme === 'dark'
  const passportSub = passportData
    ? stampCount
      ? [plural(stampCount, 'city stamp'), passportData.streak ? `${plural(passportData.streak, 'week')} streak` : null].filter(Boolean).join(' · ')
      : 'Tap “I’m here” at a spot to earn a city stamp'
    : 'City stamps and your weekly streak'

  return (
    <Page>
      <h1 className="g-h1">Profile</h1>

      {isLoading && !profile ? (
        <div className="me-card mt-5" aria-label="Loading profile">
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

      {profile ? (
        <div className="mt-5 grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-16">
          <aside className="min-w-0 lg:sticky lg:top-24">
            <section className="me-card" aria-label="Your profile">
              <div className="me-id">
                <ProfileAvatar profile={{ ...profile, display_name: currentProfile?.displayName }} size="xxl" />
                <h2 className="g-h2">{displayName}</h2>
                <p className="me-id-sub">
                  <span className="truncate">@{profile.username}</span>
                  {profile.is_public ? null : (
                    <Tag className="shrink-0">
                      <Lock aria-hidden="true" />
                      Private
                    </Tag>
                  )}
                </p>
                {joined ? <p className="g-xs g-fnt mt-1">{joined}</p> : null}
              </div>
              <div className="me-nums">
                <InternalLink href="/passport" className="me-num" ariaLabel={`${passportData?.places ?? 0} places visited, open passport`}>
                  <b>{passportData ? passportData.places : '–'}</b>
                  <span>{passportData?.places === 1 ? 'Place visited' : 'Places visited'}</span>
                </InternalLink>
                <InternalLink href="/gala-plans" className="me-num" ariaLabel={`${planCount ?? 0} plans, open gala plans`}>
                  <b>{planCount ?? '–'}</b>
                  <span>{planCount === 1 ? 'Plan' : 'Plans'}</span>
                </InternalLink>
                <InternalLink href="/favorites" className="me-num" ariaLabel={`${savedCount} saved places, open saved`}>
                  <b>{savedCount}</b>
                  <span>Saved</span>
                </InternalLink>
              </div>
            </section>

            <p className="me-social mt-2">
              <button type="button" onClick={() => void openList('followers')}>
                <b>{profile.followers_count ?? 0}</b>
                <span>{profile.followers_count === 1 ? 'follower' : 'followers'}</span>
              </button>
              <i className="g-fnt not-italic" aria-hidden="true">·</i>
              <button type="button" onClick={() => void openList('following')}>
                <b>{profile.following_count ?? 0}</b>
                <span>following</span>
              </button>
              {followRequests.length > 0 ? (
                <>
                  <i className="g-fnt not-italic" aria-hidden="true">·</i>
                  <Tag tone="tara">{followRequests.length} pending</Tag>
                </>
              ) : null}
            </p>

            {profile.bio ? (
              <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed">{profile.bio}</p>
            ) : (
              <p className="g-sm g-mut mt-2">
                Add a short bio so people know your vibe before they follow.{' '}
                <InternalLink href="/account-settings" className="font-semibold text-[var(--ink)] underline underline-offset-2">
                  Add bio
                </InternalLink>
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="line" block href="/account-settings">
                <PencilSimple aria-hidden="true" />
                Edit profile
              </Button>
              <Button variant="line" block onClick={() => void handleShare()}>
                <ShareNetwork aria-hidden="true" />
                Share
              </Button>
            </div>
          </aside>

          <div className="min-w-0">
            {errorMessage ? (
              <p role="alert" className="g-sm mb-4" style={{ color: 'var(--bad)' }}>
                {errorMessage}
              </p>
            ) : null}

            {showFollowRequests ? (
              <section className="me-sec !mt-0 mb-8">
                <h2>Follow requests</h2>
                <p className="me-sec-sub">{profile.is_public ? 'Public profiles accept followers automatically.' : 'Approve who can see your private activity.'}</p>
                {followRequests.length === 0 ? (
                  <p className="g-sm g-mut">Walang pending requests.</p>
                ) : (
                  <div>
                    {followRequests.map((request) => (
                      <div key={request.id} className="me-prow">
                        <ProfileAvatar profile={request.follower} size="sm" />
                        <InternalLink href={`/u/${encodeURIComponent(request.follower.username)}`}>
                          <span className="g-h3 block truncate">@{request.follower.username}</span>
                          <span className="g-sm g-mut block truncate">{request.follower.bio || 'Wants to follow you.'}</span>
                        </InternalLink>
                        <Button variant="ink" size="sm" onClick={() => void handleFollowRequest(request.id, 'accept')}>
                          Accept
                        </Button>
                        <Button variant="line" size="sm" onClick={() => void handleFollowRequest(request.id, 'reject')}>
                          Reject
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            <SectionHead
              title="Your plans"
              sub={planCount ? plural(planCount, 'plan') : undefined}
              className="!mt-0"
              action={planCount && planCount > PLAN_PREVIEW_LIMIT ? <Button variant="text" size="sm" href="/gala-plans">See all</Button> : undefined}
            />
            {plans.status === 'loading' ? (
              <div className="me-tiles" aria-label="Loading plans">
                {Array.from({ length: 2 }, (_, index) => (
                  <div key={index}>
                    <Skeleton className="!rounded-[var(--r-3)]" style={{ aspectRatio: '4 / 3' }} />
                    <Skeleton className="mt-2 h-4 w-3/4" />
                  </div>
                ))}
              </div>
            ) : plans.status === 'error' ? (
              <Empty title="Hindi ma-load ang plans mo." description={plans.message} />
            ) : plans.data.length === 0 ? (
              <Empty
                title="Wala pang plans."
                description="Describe your gala in one line and let Tara draft it."
                action={
                  <Button variant="tara" href="/plan-with-ai">
                    <Sparkle aria-hidden="true" />
                    Plan with AI
                  </Button>
                }
              />
            ) : (
              <div className="me-tiles">
                {plans.data.slice(0, PLAN_PREVIEW_LIMIT).map((plan) => {
                  const placeCount = plan.places_count ?? plan.place_count ?? 0
                  const hearts = plan.hearts_count ?? plan.heart_count ?? 0
                  return (
                    <PlanTile
                      key={plan.id}
                      href={`/gala-plans/${encodeURIComponent(plan.id)}`}
                      title={plan.title}
                      imageUrl={plan.preview_places?.[0]?.image_url}
                      tag={plan.visibility === 'public' ? 'Public' : 'Private'}
                      meta={[planDateLabel(plan), plural(placeCount, 'stop'), hearts ? plural(hearts, 'heart') : null].filter(Boolean).join(' · ')}
                    />
                  )
                })}
              </div>
            )}

            {passportData && passportData.stamps.length > 0 ? (
              <>
                <SectionHead title="City stamps" sub={plural(passportData.stamps.length, 'stamp')} action={<Button variant="text" size="sm" href="/passport">Open passport</Button>} />
                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none]">
                  {passportData.stamps.slice(0, STAMP_PREVIEW_LIMIT).map((stamp, index) => (
                    <span key={stamp.city} className="me-stamp is-got is-sm" style={{ '--g-rot': `${index % 2 ? 5 : -6}deg` } as CSSProperties} role="img" aria-label={`${stamp.city}, ${plural(stamp.places, 'spot')}`}>
                      <span>
                        <b>{stamp.city}</b>
                        <span>{plural(stamp.places, 'spot')}</span>
                      </span>
                    </span>
                  ))}
                </div>
              </>
            ) : null}

            <nav aria-label="Your stuff" className="me-sec">
              <h2>Your gala</h2>
              <div className="me-rows">
                <MeRow icon={StampIcon} tone="tara" title="Passport" sub={passportSub} href="/passport" />
                <MeRow icon={Heart} title="Saved" sub={savedCount ? plural(savedCount, 'saved place') : 'Tap the heart on a place to keep it'} href="/favorites" />
                <MeRow icon={CalendarBlank} title="Gala plans" sub={planCount ? plural(planCount, 'plan') : 'Plans you made or joined'} href="/gala-plans" />
                <MeRow icon={ClockCounterClockwise} title="History" sub="Places you opened recently" href="/history" />
                <MeRow icon={UserPlus} tone="sea" title="Find friends" sub="Build your barkada" href="/find-friends" />
                <MeRow icon={Eye} title="View public profile" sub="See what others see" href={`/u/${encodeURIComponent(profile.username || '')}`} />
              </div>
            </nav>

            <nav aria-label="Account" className="me-sec">
              <h2>Account</h2>
              <div className="me-rows">
                <MeRow icon={GearSix} title="Account settings" sub="Name, username, photo, privacy" href="/account-settings" />
                <MeRow icon={LockKey} title="Change password" sub="Update how you log in" href="/account-settings/change-password" />
                <MeRow icon={ShieldCheck} title="Privacy center" sub="Data requests and account deletion" href="/privacy-center" />
                <MeRow
                  icon={isDark ? Sun : Moon}
                  title="Dark mode"
                  sub={isDark ? 'On' : 'Off'}
                  checked={isDark}
                  onClick={() => setThemePreference(isDark ? 'light' : 'dark')}
                />
              </div>
            </nav>

            <nav aria-label="Community and help" className="me-sec">
              <h2>Community</h2>
              <div className="me-rows">
                <MeRow icon={MapPinPlus} title="Submit a place" sub="Know a spot we’re missing?" href="/submit-place" />
                <MeRow icon={Notepad} title="My submissions" sub="Review status of places you sent" href="/submissions" />
                <MeRow icon={ChatCenteredText} title="Send feedback" sub="Tell us what to fix or add" href="/feedback" />
                <MeRow icon={Flag} title="My reports" sub="Reports you filed" href="/reports" />
              </div>
            </nav>

            <div className="me-rows mt-6 border-t border-[var(--line-2)] pt-2">
              <MeRow icon={SignOut} title={isSigningOut ? 'Logging out...' : 'Log out'} onClick={() => void handleSignOut()} disabled={isSigningOut} />
            </div>
          </div>
        </div>
      ) : !isLoading ? (
        <Empty className="mt-5" title="Profile unavailable." description={<span role="alert">{errorMessage || 'Try again in a bit.'}</span>} />
      ) : null}

      <FollowListSheet title={listTitle} users={listUsers} emptyLabel="No users yet." onClose={() => setListUsers(null)} />
    </Page>
  )
}

export default ProfilePage
