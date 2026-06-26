import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { AppIcon } from './AppIcon'
import { supabase } from '../supabase'
import type { CurrentUserResponse } from '../utils/profileApi'

type UserMenuProps = {
  user?: User | null
  profile?: CurrentUserResponse['profile'] | null
  compact?: boolean
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

function UserMenu({ user = null, profile = null, compact = false }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const avatarUrl = user ? getAvatarUrl(profile) : ''
  const shouldShowAvatar = Boolean(user && avatarUrl && failedAvatarUrl !== avatarUrl)
  const displayName = user ? getDisplayName(user, profile) : 'Welcome to GalaTayo'
  const initials = user ? getInitials(user, profile) : 'GT'

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

    const scrollY = window.scrollY
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width

    document.documentElement.classList.add('gala-menu-open')
    document.body.classList.add('gala-menu-open')
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.documentElement.classList.remove('gala-menu-open')
      document.body.classList.remove('gala-menu-open')
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      setErrorMessage('')

      const { error } = await supabase.auth.signOut({ scope: 'local' })

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
    setIsHelpOpen(false)
    navigateTo(path)
  }

  const menuItemClass =
    'group flex w-full items-center gap-4 rounded-lg px-3 py-3 text-left text-[15px] font-semibold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
  const menuIconClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--accent-deep)] ring-1 ring-slate-200 transition group-hover:bg-[var(--accent-wash)]'
  const submenuItemClass =
    'group flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
  const submenuIconClass =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--accent-deep)] ring-1 ring-slate-200 transition group-hover:bg-[var(--accent-wash)]'

  const accountButtonAvatar = user && shouldShowAvatar ? (
    <img
      src={avatarUrl}
      alt=""
      className="h-full w-full rounded-full object-cover"
      referrerPolicy="no-referrer"
      onError={() => setFailedAvatarUrl(avatarUrl)}
    />
  ) : user ? (
    <span className="text-xs font-bold">{initials}</span>
  ) : (
    <AppIcon name="profile" className={compact ? 'h-6 w-6' : 'h-4 w-4'} />
  )

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className={
          compact
            ? 'relative mt-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
            : 'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
        }
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        {compact ? (
          <>
            <span className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full ${user ? 'bg-slate-100 text-slate-700' : 'bg-white text-slate-800'}`}>
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
            <AppIcon name="profile" className="h-4 w-4" />
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
                ? 'gala-menu-drawer fixed inset-y-0 right-0 z-[6000] flex w-[300px] max-w-[82vw] flex-col overflow-hidden rounded-l-[16px] border-l border-slate-300 bg-white'
                : 'gala-menu-drawer fixed inset-y-0 right-0 z-[6000] flex w-[380px] max-w-[36vw] flex-col overflow-hidden rounded-l-[16px] border-l border-slate-300 bg-white'
            }
            role="menu"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-white" />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-300"
              aria-label="Close account menu"
            >
              <AppIcon name="clear" size="ui" />
            </button>

            <span className="relative mx-auto mt-3 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />

            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => closeAndNavigate('/profile')}
                  className="relative mx-5 mt-12 block border-b border-slate-200 pb-5 text-center transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
                  role="menuitem"
                >
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
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--accent-deep)]">
                    View profile
                    <AppIcon name="chevronRight" className="h-3.5 w-3.5" />
                  </span>
                </button>

                <nav className="relative flex-1 overflow-y-auto px-4 py-4" aria-label="Account">
                  <button type="button" onClick={() => closeAndNavigate('/favorites')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="favorites" size="ui" /></span>
                    <span className="flex-1">Favorites</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>
                  <button type="button" onClick={() => closeAndNavigate('/history')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="history" size="ui" /></span>
                    <span className="flex-1">History</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>
                  <button type="button" onClick={() => closeAndNavigate('/profiles/search')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="profileSearch" size="ui" /></span>
                    <span className="flex-1">Find Friends</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>
                  <button type="button" onClick={() => closeAndNavigate('/gala-plans')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="galaPlan" size="ui" /></span>
                    <span className="flex-1">Gala Plans</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>
                  <button type="button" onClick={() => closeAndNavigate('/submit-place')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="place" size="ui" /></span>
                    <span className="flex-1">Submit Place</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>

                  <div className="my-3 border-t border-slate-200" />

                  <button type="button" onClick={() => closeAndNavigate('/settings')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="settings" size="ui" /></span>
                    <span className="flex-1">Account Settings</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHelpOpen((currentValue) => !currentValue)}
                    className={menuItemClass}
                    role="menuitem"
                    aria-expanded={isHelpOpen}
                    aria-controls="drawer-help-feedback"
                  >
                    <span className={menuIconClass}><AppIcon name="comments" size="ui" /></span>
                    <span className="flex-1">Help & Feedback</span>
                    <AppIcon name="chevronDown" className={`h-4 w-4 text-slate-500 transition ${isHelpOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isHelpOpen ? (
                    <div id="drawer-help-feedback" className="mb-2 grid gap-1" role="group" aria-label="Help and feedback links">
                      <button type="button" onClick={() => closeAndNavigate('/feedback')} className={submenuItemClass} role="menuitem">
                        <span className={submenuIconClass}><AppIcon name="send" size={16} /></span>
                        <span className="flex-1">Send feedback</span>
                        <AppIcon name="chevronRight" className="h-4 w-4 text-slate-400" />
                      </button>
                      <button type="button" onClick={() => closeAndNavigate('/reports')} className={submenuItemClass} role="menuitem">
                        <span className={submenuIconClass}><AppIcon name="reports" size={16} /></span>
                        <span className="flex-1">My reports</span>
                        <AppIcon name="chevronRight" className="h-4 w-4 text-slate-400" />
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={isSigningOut}
                    className={`${menuItemClass} disabled:cursor-not-allowed disabled:opacity-60`}
                    role="menuitem"
                  >
                    <span className={menuIconClass}>
                      {isSigningOut ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" /> : <AppIcon name="logOut" size="ui" />}
                    </span>
                    <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>
                  </button>
                </nav>
              </>
            ) : (
              <div className="relative flex flex-1 flex-col px-5 pb-5 pt-16 text-center lg:pt-12">
                <div className="flex-1">
                  <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-300">
                    <AppIcon name="profile" size="emptyLg" />
                  </span>
                  <p className="mt-8 text-xl font-bold text-slate-950">Welcome to GalaTayo</p>
                  <p className="mx-auto mt-2 max-w-[260px] text-sm leading-6 text-slate-500">
                    Log in or sign up to save favorites and keep your gala history.
                  </p>
                </div>

                <div className="grid w-full gap-4">
                  <button
                    type="button"
                    onClick={() => closeAndNavigate('/login')}
                    className="gala-primary-button h-14 px-4 text-lg disabled:opacity-70"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {errorMessage ? <p className="mx-5 mb-4 text-sm font-medium text-red-600">{errorMessage}</p> : null}
          </aside>
        </>,
        document.body,
      ) : null}
    </div>
  )
}

export default UserMenu
