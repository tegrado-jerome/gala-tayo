import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import FeedbackModal from './FeedbackModal'
import UserMenu from './UserMenu'
import { supabase } from '../supabase'
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

function FeedbackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4.5 w-4.5" aria-hidden="true">
      <path d="M5 5.5h14v9.5H8.7L5 18.5V5.5Z" />
      <path d="M8.5 9h7" />
      <path d="M8.5 12h4.5" />
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

function getDisplayName(user: User) {
  const metadata = user.user_metadata
  const name = metadata.full_name ?? metadata.name

  return typeof name === 'string' && name.trim().length > 0 ? name : user.email ?? 'Account'
}

function getInitials(user: User) {
  const label = getDisplayName(user)
  const initials = label
    .split(/[.\s@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return initials || 'GT'
}

function getAvatarUrl(user: User) {
  const metadata = user.user_metadata
  const avatarUrl = metadata.avatar_url ?? metadata.picture

  return typeof avatarUrl === 'string' && avatarUrl.length > 0 ? avatarUrl : ''
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
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
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

  const user = session?.user ?? null
  const displayName = user ? getDisplayName(user) : ''
  const avatarUrl = user ? getAvatarUrl(user) : ''
  const shouldShowAvatar = Boolean(user && avatarUrl && failedAvatarUrl !== avatarUrl)

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true)

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) {
        throw error
      }
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      await supabase.auth.signOut()
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
      <button type="button" onClick={() => setIsFeedbackOpen(true)} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[15px] font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-950">
        <FeedbackIcon />
        Feedback
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
      <div className="relative flex h-[72px] w-full items-center justify-between gap-4 px-4 sm:px-6 lg:h-[96px] lg:items-start lg:px-36 lg:pt-[16px]">
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

        <div className="hidden min-w-0 flex-1 items-center justify-end gap-5 lg:mt-3 lg:flex">
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
                  getInitials(user)
                )}
              </span>
              <span className="truncate text-sm font-bold">{displayName}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignIn()}
              disabled={isSigningIn}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningIn ? 'Logging in...' : 'Log in'}
            </button>
          )}
        </div>

        <div className="lg:hidden">
          {isSessionLoading ? (
            <div className="h-10 w-10 rounded-full border border-slate-200 bg-slate-50" aria-hidden="true" />
          ) : (
            <UserMenu user={user} compact />
          )}
        </div>
      </div>
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </header>
  )
}

export default AppHeader
