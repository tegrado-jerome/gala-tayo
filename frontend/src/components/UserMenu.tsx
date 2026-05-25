import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase'

type UserMenuProps = {
  user: User
  compact?: boolean
}

type MenuIconProps = {
  className?: string
}

function HeartIcon({ className = 'h-4 w-4' }: MenuIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z" />
    </svg>
  )
}

function ClockIcon({ className = 'h-4 w-4' }: MenuIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v4.7l3 1.8" />
    </svg>
  )
}

function SignOutIcon({ className = 'h-4 w-4' }: MenuIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M9.5 5H6.8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2.7" />
      <path d="M14 8.5 17.5 12 14 15.5" />
      <path d="M17.5 12H9" />
    </svg>
  )
}

function ChevronIcon({ className = 'h-3.5 w-3.5' }: MenuIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" className={className} aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
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
  const parts = label.split(/[.\s@_-]+/).filter(Boolean)
  const initials = parts
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

function UserMenu({ user, compact = false }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [failedAvatarUrl, setFailedAvatarUrl] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const displayName = getDisplayName(user)
  const email = user.email ?? ''
  const avatarUrl = getAvatarUrl(user)
  const initials = getInitials(user)
  const shouldShowAvatar = avatarUrl.length > 0 && failedAvatarUrl !== avatarUrl

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

    document.body.classList.add('gala-menu-open')

    return () => {
      document.body.classList.remove('gala-menu-open')
    }
  }, [isOpen])

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
      const message = error instanceof Error ? error.message : 'Sign out failed. Try again.'
      setErrorMessage(message)
      setIsSigningOut(false)
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className={`group inline-flex items-center justify-center text-slate-800 transition duration-200 focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/25 ${
          compact
            ? 'mt-1 h-9 w-9 rounded-full bg-transparent p-0 hover:scale-105 active:scale-95'
            : 'h-10 gap-2 rounded-full border border-[rgba(128,163,219,0.7)] bg-white/86 py-1 pl-1.5 pr-3 shadow-[0_10px_22px_rgba(28,77,160,0.12)] backdrop-blur hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-white hover:shadow-[0_14px_28px_rgba(28,77,160,0.17)] active:translate-y-0'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Account menu"
      >
        <span
          className={`relative flex shrink-0 items-center justify-center rounded-full bg-[conic-gradient(from_140deg,#4b8cff,#9b5de5,#4b8cff)] p-[2px] shadow-[0_10px_22px_rgba(47,116,232,0.22)] transition duration-200 group-hover:rotate-3 group-hover:scale-105 group-hover:shadow-[0_14px_28px_rgba(47,116,232,0.32)] ${
            compact ? 'h-9 w-9' : 'h-8 w-8'
          }`}
        >
          <span
            className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,var(--accent),#a855f7)] font-semibold text-white ring-2 ring-white/95 ${
              compact ? 'text-xs' : 'text-xs'
            }`}
          >
            <span className="pointer-events-none absolute inset-x-1 top-0 h-1/2 rounded-full bg-white/22 blur-[1px]" />
            {shouldShowAvatar ? (
              <img
                src={avatarUrl}
                alt=""
                className="relative h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setFailedAvatarUrl(avatarUrl)}
              />
            ) : (
              <span className="relative">{initials}</span>
            )}
          </span>
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white shadow-[0_4px_10px_rgba(28,77,160,0.18)]">
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400/45" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-emerald-500/20" />
          </span>
        </span>
        {!compact ? <span className="max-w-[108px] truncate text-sm font-semibold">{displayName}</span> : null}
      </button>

      {isOpen ? createPortal(
        <>
          <button
            type="button"
            className="gala-menu-backdrop fixed inset-0 z-[5990] bg-slate-950/18"
            aria-label="Close account menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={drawerRef}
            className={
              compact
                ? 'gala-menu-drawer fixed right-0 top-0 z-[6000] flex h-dvh w-[228px] flex-col overflow-hidden rounded-l-[26px] border-l border-white/90 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_34%,#edf4ff_100%)] shadow-[-22px_0_58px_rgba(15,23,42,0.24)] ring-1 ring-white/70'
                : 'gala-menu-drawer fixed right-0 top-0 z-[6000] flex h-dvh w-[292px] flex-col overflow-hidden rounded-l-[28px] border-l border-white/90 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_34%,#edf4ff_100%)] shadow-[-26px_0_68px_rgba(15,23,42,0.26)] ring-1 ring-white/70'
            }
            role="menu"
          >
            <div className={`${compact ? 'top-8 h-12' : 'top-10 h-16'} absolute left-0 w-1 rounded-r-full bg-[linear-gradient(180deg,var(--accent),#7cb3ff)] shadow-[0_0_18px_rgba(47,116,232,0.4)]`} />
            <div
              className={
                compact
                  ? 'relative mx-3 mt-3 overflow-hidden rounded-2xl border border-white/80 bg-white/78 px-3 pb-3 pt-4 shadow-[0_12px_28px_rgba(28,77,160,0.1)]'
                  : 'relative mx-4 mt-4 overflow-hidden rounded-2xl border border-white/80 bg-white/78 px-4 pb-4 pt-5 shadow-[0_14px_32px_rgba(28,77,160,0.12)]'
              }
            >
              <div className={`pointer-events-none absolute rounded-full blur-2xl ${compact ? '-right-8 -top-10 h-24 w-24 bg-[rgba(83,146,255,0.18)]' : '-right-8 -top-10 h-24 w-24 bg-[rgba(83,146,255,0.24)]'}`} />
              <div className={`pointer-events-none absolute rounded-full blur-2xl ${compact ? '-bottom-12 left-8 h-24 w-24 bg-[rgba(171,206,255,0.28)]' : '-bottom-12 left-6 h-24 w-24 bg-[rgba(155,93,229,0.16)]'}`} />
              <div className={`relative flex items-center ${compact ? 'gap-3.5' : 'gap-3'}`}>
                <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,var(--accent),#6ba5ff)] font-semibold text-white shadow-[0_10px_24px_rgba(47,116,232,0.22)] ring-2 ring-white ${compact ? 'h-10 w-10 text-sm' : 'h-10 w-10 text-sm'}`}>
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
              <div className="min-w-0">
                <p className={`truncate font-semibold ${compact ? 'text-[13px] text-slate-950' : 'text-[13px] text-slate-950'}`}>{displayName}</p>
                {email ? <p className={`mt-0.5 truncate text-[10px] ${compact ? 'text-[var(--muted)]' : 'text-[var(--muted)]'}`}>{email}</p> : null}
                <p className="mt-1.5 inline-flex rounded-full border border-[var(--line)] bg-[var(--accent-wash)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-deep)]">Active account</p>
              </div>
            </div>
          </div>

          <div className={`flex-1 space-y-1 bg-transparent ${compact ? 'p-3 pt-3' : 'p-4 pt-4'}`}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Places</p>
            <button
              type="button"
              className={`group flex w-full items-center gap-2.5 rounded-xl text-left font-medium text-slate-700 transition duration-150 hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent-deep)] hover:shadow-[0_10px_22px_rgba(28,77,160,0.1),inset_0_0_0_1px_rgba(83,146,255,0.12)] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/20 ${compact ? 'px-2 py-2 text-[13px]' : 'px-2.5 py-2.5 text-sm'}`}
              role="menuitem"
            >
              <span className={`flex items-center justify-center rounded-lg bg-[#f1f6ff] text-[var(--accent-deep)] transition group-hover:bg-white group-hover:shadow-[0_8px_16px_rgba(28,77,160,0.12)] ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
                <HeartIcon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">Favorites</span>
              <ChevronIcon className="h-3 w-3 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-deep)]" />
            </button>
            <button
              type="button"
              className={`group flex w-full items-center gap-2.5 rounded-xl text-left font-medium text-slate-700 transition duration-150 hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent-deep)] hover:shadow-[0_10px_22px_rgba(28,77,160,0.1),inset_0_0_0_1px_rgba(83,146,255,0.12)] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/20 ${compact ? 'px-2 py-2 text-[13px]' : 'px-2.5 py-2.5 text-sm'}`}
              role="menuitem"
            >
              <span className={`flex items-center justify-center rounded-lg bg-[#f1f6ff] text-[var(--accent-deep)] transition group-hover:bg-white group-hover:shadow-[0_8px_16px_rgba(28,77,160,0.12)] ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
                <ClockIcon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">History</span>
              <ChevronIcon className="h-3 w-3 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-deep)]" />
            </button>
          </div>

          <div className={`border-t border-[var(--line)] bg-white/60 ${compact ? 'p-3' : 'p-4'}`}>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className={`group flex w-full items-center gap-2.5 rounded-xl text-left font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-700 hover:shadow-[inset_0_0_0_1px_rgba(248,113,113,0.15)] focus:outline-none focus:ring-2 focus:ring-red-500/15 disabled:cursor-not-allowed disabled:opacity-70 ${compact ? 'px-2.5 py-2.5 text-[13px]' : 'px-2.5 py-2.5 text-sm'}`}
              role="menuitem"
            >
              <span className={`flex items-center justify-center rounded-lg bg-red-50 text-red-500 transition group-hover:bg-white group-hover:shadow-[0_8px_16px_rgba(220,38,38,0.12)] ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
                {isSigningOut ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-200 border-t-red-600" />
                ) : (
                  <SignOutIcon className="h-3.5 w-3.5" />
                )}
              </span>
              <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </div>

          {errorMessage ? <p className="border-t border-red-100 bg-red-50/70 px-4 py-2 text-xs text-red-600">{errorMessage}</p> : null}
          </div>
        </>,
        document.body,
      ) : null}
    </div>
  )
}

export default UserMenu
