import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import UserMenu from './UserMenu'
import { supabase } from '../supabase'
import { getCurrentUser, type CurrentUserResponse } from '../utils/profileApi'
import logoPlaceholder from '../assets/brand/galatayo-logo.webp'

type AppHeaderProps = {
  showTaglishChip?: boolean
  signInLabel?: string
  onBack?: () => void
  mobileCompact?: boolean
}

function LogoMark() {
  return (
    <button
      type="button"
      onClick={() => {
        window.history.pushState(null, '', '/search')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }}
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 shadow-[0_5px_14px_rgba(15,23,42,0.12)] ring-1 ring-slate-200 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-slate-300 lg:h-16 lg:w-16"
      aria-label="Go to search"
    >
      <img src={logoPlaceholder} alt="" className="h-full w-full object-cover" loading="eager" />
    </button>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.7l3 1.8" />
    </svg>
  )
}

function PlanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M7 4.5h10a2 2 0 0 1 2 2V20l-3-1.7L13 20l-3-1.7L7 20l-2-1.1V6.5a2 2 0 0 1 2-2Z" />
      <path d="M8.5 9h7" />
      <path d="M8.5 12.5h5" />
    </svg>
  )
}

function SearchUserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <circle cx="10.5" cy="8.2" r="3.2" />
      <path d="M4.5 18a6.2 6.2 0 0 1 10.5-3.8" />
      <circle cx="17" cy="17" r="2.6" />
      <path d="m19 19 2 2" />
    </svg>
  )
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5.5 19a6.7 6.7 0 0 1 13 0" />
    </svg>
  )
}

function FeedbackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M5 5.5h14v9.5H8.7L5 18.5V5.5Z" />
      <path d="M8.5 9h7" />
      <path d="M8.5 12h4.5" />
    </svg>
  )
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M6 20V5" />
      <path d="M6 5h10.5l-1.7 3 1.7 3H6" />
    </svg>
  )
}

function NoticeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M12 3.5 20 7v5.5c0 4.5-3.1 7.1-8 8-4.9-.9-8-3.5-8-8V7l8-3.5Z" />
      <path d="M8.5 11.8h7" />
      <path d="M8.5 15h4.5" />
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M9.5 5H6.8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2.7" />
      <path d="M14 8.5 17.5 12 14 15.5" />
      <path d="M17.5 12H9" />
    </svg>
  )
}

function getDisplayName(user: User, profile: CurrentUserResponse['profile'] | null) {
  return profile?.displayName ?? profile?.username ?? user.email ?? 'Account'
}

function getInitials(user: User, profile: CurrentUserResponse['profile'] | null) {
  const label = getDisplayName(user, profile)
  const initials = label
    .split(/[.\s@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return initials || 'GT'
}

function getAvatarUrl(profile: CurrentUserResponse['profile'] | null) {
  return profile?.avatarUrl ?? profile?.providerAvatarUrl ?? ''
}

function navigateTo(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function AppHeader({
  onBack,
  mobileCompact = false,
}: AppHeaderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [currentProfile, setCurrentProfile] = useState<CurrentUserResponse['profile'] | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const [isSigningOut, setIsSigningOut] = useState(false)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsSessionLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    if (!session) {
      setCurrentProfile(null)
      return undefined
    }

    void getCurrentUser(session)
      .then((data) => {
        if (isMounted) {
          setCurrentProfile(data.profile)
        }
      })
      .catch(() => {
        if (isMounted) {
          setCurrentProfile(null)
        }
      })

    return () => {
      isMounted = false
    }
  }, [session])

  const user = session?.user ?? null
  const displayName = user ? getDisplayName(user, currentProfile) : ''
  const avatarUrl = user ? getAvatarUrl(currentProfile) : ''
  const shouldShowAvatar = Boolean(user && avatarUrl && failedAvatarUrl !== avatarUrl)

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      await supabase.auth.signOut({ scope: 'local' })
    } finally {
      setIsSigningOut(false)
    }
  }

  const desktopNav = user ? (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
      <button type="button" onClick={() => navigateTo('/favorites')} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <HeartIcon />
        Favorites
      </button>
      <button type="button" onClick={() => navigateTo('/history')} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <ClockIcon />
        History
      </button>
      <button type="button" onClick={() => navigateTo('/gala-plans')} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <PlanIcon />
        Gala Plans
      </button>
      <button type="button" onClick={() => navigateTo('/profiles/search')} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <SearchUserIcon />
        Find Friends
      </button>
      <button type="button" onClick={() => navigateTo('/profile')} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <ProfileIcon />
        Profile
      </button>
      <button type="button" onClick={() => navigateTo('/feedback')} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <FeedbackIcon />
        Feedback
      </button>
      <button type="button" onClick={() => navigateTo('/reports')} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <FlagIcon />
        My Reports
      </button>
      <button type="button" onClick={() => navigateTo('/comment-notices')} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <NoticeIcon />
        Notices
      </button>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={isSigningOut}
        className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-[15px] font-bold text-red-600 transition hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOutIcon />
        {isSigningOut ? 'Logging out...' : 'Log out'}
      </button>
    </nav>
  ) : null

  return (
    <header className="relative z-[5000] w-full overflow-hidden border-b border-slate-200 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[linear-gradient(90deg,rgba(219,234,254,0.55),rgba(255,255,255,0.9),rgba(240,249,255,0.65))] lg:hidden" />
      <div className="relative flex h-[72px] w-full items-center justify-between gap-4 px-4 sm:px-6 lg:h-[96px] lg:items-start lg:px-10 lg:pt-[16px] xl:px-14">
        <div className="flex min-w-0 items-center gap-3.5">
          {mobileCompact && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 lg:hidden"
              aria-label="Back"
            >
              <BackIcon />
            </button>
          ) : (
            <LogoMark />
          )}
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-end gap-5 lg:mt-2 lg:flex">
          {desktopNav}
          {isSessionLoading ? (
            <div className="h-11 w-[150px] rounded-lg border border-slate-200 bg-slate-50" aria-hidden="true" />
          ) : user ? (
            <div className="inline-flex h-12 max-w-[260px] items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                {shouldShowAvatar ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedAvatarUrl(avatarUrl)}
                  />
                ) : (
                    getInitials(user, currentProfile)
                )}
              </span>
              <span className="truncate text-sm font-bold">{displayName}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigateTo('/auth')}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Log in
            </button>
          )}
        </div>

        <div className="lg:hidden">
          {isSessionLoading ? (
            <div className="h-10 w-10 rounded-full border border-slate-200 bg-slate-50" aria-hidden="true" />
          ) : (
            <UserMenu user={user} profile={currentProfile} compact />
          )}
        </div>
      </div>
    </header>
  )
}

export default AppHeader
