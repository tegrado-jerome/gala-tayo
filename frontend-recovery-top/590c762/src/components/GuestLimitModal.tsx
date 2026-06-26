import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from './AppIcon'
import GoogleSignInButton from './GoogleSignInButton'

type GuestLimitModalProps = {
  isOpen: boolean
  onClose: () => void
  mode?: 'searchLimit' | 'savePlace'
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
        className="gala-modal-card gala-card relative w-full max-w-[430px] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-limit-title"
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-[rgba(83,146,255,0.16)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-4 h-40 w-40 rounded-full bg-[rgba(171,206,255,0.22)] blur-3xl" />
        <div className="absolute left-0 top-8 h-14 w-1 rounded-r-full bg-[var(--accent)]" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
          aria-label="Close"
        >
          <AppIcon name="clear" className="h-4 w-4" />
        </button>

        <div className="relative mx-4 mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-white px-4 pb-4 pt-5">
          <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[rgba(83,146,255,0.2)] blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 left-8 h-24 w-24 rounded-full bg-[rgba(171,206,255,0.3)] blur-2xl" />
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[var(--line)]" />
          <div className="relative flex items-start gap-3.5">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white">
              <span className="absolute inset-[-4px] rounded-full border border-[var(--accent-soft)]" />
              <AppIcon name="askAi" className="h-5 w-5" />
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
            <div className="group flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-[var(--accent-deep)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f6ff] text-[var(--accent-deep)] transition group-hover:scale-105">
                <AppIcon name="search" className="h-3.5 w-3.5" />
              </span>
              More AI searches
            </div>
            <div className="group flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-[var(--accent-deep)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f6ff] text-[var(--accent-deep)] transition group-hover:scale-105">
                <AppIcon name="favorites" className="h-3.5 w-3.5" />
              </span>
              Save favorites
            </div>
            <div className="group flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-[var(--accent-deep)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f6ff] text-[var(--accent-deep)] transition group-hover:scale-105">
                <AppIcon name="profile" className="h-3.5 w-3.5" />
              </span>
              Personalized picks
            </div>
          </div>

          <div className="mt-5 flex flex-row items-center gap-2.5">
            <GoogleSignInButton />
            <button
              type="button"
              onClick={onClose}
              className="gala-secondary-button h-10 w-[150px] justify-start py-1 pl-1.5 pr-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--accent-deep)] ring-1 ring-[var(--line)]">
                <AppIcon name="history" className="h-4 w-4" />
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
