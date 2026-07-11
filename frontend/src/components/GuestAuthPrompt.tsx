import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon, type AppIconName } from './AppIcon'
import { CenteredModal } from './layout/Primitives'
import { buildAuthPath } from '../services/authApi'
import { navigateToPath } from '../utils/navigation'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'

export type GuestAuthVariant =
  | 'ask-ai'
  | 'profile'
  | 'favorite'
  | 'add-plan'
  | 'report-place'
  | 'rate-place'
  | 'comment'
  | 'report-comment'
  | 'report-user'
  | 'community'

export type GuestAuthDisplayMode = 'modal' | 'inline-card' | 'page-state'

export type GuestAuthPromptProps = {
  variant: GuestAuthVariant
  mode?: GuestAuthDisplayMode
  isOpen?: boolean
  onClose?: () => void
  className?: string
}

type VariantConfig = {
  icon: AppIconName
  label: string
  title: string
  description: string
  benefits: string[]
  benefitIcons: AppIconName[]
}

const variantConfigs: Record<GuestAuthVariant, VariantConfig> = {
  'ask-ai': {
    icon: 'askAi',
    label: 'AI PLANNING',
    title: 'Log in to use GalaTayo AI',
    description: 'Create an account or log in to access Ask AI, plan smarter gala trips, and continue where you left off.',
    benefits: [
      'Access Ask AI features',
      'Create and manage gala plans',
      'Save favorites and history',
      'Find friends and personalize picks',
    ],
    benefitIcons: ['askAi', 'galaPlan', 'favorites', 'users'],
  },
  profile: {
    icon: 'profile',
    label: 'PROFILE',
    title: 'Log in to manage your profile',
    description: 'Create an account or log in to set up your public profile, follow friends, and personalize GalaTayo.',
    benefits: [
      'Edit your username and bio',
      'Manage your profile privacy',
      'Find and follow friends',
      'Keep your gala activity connected',
    ],
    benefitIcons: ['profile', 'lock', 'users', 'history'],
  },
  favorite: {
    icon: 'favorites',
    label: 'FAVORITES',
    title: 'Sign in to save this place',
    description: 'Log in or create an account to add this spot to your favorites and find it again later.',
    benefits: [
      'Save favorite places',
      'Track recently viewed spots',
      'Add places to gala plans',
    ],
    benefitIcons: ['favorites', 'history', 'calendarPlan'],
  },
  'add-plan': {
    icon: 'calendarPlan',
    label: 'GALA PLAN',
    title: 'Log in to add this to a gala plan',
    description: 'Create an account or log in to organize places into your gala plans.',
    benefits: [
      'Build custom gala plans',
      'Save places for later',
      'Plan trips with friends',
    ],
    benefitIcons: ['galaPlan', 'favorites', 'users'],
  },
  'report-place': {
    icon: 'reports',
    label: 'PLACE REPORT',
    title: 'Log in to report this place',
    description: 'To keep reports trustworthy, only signed-in members can submit place concerns.',
    benefits: [
      'Report wrong place details',
      'Help keep GalaTayo accurate',
      'Support safer recommendations',
    ],
    benefitIcons: ['reports', 'check', 'users'],
  },
  'rate-place': {
    icon: 'reviews',
    label: 'COMMUNITY',
    title: 'Log in to rate this place',
    description: 'Sign in to leave ratings and help other gala-goers discover better spots.',
    benefits: [
      'Rate places',
      'Share your experience',
      'Help improve recommendations',
    ],
    benefitIcons: ['reviews', 'comments', 'users'],
  },
  comment: {
    icon: 'comments',
    label: 'COMMUNITY',
    title: 'Join the conversation',
    description: 'Log in or create an account to leave a comment and share your thoughts about this place.',
    benefits: [
      'Leave comments',
      'Join community discussions',
      'Help other gala-goers',
    ],
    benefitIcons: ['comments', 'users', 'favorites'],
  },
  'report-comment': {
    icon: 'reports',
    label: 'COMMENT REPORT',
    title: 'Log in to report this comment',
    description: 'Only signed-in members can report comments so we can review issues responsibly.',
    benefits: [
      'Report harmful comments',
      'Help keep discussions safe',
      'Support the community',
    ],
    benefitIcons: ['reports', 'warning', 'users'],
  },
  'report-user': {
    icon: 'warning',
    label: 'USER REPORT',
    title: 'Log in to report this user',
    description: 'Only signed-in members can report users so GalaTayo can review concerns properly.',
    benefits: [
      'Report unsafe behavior',
      'Protect the community',
      'Help moderation review issues',
    ],
    benefitIcons: ['warning', 'lock', 'check'],
  },
  community: {
    icon: 'users',
    label: 'COMMUNITY',
    title: 'Join the community',
    description: 'Log in to rate this place, leave a comment, and help other gala-goers.',
    benefits: [
      'Rate and review places',
      'Join the conversation',
      'Help improve recommendations',
    ],
    benefitIcons: ['reviews', 'comments', 'users'],
  },
}

