import { useEffect, useRef, useState } from 'react'
import type { PlaceCardData } from './PlaceCard'
import { copyPlaceLink, getPlatformShareLinks } from '../utils/sharePlace'
import emailLogo from '../assets/share-logos/email.svg'
import facebookLogo from '../assets/share-logos/facebook.svg'
import instagramLogo from '../assets/share-logos/instagram.svg'
import messengerLogo from '../assets/share-logos/messenger.svg'
import telegramLogo from '../assets/share-logos/telegram.svg'
import viberLogo from '../assets/share-logos/viber.svg'
import whatsappLogo from '../assets/share-logos/whatsapp.svg'

type SharePlaceModalProps = {
  place: PlaceCardData
  isOpen: boolean
  onClose: () => void
}

type OpenPlatformId = 'facebook' | 'viber' | 'telegram' | 'whatsapp' | 'email'
type CopyPlatformId = 'instagram'
type PlatformId = OpenPlatformId | CopyPlatformId

type ShareOption = {
  id: PlatformId
  label: string
  description: string
  brandClassName: string
  logoSrc: string
  action: 'open' | 'copy'
}

const shareOptions: ShareOption[] = [
  {
    id: 'facebook',
    label: 'Facebook',
    description: 'Post to your feed',
    brandClassName: 'bg-[#1877f2] text-white',
    logoSrc: facebookLogo,
    action: 'open',
  },
  {
    id: 'viber',
    label: 'Viber',
    description: 'Open Viber share',
    brandClassName: 'bg-[#7360f2] text-white',
    logoSrc: viberLogo,
    action: 'open',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Send to a chat',
    brandClassName: 'bg-[#2aabee] text-white',
    logoSrc: telegramLogo,
    action: 'open',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Share to contacts',
    brandClassName: 'bg-[#25d366] text-white',
    logoSrc: whatsappLogo,
    action: 'open',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: 'Copy for DM or story',
    brandClassName: 'bg-[radial-gradient(circle_at_30%_110%,#fdf497_0%,#fdf497_18%,#fd5949_45%,#d6249f_68%,#285AEB_100%)] text-white',
    logoSrc: instagramLogo,
    action: 'copy',
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Open email draft',
    brandClassName: 'bg-[#ea4335] text-white',
    logoSrc: emailLogo,
    action: 'open',
  },
]

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" />
    </svg>
  )
}

function PlatformButton({
  label,
  description,
  brandClassName,
  logoSrc,
  onClick,
}: {
  label: string
  description: string
  brandClassName: string
  logoSrc?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 items-center gap-2 rounded-xl border border-[var(--line)] bg-white/96 p-2 text-left shadow-[0_8px_18px_rgba(28,77,160,0.045)] transition hover:-translate-y-[1px] hover:border-[var(--accent)] hover:bg-white hover:shadow-[0_14px_28px_rgba(28,77,160,0.12)] sm:gap-3 sm:p-3"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center sm:h-12 sm:w-12 ${
          logoSrc ? '' : `rounded-full shadow-[0_10px_18px_rgba(28,77,160,0.14)] ${brandClassName}`
        }`}
      >
        {logoSrc ? <img src={logoSrc} alt="" className="h-8 w-8 object-contain sm:h-9 sm:w-9" /> : <LinkIcon />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-slate-800 sm:text-sm">{label}</span>
        <span className="block truncate text-[9px] text-[var(--muted)] sm:text-[11px]">{description}</span>
      </span>
    </button>
  )
}

function SharePlaceModal({ place, isOpen, onClose }: SharePlaceModalProps) {
  const [feedback, setFeedback] = useState('')
  const modalRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousBodyOverflow = document.body.style.overflow
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null

    document.body.style.overflow = 'hidden'
    modalRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab' || !modalRef.current) {
        return
      }

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (!firstElement || !lastElement) {
        event.preventDefault()
        return
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
        return
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocusedElement?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const platformLinks = getPlatformShareLinks(place)

  const showFeedback = (message: string) => {
    setFeedback(message)
    window.setTimeout(() => setFeedback(''), 2600)
  }

  const handleCopy = async (message = 'Na-copy na yung link!') => {
    try {
      await copyPlaceLink(place)
      showFeedback(message)
    } catch {
      showFeedback('Hindi na-copy yung link. Try ulit.')
    }
  }

  const handleOpenPlatform = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/38 px-0 py-0 backdrop-blur-[2px] sm:items-center sm:px-3 sm:py-4"
      onClick={(event) => {
        event.stopPropagation()
        onClose()
      }}
    >
      <section
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-place-title"
        tabIndex={-1}
        className="max-h-[86vh] w-full overflow-y-auto rounded-t-2xl border border-[rgba(126,165,232,0.34)] bg-[linear-gradient(180deg,#ffffff,#f5f9ff)] text-slate-900 shadow-[0_28px_70px_rgba(15,23,42,0.26)] sm:max-h-[92vh] sm:max-w-[600px] sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-white/90 px-4 py-2.5 backdrop-blur sm:py-3">
          <div className="min-w-0">
            <p id="share-place-title" className="text-base font-semibold text-slate-900">I-share na!</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">Send this gala pick na to someone</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_8px_18px_rgba(47,116,232,0.30)] transition hover:-translate-y-[1px] hover:bg-white hover:text-[var(--accent)] sm:h-9 sm:w-9"
            aria-label="Close share options"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-3.5 w-3.5 sm:h-4 sm:w-4">
              <path d="M7 7l10 10" />
              <path d="M17 7 7 17" />
            </svg>
          </button>
        </div>

        <div className="px-3 py-3 sm:px-4 sm:py-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <PlatformButton
              label="Copy Link"
              description="Save link to clipboard"
              brandClassName="bg-[var(--accent)] text-white"
              onClick={() => void handleCopy()}
            />

            <PlatformButton
              label="Messenger"
              description="Copy, then paste in chat"
              brandClassName="bg-[linear-gradient(180deg,#6aa6ff,#2563eb)] text-white"
              logoSrc={messengerLogo}
              onClick={() => void handleCopy('Na-copy na yung link. I-paste mo sa Messenger.')}
            />

            {shareOptions.map((option) => (
              <PlatformButton
                key={option.id}
                label={option.label}
                description={option.description}
                brandClassName={option.brandClassName}
                logoSrc={option.logoSrc}
                onClick={() => {
                  if (option.action === 'copy') {
                    void handleCopy('Na-copy na yung link. I-paste mo sa Instagram.')
                    return
                  }

                  handleOpenPlatform(platformLinks[option.id as OpenPlatformId])
                }}
              />
            ))}
          </div>

        </div>
      </section>

      {feedback ? (
        <p className="pointer-events-none fixed bottom-4 left-4 z-[2010] max-w-[calc(100vw-32px)] rounded-xl border border-[rgba(47,116,232,0.24)] bg-white px-3 py-2 text-xs font-semibold text-[var(--accent-deep)] shadow-[0_14px_34px_rgba(15,23,42,0.18)]">
          {feedback}
        </p>
      ) : null}
    </div>
  )
}

export default SharePlaceModal
