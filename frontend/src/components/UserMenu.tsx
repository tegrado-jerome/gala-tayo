import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from './AppIcon'
import { signOut } from '../services/authApi'
import { useAvatarImageSrc } from '../utils/avatarImageCache'
import type { CurrentUserResponse } from '../utils/profileApi'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
type AccountUser = {
  email: string | null
}

type UserMenuProps = {
  user?: AccountUser | null
  profile?: CurrentUserResponse['profile'] | null
  compact?: boolean
}

const DESKTOP_ACCOUNT_MENU_QUERY = '(min-width: 1024px)'
const MENU_CLOSE_DURATION_MS = 300

function getDisplayName(user: AccountUser, profile: CurrentUserResponse['profile'] | null) {
  return profile?.displayName ?? profile?.username ?? user.email ?? 'Account'
}

function getInitials(user: AccountUser, profile: CurrentUserResponse['profile'] | null) {
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
  const [closing, setClosing] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signingOutUser, setSigningOutUser] = useState<AccountUser | null>(null)
  const [signingOutProfile, setSigningOutProfile] = useState<CurrentUserResponse['profile'] | null>(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const [isDesktopMenu, setIsDesktopMenu] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia(DESKTOP_ACCOUNT_MENU_QUERY).matches
  })
  const menuRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const effectiveUser = user ?? (isSigningOut ? signingOutUser : null)
  const effectiveProfile = profile ?? (isSigningOut ? signingOutProfile : null)
  const avatarUrl = effectiveUser ? getAvatarUrl(effectiveProfile) : ''
  const resolvedAvatarSrc = useAvatarImageSrc(avatarUrl)
  const shouldShowAvatar = Boolean(effectiveUser && avatarUrl && failedAvatarUrl !== avatarUrl)
  const displayName = effectiveUser ? getDisplayName(effectiveUser, effectiveProfile) : 'Guest User'
  const initials = effectiveUser ? getInitials(effectiveUser, effectiveProfile) : 'GT'
  const useDesktopPopover = compact && isDesktopMenu

  const show = isOpen || closing

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => {
      setIsOpen(false)
      setClosing(false)
    }, MENU_CLOSE_DURATION_MS)
  }, [closing])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const mediaQuery = window.matchMedia(DESKTOP_ACCOUNT_MENU_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktopMenu(event.matches)
    }

    setIsDesktopMenu(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const clickedMenuTrigger = menuRef.current?.contains(target) ?? false
      const clickedDrawer = drawerRef.current?.contains(target) ?? false

      if (!clickedMenuTrigger && !clickedDrawer) {
        close()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, close])

  useEffect(() => {
    if (useDesktopPopover || !isOpen) {
      return undefined
    }

    lockBodyScroll()
    document.documentElement.classList.add('gala-menu-open')
    document.body.classList.add('gala-menu-open')

    return () => {
      unlockBodyScroll()
      document.documentElement.classList.remove('gala-menu-open')
      document.body.classList.remove('gala-menu-open')
    }
  }, [isOpen, useDesktopPopover])

  useEffect(() => {
    if (useDesktopPopover || !closing) {
      return undefined
    }

    document.documentElement.classList.remove('gala-menu-open')
    document.body.classList.remove('gala-menu-open')
  }, [closing, useDesktopPopover])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }
    setIsHelpOpen(false)
  }, [isDesktopMenu, isOpen])

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true)
      setSigningOutUser(user)
      setSigningOutProfile(profile)
      setErrorMessage('')

      await signOut({
        scope: 'local',
        onBeforeTransitionEnd: async () => {
          close()
          await new Promise((resolve) => window.setTimeout(resolve, MENU_CLOSE_DURATION_MS))
        },
      })

      setIsSigningOut(false)
      setSigningOutUser(null)
      setSigningOutProfile(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign out failed. Try again.')
      setIsSigningOut(false)
      setSigningOutUser(null)
      setSigningOutProfile(null)
    }
  }

  const closeAndNavigate = (path: string) => {
    setIsHelpOpen(false)
    close()
    setTimeout(() => {
      navigateTo(path)
    }, 300)
  }

  const menuItemClass =
    'group flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-[var(--text-strong)] transition hover:bg-[var(--hover-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
  const menuIconClass =
    'user-menu-nav-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--panel)] text-[var(--accent)] ring-1 ring-[var(--line)] transition group-hover:bg-[var(--accent-wash)]'
  const soonMenuItemClass =
    'pointer-events-none group flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-[var(--text-disabled)] opacity-90'
  const soonMenuIconClass =
    'user-menu-nav-icon user-menu-nav-icon--soon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--panel)] text-[var(--text-disabled)] ring-1 ring-[var(--line)]'
  const helpMenuItemClass =
    'group flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-[var(--text-strong)] transition hover:bg-[var(--hover-surface)] focus:outline-none'
  const helpSubmenuItemClass =
    'group flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--text-strong)] transition hover:bg-[var(--hover-surface)] focus:outline-none'
  const submenuIconClass =
    'user-menu-nav-icon user-menu-nav-icon--submenu flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--panel)] text-[var(--accent)] ring-1 ring-[var(--line)] transition group-hover:bg-[var(--accent-wash)]'
  const panelShellClass = useDesktopPopover
    ? 'gala-menu-popover absolute right-0 top-full z-[7100] mt-3 flex w-[340px] max-w-[min(340px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--surface-overlay)] shadow-[var(--shadow-strong)] backdrop-blur-xl'
    : (compact
        ? 'gala-menu-drawer fixed inset-y-0 right-0 z-[7100] flex w-[300px] max-w-[82vw] flex-col overflow-hidden rounded-l-[24px] border-l border-[var(--line)] bg-[var(--surface-overlay)] shadow-[var(--shadow-strong)]'
        : 'gala-menu-drawer fixed inset-y-0 right-0 z-[7100] flex w-[380px] max-w-[36vw] flex-col overflow-hidden rounded-l-[24px] border-l border-[var(--line)] bg-[var(--surface-overlay)] shadow-[var(--shadow-strong)]') +
      ` ${closing ? 'exit' : 'enter'}`
  const userHeaderClass = useDesktopPopover
    ? 'relative mx-4 mt-4 block rounded-[22px] border border-[var(--line)] bg-[linear-gradient(180deg,var(--panel)_0%,var(--surface-alt)_100%)] px-5 pb-5 pt-4 text-left transition hover:border-[var(--line-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
    : 'relative mx-5 mt-12 block border-b border-[var(--line)] pb-5 text-center transition hover:border-[var(--line-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
  const navClass = useDesktopPopover
    ? 'relative px-3 pb-3 pt-3'
    : 'relative flex-1 overflow-y-auto px-4 py-4'
  const helpGroupClass = useDesktopPopover ? 'mb-2 grid gap-1 pl-2' : 'mb-2 grid gap-1'
  const guestPanelClass = useDesktopPopover
    ? 'relative flex flex-col px-5 pb-6 pt-5 text-center'
    : 'relative flex flex-col px-5 pb-8 pt-16 text-center lg:pt-12'

  const accountButtonAvatar = effectiveUser && shouldShowAvatar ? (
      <img
        src={resolvedAvatarSrc || avatarUrl}
        alt=""
        className="h-full w-full rounded-full object-cover"
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
        onError={() => setFailedAvatarUrl(avatarUrl)}
      />
  ) : effectiveUser ? (
    <span className="text-xs font-bold">{initials}</span>
  ) : (
    <AppIcon name="profile" className={compact ? 'h-6 w-6' : 'h-4 w-4'} />
  )

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            close()
          } else {
            setIsOpen(true)
          }
        }}
        className={
          compact
            ? 'relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--text-main)] shadow-sm transition hover:border-[var(--line-strong)] hover:bg-[var(--hover-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] -mt-0.5'
            : 'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-elevated)] px-4 text-[15px] font-medium text-[var(--text-main)] transition hover:border-[var(--line-strong)] hover:bg-[var(--hover-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]'
        }
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        {compact ? (
          <>
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[var(--text-main)]">
              {accountButtonAvatar}
            </span>
            <span className={`absolute -bottom-px -right-px h-3 w-3 rounded-full border-2 border-[var(--bg)] shadow-sm ${effectiveUser ? 'bg-[#22c55e]' : 'bg-[var(--line-strong)]'}`} aria-hidden="true">
              {effectiveUser ? <span className="absolute inset-0 animate-ping rounded-full bg-[rgba(34,197,94,0.4)]" /> : null}
            </span>
          </>
        ) : effectiveUser ? (
          <>
            <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-soft)] text-[var(--text-strong)] ring-1 ring-[var(--line)]">
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

      {show && !useDesktopPopover ? createPortal(
        <>
          <button
            type="button"
            className={`gala-menu-backdrop fixed inset-0 z-[7090] ${closing ? 'exit' : 'enter'}`}
            style={{ background: 'var(--backdrop)' }}
            aria-label="Close account menu"
            onClick={close}
          />
          <aside
            ref={drawerRef}
            className={panelShellClass}
            role="menu"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[var(--surface-overlay)]" />
            <button
              type="button"
              onClick={close}
              className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface-elevated)] text-[var(--muted)] shadow-[var(--shadow-soft)] transition hover:bg-[var(--hover-surface)] hover:text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
              aria-label="Close account menu"
            >
              <AppIcon name="clear" size="ui" />
            </button>

            <span className="relative mx-auto mt-3 h-1 w-10 rounded-full bg-[var(--line-strong)]" aria-hidden="true" />

            {effectiveUser ? (
              <>
                <button
                  type="button"
                  onClick={() => closeAndNavigate('/profile')}
                  className={userHeaderClass}
                  role="menuitem"
                >
                  <span className={`flex items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xl font-bold text-slate-700 ring-1 ring-slate-300 ${useDesktopPopover ? 'h-16 w-16' : 'mx-auto h-20 w-20'}`}>
                    {shouldShowAvatar ? (
                      <img
                        src={resolvedAvatarSrc || avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="eager"
                        decoding="async"
                        onError={() => setFailedAvatarUrl(avatarUrl)}
                      />
                    ) : (
                      initials
                    )}
                  </span>
                  <div className={useDesktopPopover ? 'mt-3 min-w-0' : undefined}>
                    <p className={`max-w-full truncate font-semibold text-slate-950 ${useDesktopPopover ? 'text-[17px]' : 'mt-3 text-lg'}`}>{displayName}</p>
                    {effectiveUser.email ? <p className="max-w-full truncate text-sm text-slate-600">{effectiveUser.email}</p> : null}
                    <span className="user-menu-view-profile mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                      View profile
                      <AppIcon name="chevronRight" className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>

                <nav className={navClass} aria-label="Account">
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
                  <button type="button" onClick={() => closeAndNavigate('/find-friends')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="profileSearch" size="ui" /></span>
                    <span className="flex-1">Find Friends</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>
                  <div className={soonMenuItemClass} role="menuitem" aria-disabled="true" title="Coming soon">
                    <span className={soonMenuIconClass}><AppIcon name="galaPlan" size="ui" /></span>
                    <span className="flex-1">Gala Plans</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Soon
                    </span>
                  </div>
                  <div className={soonMenuItemClass} role="menuitem" aria-disabled="true" title="Coming soon">
                    <span className={soonMenuIconClass}><AppIcon name="place" size="ui" /></span>
                    <span className="flex-1">Submit Place</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Soon
                    </span>
                  </div>

                  <div className="my-3 border-t border-slate-200" />

                  <button type="button" onClick={() => closeAndNavigate('/account-settings')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="settings" size="ui" /></span>
                    <span className="flex-1">Account Settings</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>
                  <button type="button" onClick={() => closeAndNavigate('/privacy-center')} className={menuItemClass} role="menuitem">
                    <span className={menuIconClass}><AppIcon name="reports" size="ui" /></span>
                    <span className="flex-1">Privacy Center</span>
                    <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHelpOpen((currentValue) => !currentValue)}
                    className={helpMenuItemClass}
                    role="menuitem"
                    aria-expanded={isHelpOpen}
                    aria-controls="drawer-help-feedback"
                  >
                    <span className={menuIconClass}><AppIcon name="comments" size="ui" /></span>
                    <span className="flex-1">Help & Feedback</span>
                    <AppIcon name="chevronDown" className={`h-4 w-4 text-slate-500 transition ${isHelpOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isHelpOpen ? (
                    <div id="drawer-help-feedback" className={helpGroupClass} role="group" aria-label="Help and feedback links">
                      <button type="button" onClick={() => closeAndNavigate('/feedback')} className={helpSubmenuItemClass} role="menuitem">
                        <span className={submenuIconClass}><AppIcon name="send" size={16} /></span>
                        <span className="flex-1">Send feedback</span>
                        <AppIcon name="chevronRight" className="h-4 w-4 text-slate-400" />
                      </button>
                      <button type="button" onClick={() => closeAndNavigate('/reports')} className={helpSubmenuItemClass} role="menuitem">
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
                      <AppIcon name="logOut" size="ui" />
                    </span>
                    <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>
                  </button>
                </nav>
              </>
            ) : (
              <div className={guestPanelClass}>
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-300 text-4xl">
                  <AppIcon name="profile" />
                </span>
                <p className={`${useDesktopPopover ? 'mt-5' : 'mt-8'} text-xl font-semibold text-slate-950`}>Guest User</p>
                <p className="mx-auto mt-2 max-w-[260px] text-sm leading-6 text-slate-500">
                  Log in or sign up to save favorites and keep your gala history.
                </p>

                <div className={`${useDesktopPopover ? 'mt-7' : 'mt-12'} flex flex-col items-center gap-[11px]`}>
                  <button
                    type="button"
                    onClick={() => closeAndNavigate('/login')}
                    className="app-button app-button-primary app-button-md w-full max-w-[240px]"
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => closeAndNavigate('/signup')}
                    className="app-button app-button-secondary app-button-md w-full max-w-[240px]"
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

      {show && useDesktopPopover ? (
        <aside
          ref={drawerRef}
          className={panelShellClass}
          role="menu"
        >
          {effectiveUser ? (
            <>
              <button
                type="button"
                onClick={() => closeAndNavigate('/profile')}
                className={userHeaderClass}
                role="menuitem"
              >
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xl font-bold text-slate-700 ring-1 ring-slate-300">
                  {shouldShowAvatar ? (
                    <img
                      src={resolvedAvatarSrc || avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      loading="eager"
                      decoding="async"
                      onError={() => setFailedAvatarUrl(avatarUrl)}
                    />
                  ) : (
                    initials
                  )}
                </span>
                <div className="mt-3 min-w-0">
                  <p className="max-w-full truncate text-[17px] font-semibold text-slate-950">{displayName}</p>
                  {effectiveUser.email ? <p className="max-w-full truncate text-sm text-slate-600">{effectiveUser.email}</p> : null}
                  <span className="user-menu-view-profile mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                    View profile
                    <AppIcon name="chevronRight" className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>

              <nav className={navClass} aria-label="Account">
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
                <button type="button" onClick={() => closeAndNavigate('/find-friends')} className={menuItemClass} role="menuitem">
                  <span className={menuIconClass}><AppIcon name="profileSearch" size="ui" /></span>
                  <span className="flex-1">Find Friends</span>
                  <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                </button>
                <div className={soonMenuItemClass} role="menuitem" aria-disabled="true" title="Coming soon">
                  <span className={soonMenuIconClass}><AppIcon name="galaPlan" size="ui" /></span>
                  <span className="flex-1">Gala Plans</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Soon
                  </span>
                </div>
                <div className={soonMenuItemClass} role="menuitem" aria-disabled="true" title="Coming soon">
                  <span className={soonMenuIconClass}><AppIcon name="place" size="ui" /></span>
                  <span className="flex-1">Submit Place</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Soon
                  </span>
                </div>

                <div className="my-3 border-t border-slate-200" />

                <button type="button" onClick={() => closeAndNavigate('/account-settings')} className={menuItemClass} role="menuitem">
                  <span className={menuIconClass}><AppIcon name="settings" size="ui" /></span>
                  <span className="flex-1">Account Settings</span>
                  <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                </button>
                <button type="button" onClick={() => closeAndNavigate('/privacy-center')} className={menuItemClass} role="menuitem">
                  <span className={menuIconClass}><AppIcon name="reports" size="ui" /></span>
                  <span className="flex-1">Privacy Center</span>
                  <AppIcon name="chevronRight" className="h-4 w-4 text-slate-500" />
                </button>
                <button
                  type="button"
                    onClick={() => setIsHelpOpen((currentValue) => !currentValue)}
                    className={helpMenuItemClass}
                    role="menuitem"
                    aria-expanded={isHelpOpen}
                    aria-controls="drawer-help-feedback"
                  >
                    <span className={menuIconClass}><AppIcon name="comments" size="ui" /></span>
                    <span className="flex-1">Help & Feedback</span>
                    <AppIcon name="chevronDown" className={`h-4 w-4 text-slate-500 transition ${isHelpOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isHelpOpen ? (
                    <div id="drawer-help-feedback" className={helpGroupClass} role="group" aria-label="Help and feedback links">
                      <button type="button" onClick={() => closeAndNavigate('/feedback')} className={helpSubmenuItemClass} role="menuitem">
                        <span className={submenuIconClass}><AppIcon name="send" size={16} /></span>
                        <span className="flex-1">Send feedback</span>
                        <AppIcon name="chevronRight" className="h-4 w-4 text-slate-400" />
                      </button>
                      <button type="button" onClick={() => closeAndNavigate('/reports')} className={helpSubmenuItemClass} role="menuitem">
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
                    <AppIcon name="logOut" size="ui" />
                  </span>
                  <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>
                </button>
              </nav>
            </>
            ) : (
            <div className={guestPanelClass}>
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-300 text-4xl">
                <AppIcon name="profile" />
                </span>
                <p className="mt-5 text-xl font-semibold text-slate-950">Guest User</p>
              <p className="mx-auto mt-2 max-w-[260px] text-sm leading-6 text-slate-500">
                Log in or sign up to save favorites and keep your gala history.
              </p>

              <div className="mt-7 flex flex-col items-center gap-[11px]">
                <button
                  type="button"
                  onClick={() => closeAndNavigate('/login')}
                  className="app-button app-button-primary app-button-md w-full max-w-[240px]"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => closeAndNavigate('/signup')}
                  className="app-button app-button-secondary app-button-md w-full max-w-[240px]"
                >
                  Sign up
                </button>
              </div>
            </div>
          )}

          {errorMessage ? <p className="mx-5 mb-4 text-sm font-medium text-red-600">{errorMessage}</p> : null}
        </aside>
      ) : null}
    </div>
  )
}

export default UserMenu
