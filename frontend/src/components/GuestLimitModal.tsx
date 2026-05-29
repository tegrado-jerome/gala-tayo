import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import GoogleSignInButton from './GoogleSignInButton'

type GuestLimitModalProps = {
  isOpen: boolean
  onClose: () => void
  mode?: 'searchLimit' | 'savePlace'
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true">
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" className="h-4 w-4" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  )
}

function LaterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.8l3.2 1.9" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 4.1 4.1" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 1 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5.5 19a6.7 6.7 0 0 1 13 0" />
    </svg>
  )
}

function GuestLimitModal({ isOpen, onClose, mode = 'searchLimit' }: GuestLimitModalProps) {
  const isSaveMode = mode === 'savePlace'
  const title = isSaveMode
    ? 'Mag-sign in para ma-save mo itong lugar.'
    : 'Naabot mo na ang free searches today.'
  const description = isSaveMode
    ? 'Mag-sign in gamit ang iyong Google account para ma-save mo ang place na ito sa Favorites at mabalikan mo anytime.'
    : 'Mag-sign in gamit ang iyong Google account para makakuha ng mas maraming AI searches, makapag-save ng favorites, at magamit ang GalaTayo nang mas personalized.'
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[7000] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="gala-modal-backdrop absolute inset-0 bg-slate-950/28 backdrop-blur-[3px]"
        aria-label="Close guest limit modal"
        onClick={onClose}
      />

      <section
        className="gala-modal-card relative w-full max-w-[430px] overflow-hidden rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_58%,#edf4ff_100%)] shadow-[0_28px_80px_rgba(15,23,42,0.24)] ring-1 ring-white/70"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-limit-title"
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[rgba(83,146,255,0.16)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-4 h-40 w-40 rounded-full bg-[rgba(171,206,255,0.22)] blur-3xl" />
        <div className="absolute left-0 top-8 h-14 w-1 rounded-r-full bg-[linear-gradient(180deg,var(--accent),#7cb3ff)] shadow-[0_0_18px_rgba(47,116,232,0.38)]" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-white/82 text-slate-500 shadow-[0_8px_18px_rgba(28,77,160,0.1)] transition hover:-translate-y-[1px] hover:rotate-6 hover:bg-white hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300/35"
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        <div className="relative mx-4 mt-4 overflow-hidden rounded-2xl border border-white/80 bg-white/78 px-4 pb-4 pt-5 shadow-[0_14px_32px_rgba(28,77,160,0.12)]">
          <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[rgba(83,146,255,0.2)] blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-[rgba(171,206,255,0.3)] blur-2xl" />
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(47,116,232,0.34),transparent)]" />
          <div className="relative flex items-start gap-3.5">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,var(--accent),#6ba5ff)] text-white shadow-[0_10px_24px_rgba(47,116,232,0.22)] ring-2 ring-white">
              <span className="absolute inset-[-4px] rounded-full border border-[var(--accent-soft)]" />
              <SparkIcon />
            </span>
            <div className="min-w-0 pr-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Daily guest limit</p>
              <h2 id="guest-limit-title" className="mt-1 text-lg font-semibold leading-tight text-slate-950">
                {title}
              </h2>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm leading-6 text-slate-700">
            {description}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="group flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/68 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[0_8px_18px_rgba(28,77,160,0.06)] transition hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent-deep)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f6ff] text-[var(--accent-deep)] transition group-hover:scale-105">
                <SearchIcon />
              </span>
              More AI searches
            </div>
            <div className="group flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/68 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[0_8px_18px_rgba(28,77,160,0.06)] transition hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent-deep)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f6ff] text-[var(--accent-deep)] transition group-hover:scale-105">
                <HeartIcon />
              </span>
              Save favorites
            </div>
            <div className="group flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-white/68 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[0_8px_18px_rgba(28,77,160,0.06)] transition hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent-deep)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f6ff] text-[var(--accent-deep)] transition group-hover:scale-105">
                <UserIcon />
              </span>
              Personalized picks
            </div>
          </div>

          <div className="mt-5 flex flex-row items-center gap-2.5">
            <GoogleSignInButton />
            <button
              type="button"
              onClick={onClose}
              className="group inline-flex h-10 w-[150px] items-center justify-start gap-2 rounded-full border border-[rgba(203,213,225,0.82)] bg-white/86 py-1 pl-1.5 pr-3 text-sm font-semibold text-slate-800 shadow-[0_10px_22px_rgba(28,77,160,0.12)] backdrop-blur transition duration-200 hover:-translate-y-[1px] hover:border-[rgba(148,163,184,0.9)] hover:bg-white hover:shadow-[0_14px_28px_rgba(28,77,160,0.17)] focus:outline-none focus:ring-2 focus:ring-slate-300/35 active:translate-y-0"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[var(--accent-deep)] shadow-[0_6px_14px_rgba(28,77,160,0.08)] ring-1 ring-[var(--line)] transition group-hover:scale-105">
                <LaterIcon />
              </span>
              <span className="whitespace-nowrap font-semibold text-slate-800">Maybe later</span>
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default GuestLimitModal
