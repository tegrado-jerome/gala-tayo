import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import FeedbackModal from './FeedbackModal'

type UserMenuProps = {
  user?: User | null
  compact?: boolean
}

type IconProps = {
  className?: string
}

function UserIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5.5 19a6.7 6.7 0 0 1 13 0" />
    </svg>
  )
}

function HeartIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z" />
    </svg>
  )
}

function ClockIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.7l3 1.8" />
    </svg>
  )
}

function FeedbackIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M5 5.5h14v9.5H8.7L5 18.5V5.5Z" />
      <path d="M8.5 9h7" />
      <path d="M8.5 12h4.5" />
    </svg>
  )
}

function SparkIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m18.4 5.6-2.8 2.8" />
      <path d="m8.4 15.6-2.8 2.8" />
    </svg>
  )
}

function SettingsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="2.8" />
      <path d="M19 13.4a7.2 7.2 0 0 0 0-2.8l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-2.4-1.4L14 2.8h-4l-.4 2.5a7.6 7.6 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.5a7.2 7.2 0 0 0 0 2.8l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 2.4 1.4l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.4-1.4l2.4 1 2-3.4-2.2-1.5Z" />
    </svg>
  )
}

function SignOutIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M9.5 5H6.8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2.7" />
      <path d="M14 8.5 17.5 12 14 15.5" />
      <path d="M17.5 12H9" />
    </svg>
  )
}

function ChevronIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function CloseIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
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

