import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { CalendarBlank as CalendarDays } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { CaretDown as ChevronDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretRight as ChevronRight } from '@phosphor-icons/react/dist/csr/CaretRight'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { ClockCounterClockwise as History } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise'
import { SignOut as LogOut } from '@phosphor-icons/react/dist/csr/SignOut'
import { MapPinPlus } from '@phosphor-icons/react/dist/csr/MapPinPlus'
import { ChatCenteredText as MessageSquare } from '@phosphor-icons/react/dist/csr/ChatCenteredText'
import { Moon } from '@phosphor-icons/react/dist/csr/Moon'
import { PaperPlaneTilt as Send } from '@phosphor-icons/react/dist/csr/PaperPlaneTilt'
import { GearSix as Settings } from '@phosphor-icons/react/dist/csr/GearSix'
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import { Stamp } from '@phosphor-icons/react/dist/csr/Stamp'
import { Sun } from '@phosphor-icons/react/dist/csr/Sun'
import { User } from '@phosphor-icons/react/dist/csr/User'
import { UserPlus } from '@phosphor-icons/react/dist/csr/UserPlus'
import { Avatar, Button, Sheet, cx } from './ui'
import { useTheme } from '../context/ThemeContext'
import { signOut } from '../services/authApi'
import { useAvatarImageSrc } from '../utils/avatarImageCache'
import type { CurrentUserResponse } from '../utils/profileApi'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
import { resizedMediaUrl } from '../data/r2Config'

type AccountUser = {
  email: string | null
}

type UserMenuProps = {
  user?: AccountUser | null
  profile?: CurrentUserResponse['profile'] | null
  compact?: boolean
}

type MenuLink = { path: string; label: string; icon: PhosphorIcon }

const DESKTOP_ACCOUNT_MENU_QUERY = '(min-width: 1024px)'

const PRIMARY_LINKS: MenuLink[] = [
  { path: '/passport', label: 'Passport', icon: Stamp },
  { path: '/favorites', label: 'Saved', icon: Heart },
  { path: '/history', label: 'History', icon: History },
  { path: '/gala-plans', label: 'Gala plans', icon: CalendarDays },
  { path: '/find-friends', label: 'Find friends', icon: UserPlus },
  { path: '/submit-place', label: 'Submit a place', icon: MapPinPlus },
]

const ACCOUNT_LINKS: MenuLink[] = [
  { path: '/account-settings', label: 'Settings', icon: Settings },
  { path: '/privacy-center', label: 'Privacy center', icon: ShieldCheck },
]

const HELP_LINKS: MenuLink[] = [
  { path: '/feedback', label: 'Send feedback', icon: Send },
  { path: '/reports', label: 'My reports', icon: Flag },
]

const ITEM_CLASS = 'flex min-h-[46px] w-full items-center gap-3 rounded-[var(--r-2)] px-3 text-left text-[15px] font-medium hover:bg-[var(--fill)] focus-visible:bg-[var(--fill)] focus-visible:outline-none disabled:opacity-60'

function getDisplayName(user: AccountUser, profile: CurrentUserResponse['profile'] | null) {
  return profile?.displayName ?? profile?.username ?? user.email ?? 'Account'
}

function AccountAvatar({ src, name, size, onError }: { src: string | null; name: string; size: number; onError: () => void }) {
  if (!src) return <Avatar name={name} size={size} />
  return <img className="g-av" style={{ width: size, height: size }} src={resizedMediaUrl(src, 'thumb')} alt="" referrerPolicy="no-referrer" decoding="async" onError={onError} />
}

