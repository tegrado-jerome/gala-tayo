import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
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
  fixed?: boolean
}

function LogoMark() {
  return (
    <button
      type="button"
      onClick={() => {
        window.history.pushState(null, '', '/')
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

function navigateTo(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function AppHeader({
  onBack,
  mobileCompact = false,
  minimal: _minimal = false,
  fixed: _fixed = false,
}: AppHeaderProps) {
  void _minimal
  void _fixed

  const [session, setSession] = useState<Session | null>(null)
  const [currentProfile, setCurrentProfile] = useState<CurrentUserResponse['profile'] | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
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
  const desktopNavButtonClass =
    'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'

  const desktopNav = user ? (
    <nav className="hidden min-w-0 items-center gap-1 xl:flex" aria-label="Primary">
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
      <button type="button" onClick={() => navigateTo('/find-friends')} className={desktopNavButtonClass}>
        <AppIcon name="profileSearch" size="ui" />
        Find Friends
      </button>
    </nav>
  ) : null

  return (
    <header className={`${_fixed ? 'fixed left-0 right-0' : 'sticky'} top-0 z-[5000] w-full border-b border-[var(--line)] bg-[var(--bg)]`}>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--line)]" />
      <div
        className="relative mx-auto flex h-[68px] w-full max-w-[var(--gala-content-max)] items-center justify-between gap-4 px-[var(--gala-shell-padding)] lg:h-[82px] lg:gap-6"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          {mobileCompact && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-[var(--text)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] lg:hidden"
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

        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 lg:flex xl:gap-4">
          <div className="xl:hidden">
            <UserMenu user={user} profile={currentProfile} />
          </div>
          {desktopNav}
          {isSessionLoading ? (
            <div className="hidden h-10 w-[140px] rounded-xl bg-slate-100 xl:block" aria-hidden="true" />
          ) : user ? (
            <div className="hidden xl:block">
              <UserMenu user={user} profile={currentProfile} />
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
            <div className="h-10 w-10 rounded-xl bg-slate-100" aria-hidden="true" />
          ) : (
            <UserMenu user={user} profile={currentProfile} compact />
          )}
        </div>
      </div>
    </header>
  )
}

export default AppHeader