function GuestAuthPromptCard({
  variant,
  mode,
  onClose,
  className = '',
}: {
  variant: GuestAuthVariant
  mode: GuestAuthDisplayMode
  onClose?: () => void
  className?: string
}) {
  const config = variantConfigs[variant]
  const currentPath = `${window.location.pathname}${window.location.search}`

  const card = (
    <section
      className={`gala-auth-prompt overflow-hidden rounded-[24px] border border-[var(--line)] bg-white shadow-[0_12px_38px_rgba(15,23,42,0.07)] ${mode === 'inline-card' ? 'mx-auto w-full max-w-[480px]' : ''} ${className}`}
    >
      <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-deep)]">
            <AppIcon name={config.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
              {config.label}
            </p>
            <h2 className="mt-1 text-[17px] font-black leading-tight text-[var(--text-main)] sm:text-[18px]">
              {config.title}
            </h2>
            <p className="mt-2 text-[13px] font-semibold leading-5 text-[var(--muted)]">
              {config.description}
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              <AppIcon name="clear" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {config.benefits.length > 0 ? (
        <div className="px-5 pb-4 pl-[4.5rem] sm:px-6 sm:pl-16 md:pl-20">
          <ul className="grid gap-1.5">
            {config.benefits.map((benefit, index) => (
              <li
                key={benefit}
                className="flex items-center gap-2 text-[12px] font-semibold text-[var(--muted)]"
              >
                <AppIcon
                  name={config.benefitIcons[index] ?? 'check'}
                  className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
                />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="px-5 pt-1 pb-2 sm:px-6">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => navigateToPath(buildAuthPath('/login', currentPath))}
            className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-[14px] font-semibold text-white transition hover:bg-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => navigateToPath(buildAuthPath('/signup', currentPath))}
            className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[var(--line)] bg-white px-4 text-[14px] font-semibold text-[var(--text-main)] transition hover:border-[var(--line-strong)] hover:bg-[var(--surface-alt)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
          >
            Create account
          </button>
        </div>
        <div className="mt-3 flex justify-center">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 text-[13px] font-semibold text-[var(--muted)] transition hover:text-[var(--text-main)]"
            >
              Maybe later
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigateToPath('/')}
              className="px-4 py-3 text-[13px] font-semibold text-[var(--muted)] transition hover:text-[var(--text-main)]"
            >
              Maybe later
            </button>
          )}
        </div>
      </div>
    </section>
  )

  return card
}

function GuestAuthPromptModal({
  variant,
  isOpen,
  onClose,
}: {
  variant: GuestAuthVariant
  isOpen: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    lockBodyScroll()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      unlockBodyScroll()
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <CenteredModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="sm"
      ariaLabel="Sign in required"
    >
      <div role="dialog" aria-modal="true" className="w-full">
        <GuestAuthPromptCard variant={variant} mode="modal" onClose={onClose} />
      </div>
    </CenteredModal>,
    document.body,
  )
}

function GuestAuthPromptPageState({
  variant,
  backPath,
  backLabel,
}: {
  variant: GuestAuthVariant
  backPath?: string
  backLabel?: string
}) {
  return (
    <main className="gala-page-background flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[440px] lg:max-w-[460px] xl:max-w-[480px] 2xl:max-w-[500px]">
        {backPath ? (
          <button
            type="button"
            onClick={() => navigateToPath(backPath)}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/88 px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
          >
            <AppIcon name="back" className="h-3.5 w-3.5" />
            {backLabel || 'Back'}
          </button>
        ) : null}
        <GuestAuthPromptCard variant={variant} mode="page-state" />
      </div>
    </main>
  )
}

export function useGuestAuthPrompt() {
  const [state, setState] = useState<{
    isOpen: boolean
    variant: GuestAuthVariant
  }>({ isOpen: false, variant: 'community' })

  const open = (variant: GuestAuthVariant) => {
    setState({ isOpen: true, variant })
  }

  const close = () => {
    setState({ isOpen: false, variant: state.variant })
  }

  const promptElement = (
    <GuestAuthPrompt
      variant={state.variant}
      mode="modal"
      isOpen={state.isOpen}
      onClose={close}
    />
  )

  return { open, close, promptElement, isOpen: state.isOpen }
}

export function GuestAuthPrompt(props: GuestAuthPromptProps) {
  const { variant, mode = 'modal', isOpen, onClose, className } = props

  if (mode === 'page-state') {
    return <GuestAuthPromptPageState variant={variant} />
  }

  if (mode === 'inline-card') {
    return <GuestAuthPromptCard variant={variant} mode="inline-card" className={className} />
  }

  return (
    <GuestAuthPromptModal
      variant={variant}
      isOpen={isOpen ?? false}
      onClose={onClose ?? (() => {})}
    />
  )
}