function UserMenu({ user = null, profile = null, compact = false }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signingOutUser, setSigningOutUser] = useState<AccountUser | null>(null)
  const [signingOutProfile, setSigningOutProfile] = useState<CurrentUserResponse['profile'] | null>(null)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const [isDesktopMenu, setIsDesktopMenu] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_ACCOUNT_MENU_QUERY).matches)
  const menuRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme, setThemePreference } = useTheme()

  const effectiveUser = user ?? (isSigningOut ? signingOutUser : null)
  const effectiveProfile = profile ?? (isSigningOut ? signingOutProfile : null)
  const avatarUrl = effectiveUser ? (effectiveProfile?.avatarUrl ?? effectiveProfile?.providerAvatarUrl ?? '') : ''
  const resolvedAvatarSrc = useAvatarImageSrc(avatarUrl)
  const avatarSrc = avatarUrl && failedAvatarUrl !== avatarUrl ? resolvedAvatarSrc || avatarUrl : null
  const displayName = effectiveUser ? getDisplayName(effectiveUser, effectiveProfile) : 'Guest'
  const useDesktopPopover = compact && isDesktopMenu
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
  const ThemeIcon = resolvedTheme === 'dark' ? Sun : Moon

  const close = useCallback(() => {
    setIsOpen(false)
    setIsHelpOpen(false)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_ACCOUNT_MENU_QUERY)
    const handleChange = (event: MediaQueryListEvent) => setIsDesktopMenu(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (useDesktopPopover && !menuRef.current?.contains(event.target as Node)) close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, useDesktopPopover, close])

  useEffect(() => {
    if (useDesktopPopover || !isOpen) return undefined
    lockBodyScroll()
    return () => unlockBodyScroll()
  }, [isOpen, useDesktopPopover])

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
          replaceWithPath('/')
        },
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign out failed. Try again.')
    } finally {
      setIsSigningOut(false)
      setSigningOutUser(null)
      setSigningOutProfile(null)
    }
  }

  const closeAndNavigate = (path: string) => {
    close()
    navigateToPath(path)
  }

  const renderLink = ({ path, label, icon: Icon }: MenuLink) => (
    <button key={path} type="button" role="menuitem" className={ITEM_CLASS} onClick={() => closeAndNavigate(path)}>
      <Icon className="g-ic" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )

  const separator = <hr className="g-sep my-2" />

  const panel = effectiveUser ? (
    <div role="menu" aria-label="Account" style={{ color: 'var(--ink)' }}>
      <button type="button" role="menuitem" className={cx(ITEM_CLASS, 'min-h-[72px] gap-3')} onClick={() => closeAndNavigate('/profile')}>
        <AccountAvatar src={avatarSrc} name={displayName} size={48} onError={() => setFailedAvatarUrl(avatarUrl)} />
        <span className="min-w-0 flex-1">
          <span className="g-h3 block truncate">{displayName}</span>
          <span className="g-xs g-mut block truncate">Show profile</span>
        </span>
        <ChevronRight className="g-ic g-fnt" aria-hidden="true" />
      </button>
      {separator}
      {PRIMARY_LINKS.map(renderLink)}
      {separator}
      {ACCOUNT_LINKS.map(renderLink)}
      <button type="button" role="menuitem" className={ITEM_CLASS} aria-expanded={isHelpOpen} onClick={() => setIsHelpOpen((value) => !value)}>
        <MessageSquare className="g-ic" aria-hidden="true" />
        <span className="flex-1">Help & feedback</span>
        <ChevronDown className={cx('g-ic g-fnt transition-transform', isHelpOpen && 'rotate-180')} aria-hidden="true" />
      </button>
      {isHelpOpen ? (
        <div className="pl-6" role="group" aria-label="Help and feedback links">
          {HELP_LINKS.map(renderLink)}
        </div>
      ) : null}
      <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => setThemePreference(nextTheme)}>
        <ThemeIcon className="g-ic" aria-hidden="true" />
        <span className="flex-1">{nextTheme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
      </button>
      {separator}
      <button type="button" role="menuitem" className={ITEM_CLASS} onClick={() => void handleSignOut()} disabled={isSigningOut}>
        <LogOut className="g-ic" aria-hidden="true" />
        <span>{isSigningOut ? 'Logging out...' : 'Log out'}</span>
      </button>
      {errorMessage ? (
        <p role="alert" className="g-sm mt-2 px-3" style={{ color: 'var(--bad)' }}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  ) : (
    <div className="px-2 py-3 text-center">
      <p className="g-h3">Hi, guest</p>
      <p className="g-sm g-mut mx-auto mt-1 max-w-[260px]">Log in to save places, build plans, and keep your gala history.</p>
      <div className="mt-5 grid gap-2">
        <Button variant="ink" block onClick={() => closeAndNavigate('/login')}>
          Log in
        </Button>
        <Button variant="line" block onClick={() => closeAndNavigate('/signup')}>
          Sign up
        </Button>
      </div>
      <Button variant="text" size="sm" className="mt-3" onClick={() => setThemePreference(nextTheme)}>
        <ThemeIcon aria-hidden="true" />
        {nextTheme === 'dark' ? 'Dark mode' : 'Light mode'}
      </Button>
    </div>
  )

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        className={cx('inline-flex items-center justify-center gap-2 rounded-full', compact ? 'h-11 w-11' : 'h-11 px-2 pr-4')}
        style={compact ? undefined : { boxShadow: 'inset 0 0 0 1px var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        {effectiveUser ? (
          <AccountAvatar src={avatarSrc} name={displayName} size={compact ? 36 : 28} onError={() => setFailedAvatarUrl(avatarUrl)} />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: 'var(--fill)', color: 'var(--ink)' }}>
            <User className="g-ic" aria-hidden="true" />
          </span>
        )}
        {compact ? null : <span className="text-[15px] font-medium">{effectiveUser ? 'Profile' : 'Log in'}</span>}
      </button>

      {isOpen && useDesktopPopover ? (
        <div
          className="absolute right-0 top-full z-[7100] mt-2 max-h-[calc(100vh-96px)] w-[300px] overflow-y-auto p-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-3)', boxShadow: 'var(--sh-3)' }}
        >
          {panel}
        </div>
      ) : null}

      {!useDesktopPopover && typeof document !== 'undefined'
        ? createPortal(
            <Sheet open={isOpen} onClose={close}>
              {panel}
            </Sheet>,
            document.body,
          )
        : null}
    </div>
  )
}

export default UserMenu
