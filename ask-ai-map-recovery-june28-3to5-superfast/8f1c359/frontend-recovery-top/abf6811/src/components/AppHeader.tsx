import { useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import UserMenu from './UserMenu'
import { AppIcon } from './AppIcon'
import { hasSessionUserChanged, shouldPropagateSessionChange, supabase } from '../supabase'
import { getCurrentUser, type CurrentUserResponse } from '../utils/profileApi'
import logoPlaceholder from '../assets/brand/galatayo-logo.webp'

type AppHeaderProps = {
  showTaglishChip?: boolean
  signInLabel?: string
  onBack?: () => void
  mobileCompact?: boolean
  minimal?: boolean
}

function LogoMark() {
  return (
    <button
      type="button"
      onClick={() => {
        window.history.pushState(null, '', '/home')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }}
      className="flex h-14 w-[210px] shrink-0 items-center justify-start transition hover:scale-[1.02] focus:outline-none lg:h-20 lg:w-[220px]"
      aria-label="Go to search"
    >
      <img
        src={logoPlaceholder}
        alt="GalaTayo"
        className="h-full w-full origin-left scale-[1.22] object-contain object-left lg:scale-100"
        loading="eager"
      />
    </button>
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
  minimal: _minimal = false,
}: AppHeaderProps) {
  void _minimal

  const [session, setSession] = useState<Session | null>(null)
  const [currentProfile, setCurrentProfile] = useState<CurrentUserResponse['profile'] | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)
  const sessionRef = useRef<Session | null>(null)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        sessionRef.current = data.session
        setSession(data.session)
        setIsSessionLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const previousSession = sessionRef.current
      const shouldUpdateSession = shouldPropagateSessionChange(event, previousSession, nextSession)

      if (shouldUpdateSession) {
        sessionRef.current = nextSession
        setSession(nextSession)
      }

      setIsSessionLoading(false)

      if (hasSessionUserChanged(previousSession, nextSession) || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setProfileRefreshKey((currentValue) => currentValue + 1)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handleAccountUpdated = () => {
      setProfileRefreshKey((currentValue) => currentValue + 1)
    }

    window.addEventListener('galatayo:account-updated', handleAccountUpdated)

    return () => window.removeEventListener('galatayo:account-updated', handleAccountUpdated)
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
  }, [profileRefreshKey, session?.user?.id])

  const user = session?.user ?? null
  const displayName = user ? getDisplayName(user, currentProfile) : ''
  const avatarUrl = user ? getAvatarUrl(currentProfile) : ''
  const shouldShowAvatar = Boolean(user && avatarUrl && failedAvatarUrl !== avatarUrl)
  const desktopNavButtonClass =
    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'

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
      <button type="button" onClick={() => navigateTo('/favorites')} className={desktopNavButtonClass}>
        <AppIcon name="favorites" size="ui" />
        Favorites
      </button>
      <button type="button" onClick={() => navigateTo('/history')} className={desktopNavButtonClass}>
        <AppIcon name="history" size="ui" />
        History
      </button>
      <button type="button" onClick={() => navigateTo('/gala-plans')} className={desktopNavButtonClass}>
        <AppIcon name="galaPlan" size="ui" />
        Gala Plan
      </button>
      <button type="button" onClick={() => navigateTo('/profiles/search')} className={desktopNavButtonClass}>
        <AppIcon name="profileSearch" size="ui" />
        Find Friends
      </button>
      <button type="button" onClick={() => navigateTo('/profile')} className={desktopNavButtonClass}>
        <AppIcon name="profile" size="ui" />
        Profile
      </button>
      <button type="button" onClick={() => navigateTo('/settings')} className={desktopNavButtonClass}>
        <AppIcon name="settings" size="ui" />
        Settings
      </button>
      <button type="button" onClick={() => navigateTo('/feedback')} className={desktopNavButtonClass}>
        <AppIcon name="comments" size="ui" />
        Feedback
      </button>
      <button type="button" onClick={() => navigateTo('/reports')} className={desktopNavButtonClass}>
        <AppIcon name="reports" size="ui" />
        My Reports
      </button>
      <button type="button" onClick={() => navigateTo('/submit-place')} className={desktopNavButtonClass}>
        <AppIcon name="place" size="ui" />
        Submit Place
      </button>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={isSigningOut}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[13px] font-bold text-slate-600 transition hover:border-[var(--accent-coral-soft)] hover:bg-[var(--accent-coral-wash)] hover:text-[var(--accent-coral-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-coral-soft)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <AppIcon name="logOut" size="ui" />
        {isSigningOut ? 'Logging out...' : 'Log out'}
      </button>
    </nav>
  ) : null

  return (
    <header className="relative z-[5000] w-full overflow-hidden border-b border-[var(--line)] bg-white">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--line)]" />
      <div
        className="relative mx-auto flex h-[68px] w-full max-w-[var(--gala-content-max)] items-center justify-between gap-4 px-[var(--gala-shell-padding)] lg:h-[82px]"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          {mobileCompact && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--text)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] lg:hidden"
              aria-label="Back"
            >
              <AppIcon name="back" size="ui" />
            </button>
          ) : (
            <div className="flex min-w-0 items-center">
              <LogoMark />
            </div>
          )}
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-end gap-4 lg:flex">
          {desktopNav}
          {isSessionLoading ? (
            <div className="h-10 w-[140px] rounded-lg bg-slate-100" aria-hidden="true" />
          ) : user ? (
            <div className="inline-flex h-11 max-w-[240px] items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-2.5 pr-3 text-[var(--text)] transition hover:bg-slate-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-soft)] text-xs font-bold text-[var(--accent-deep)]">
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
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{displayName}</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigateTo('/login')}
              className="gala-primary-button px-5"
            >
              Log in
            </button>
          )}
        </div>

        <div className="lg:hidden">
          {isSessionLoading ? (
            <div className="h-10 w-10 rounded-lg bg-slate-100" aria-hidden="true" />
          ) : (
            <UserMenu user={user} profile={currentProfile} compact />
          )}
        </div>
      </div>
    </header>
  )
}

export default AppHeader