function UserMenu({ user = null, compact = false }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const avatarUrl = user ? getAvatarUrl(user) : ''
  const shouldShowAvatar = Boolean(user && avatarUrl && failedAvatarUrl !== avatarUrl)
  const displayName = user ? getDisplayName(user) : 'Welcome to GalaTayo'
  const initials = user ? getInitials(user) : 'GT'

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        drawerRef.current &&
        !drawerRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow

    document.body.classList.add('gala-menu-open')
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.classList.remove('gala-menu-open')
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true)
      setErrorMessage('')

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign in failed. Try again.')
      setIsSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      setErrorMessage('')

      const { error } = await supabase.auth.signOut()

      if (error) {
        throw error
      }

      setIsOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign out failed. Try again.')
      setIsSigningOut(false)
    }
  }

  const closeAndNavigate = (path: string) => {
    setIsOpen(false)
    navigateTo(path)
  }

  const openFeedback = () => {
    setIsOpen(false)
    setIsFeedbackOpen(true)
  }

  const menuItemClass =
    'group flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left text-[15px] font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200'
  const menuIconClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-800 ring-1 ring-slate-200 transition group-hover:bg-slate-100'

  const accountButtonAvatar = user && shouldShowAvatar ? (
    <img
      src={avatarUrl}
      alt=""
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailedAvatarUrl(avatarUrl)}
    />
  ) : user ? (
    <span className="text-xs font-bold">{initials}</span>
  ) : (
    <UserIcon className={compact ? 'h-6 w-6' : 'h-4 w-4'} />
  )

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className={
          compact
            ? 'relative mt-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white bg-white text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.16)] ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300'
            : 'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300'
        }
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        {compact ? (
          <>
            <span className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full ${user ? 'bg-slate-100 text-slate-700' : 'bg-[linear-gradient(180deg,#ffffff,#f1f5f9)] text-slate-800'}`}>
              {accountButtonAvatar}
            </span>
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white shadow-sm ${user ? 'bg-emerald-400' : 'bg-slate-300'}`} aria-hidden="true">
              {user ? <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" /> : null}
            </span>
          </>
        ) : user ? (
          <>
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200">
              {accountButtonAvatar}
            </span>
            <span>Profile</span>
          </>
        ) : (
          <>
            <UserIcon className="h-4 w-4" />
            <span>Log in</span>
          </>
        )}
      </button>

      {isOpen ? createPortal(
        <>
          <button
            type="button"
            className="gala-menu-backdrop fixed inset-0 z-[5990] bg-slate-950/25"
            aria-label="Close account menu"
            onClick={() => setIsOpen(false)}
          />
          <aside
            ref={drawerRef}
            className={
              compact
                ? 'gala-menu-drawer fixed inset-y-0 right-0 z-[6000] flex w-[300px] max-w-[82vw] flex-col overflow-hidden rounded-l-[24px] border-l border-slate-300 bg-white shadow-[-20px_0_54px_rgba(15,23,42,0.2)]'
                : 'gala-menu-drawer fixed inset-y-0 right-0 z-[6000] flex w-[380px] max-w-[36vw] flex-col overflow-hidden rounded-l-[24px] border-l border-slate-300 bg-white shadow-[-24px_0_70px_rgba(15,23,42,0.18)]'
            }
            role="menu"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,#fafafa,rgba(250,250,250,0))]" />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-300"
              aria-label="Close account menu"
            >
              <CloseIcon />
            </button>

            <span className="relative mx-auto mt-3 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />

            {user ? (
              <>
                <div className="relative mx-5 mt-12 border-b border-slate-200 pb-5 text-center">
                  <span className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xl font-bold text-slate-700 ring-1 ring-slate-300">
                    {shouldShowAvatar ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedAvatarUrl(avatarUrl)}
                      />
                    ) : (
                      initials
                    )}
                  </span>
                  <p className="mt-3 max-w-full truncate text-lg font-bold text-slate-950">{displayName}</p>
                  {user.email ? <p className="max-w-full truncate text-sm text-slate-600">{user.email}</p> : null}
                </div>

                <nav className="relative flex-1 overflow-y-auto px-4 py-4" aria-label="Account">
                  <button type="button" onClick={() => closeAndNavigate('/favorites')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><HeartIcon /></span>
                    <span className="flex-1">Favorites</span>
                    <ChevronIcon className="h-4 w-4 text-slate-500" />
                  </button>
                  <button type="button" onClick={() => closeAndNavigate('/history')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><ClockIcon /></span>
                    <span className="flex-1">History</span>
                    <ChevronIcon className="h-4 w-4 text-slate-500" />
                  </button>
                  <button type="button" onClick={openFeedback} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><FeedbackIcon /></span>
                    <span className="flex-1">Feedback</span>
                    <ChevronIcon className="h-4 w-4 text-slate-500" />
                  </button>
                  <button type="button" onClick={() => closeAndNavigate('/search')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><SparkIcon /></span>
                    <span className="flex-1">Prompt Builder</span>
                    <ChevronIcon className="h-4 w-4 text-slate-500" />
                  </button>

                  <div className="my-3 border-t border-slate-200" />

                  <button type="button" onClick={() => setIsOpen(false)} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><SettingsIcon /></span>
                    <span className="flex-1">Account settings</span>
                    <ChevronIcon className="h-4 w-4 text-slate-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={isSigningOut}
                    className={`${menuItemClass} disabled:cursor-not-allowed disabled:opacity-60`}
                    role="menuitem"
                  >
                    <span className={menuIconClass}>
                      {isSigningOut ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" /> : <SignOutIcon />}
                    </span>
                    <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>
                  </button>
                </nav>
              </>
            ) : (
              <div className="relative flex flex-1 flex-col px-5 pb-5 pt-16 text-center lg:pt-12">
                <div className="flex-1">
                  <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-300">
                    <UserIcon className="h-10 w-10" />
                  </span>
                  <p className="mt-8 text-xl font-bold text-slate-950">Welcome to GalaTayo</p>
                  <p className="mx-auto mt-2 max-w-[260px] text-sm leading-6 text-slate-500">
                    Log in or sign up to save favorites and keep your gala history.
                  </p>
                </div>

                <div className="grid w-full gap-4">
                  <button
                    type="button"
                    onClick={() => void handleSignIn()}
                    disabled={isSigningIn}
                    className="h-14 rounded-lg bg-slate-600 px-4 text-lg font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSigningIn ? 'Logging in...' : 'Log in'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSignIn()}
                    disabled={isSigningIn}
                    className="h-14 rounded-lg border border-slate-400 bg-white px-4 text-lg font-bold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Sign up
                  </button>
                </div>
              </div>
            )}

            {errorMessage ? <p className="mx-5 mb-4 text-sm font-medium text-red-600">{errorMessage}</p> : null}
          </aside>
        </>,
        document.body,
      ) : null}
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
    </div>
  )
}

export default UserMenu
