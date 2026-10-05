import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { CalendarPlus } from '@phosphor-icons/react/dist/csr/CalendarPlus'
import { Camera } from '@phosphor-icons/react/dist/csr/Camera'
import { Check } from '@phosphor-icons/react/dist/csr/Check'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { ChatCircle as MessageCircle } from '@phosphor-icons/react/dist/csr/ChatCircle'
import { ShieldWarning as ShieldAlert } from '@phosphor-icons/react/dist/csr/ShieldWarning'
import { Sparkle as Sparkles } from '@phosphor-icons/react/dist/csr/Sparkle'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { User as UserRound } from '@phosphor-icons/react/dist/csr/User'
import { UsersThree as Users } from '@phosphor-icons/react/dist/csr/UsersThree'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { useAppUser } from '../context/AppUserContext'
import { buildAuthPath } from '../services/authApi'
import { ensureGuestSession, isAnonymousSession, isGuestModeAvailable } from '../utils/guestSession'
import { navigateToPath } from '../utils/navigation'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { Button, Page, Panel, Sheet, cx } from './ui'
import '../design/misc.css'

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
  | 'contribute-photo'
  | 'saved-page'
  | 'plans-page'
  | 'passport-page'
  | 'account-page'

export type GuestAuthDisplayMode = 'modal' | 'inline-card' | 'page-state'

/** Runs after "Continue as guest" (instead of onClose) so the action the visitor tapped can finish. */
export type GuestContinueHandler = (session: Session) => void

export type GuestAuthPromptProps = {
  variant: GuestAuthVariant
  mode?: GuestAuthDisplayMode
  isOpen?: boolean
  onClose?: () => void
  onContinue?: GuestContinueHandler
  className?: string
}

type VariantConfig = {
  icon: PhosphorIcon
  label: string
  title: string
  description: string
  benefits: string[]
  /** Set for actions a guest session can do; the prompt then leads with "Continue as guest". */
  guestTitle?: string
}

const ACCOUNT_PERKS = ['Sync on every device', 'Public profile and followers', 'More AI asks each day', 'Reviews, tips and photos']

const variantConfigs: Record<GuestAuthVariant, VariantConfig> = {
  'ask-ai': {
    icon: Sparkles,
    label: 'AI planning',
    title: 'You have reached your GalaTayo AI limit',
    description: 'Create an account to unlock 20 chatbot asks and 10 map searches per day, plus save your planning history.',
    benefits: ['20 AI chatbot asks daily', '10 AI map searches daily', 'Save your chats and plans'],
  },
  profile: {
    guestTitle: 'Make GalaTayo yours',
    icon: UserRound,
    label: 'Profile',
    title: 'Log in to manage your profile',
    description: 'Set up your public profile, follow friends, and make GalaTayo yours.',
    benefits: ['Edit your username and bio', 'Manage your profile privacy', 'Find and follow friends'],
  },
  favorite: {
    guestTitle: 'Save this place',
    icon: Heart,
    label: 'Saved',
    title: 'Log in to save this place',
    description: 'Add this spot to your saved places and find it again later.',
    benefits: ['Save favorite places', 'Track recently viewed spots', 'Add places to gala plans'],
  },
  'add-plan': {
    guestTitle: 'Add this to a gala plan',
    icon: CalendarPlus,
    label: 'Gala plan',
    title: 'Log in to add this to a gala plan',
    description: 'Organize places into gala plans and share them with your barkada.',
    benefits: ['Build custom gala plans', 'Save places for later', 'Plan trips with friends'],
  },
  'report-place': {
    icon: Flag,
    label: 'Place report',
    title: 'Log in to report this place',
    description: 'To keep reports trustworthy, only signed-in members can send place concerns.',
    benefits: ['Report wrong place details', 'Help keep GalaTayo accurate'],
  },
  'rate-place': {
    icon: Star,
    label: 'Community',
    title: 'Log in to rate this place',
    description: 'Leave ratings and help other gala-goers find better spots.',
    benefits: ['Rate places', 'Share your experience'],
  },
  comment: {
    icon: MessageCircle,
    label: 'Community',
    title: 'Join the conversation',
    description: 'Log in to leave a comment and share what you think about this place.',
    benefits: ['Leave comments', 'Help other gala-goers'],
  },
  'report-comment': {
    icon: Flag,
    label: 'Comment report',
    title: 'Log in to report this comment',
    description: 'Only signed-in members can report comments so we can review issues properly.',
    benefits: ['Report harmful comments', 'Help keep discussions safe'],
  },
  'report-user': {
    icon: ShieldAlert,
    label: 'User report',
    title: 'Log in to report this user',
    description: 'Only signed-in members can report users so GalaTayo can review concerns properly.',
    benefits: ['Report unsafe behavior', 'Help moderation review issues'],
  },
  community: {
    icon: Users,
    label: 'Community',
    title: 'Join the community',
    description: 'Log in to rate this place, leave a comment, and help other gala-goers.',
    benefits: ['Rate and review places', 'Join the conversation'],
  },
  'contribute-photo': {
    icon: Camera,
    label: 'Photo',
    title: 'Log in to add a photo',
    description: 'Share your photos of this place and help others see more of it.',
    benefits: ['Share your photos', 'Get credit for your photos'],
  },
  'saved-page': {
    guestTitle: 'Keep your saved places',
    icon: Heart,
    label: 'Saved',
    title: 'Log in to see your saved places',
    description: 'Everything you heart stays here, on every device.',
    benefits: ['Keep a list of spots to try', 'See places you viewed recently', 'Turn saved spots into a plan'],
  },
  'plans-page': {
    guestTitle: 'Plan with your barkada',
    icon: CalendarPlus,
    label: 'Plans',
    title: 'Log in to plan with your barkada',
    description: 'Build a gala, share one link, and let everyone RSVP and vote.',
    benefits: ['Plan with AI in one sentence', 'Share a Tara? link with friends', 'Split the bill with Hatian'],
  },
  'passport-page': {
    guestTitle: 'Collect city stamps',
    icon: Star,
    label: 'Passport',
    title: 'Log in to collect stamps',
    description: "Tap “I'm here” at real spots to earn a stamp for each city.",
    benefits: ['Earn a stamp per city', 'Keep a weekly gala streak'],
  },
  'account-page': {
    icon: UserRound,
    label: 'Account',
    title: 'Log in to manage your account',
    description: 'Update your profile, privacy and password.',
    benefits: ['Edit your profile', 'Control who sees your activity'],
  },
}

function GuestAuthPromptBody({
  variant,
  titleId,
  onClose,
  onLater,
  onContinue,
}: {
  variant: GuestAuthVariant
  titleId: string
  onClose?: () => void
  onLater: () => void
  onContinue?: GuestContinueHandler
}) {
  const { session } = useAppUser()
  const config = variantConfigs[variant]
  const Icon = config.icon
  const currentPath = `${window.location.pathname}${window.location.search}`
  const isGuest = isAnonymousSession(session)
  const canOfferGuest = Boolean(config.guestTitle) && !session
  const [isGuestAvailable, setIsGuestAvailable] = useState(false)
  const [isStartingGuest, setIsStartingGuest] = useState(false)
  const showGuest = canOfferGuest && isGuestAvailable
  const showAccountPerks = showGuest || isGuest

  useEffect(() => {
    if (!canOfferGuest) return undefined
    let isMounted = true
    void isGuestModeAvailable().then((available) => {
      if (isMounted) setIsGuestAvailable(available)
    })
    return () => {
      isMounted = false
    }
  }, [canOfferGuest])

  const continueAsGuest = async () => {
    setIsStartingGuest(true)
    const guestSession = await ensureGuestSession()
    setIsStartingGuest(false)
    if (!guestSession) {
      // Guest mode is off: quietly fall back to the log in / sign up choices.
      setIsGuestAvailable(false)
      return
    }
    if (onContinue) {
      onContinue(guestSession)
    } else {
      onClose?.()
    }
  }

  const title = showGuest ? config.guestTitle : isGuest ? config.title.replace(/^Log in to/, 'Create a free account to') : config.title
  const description = showGuest ? 'No sign-up needed. Your stuff stays on this device until you make an account.' : config.description
  const perks = showAccountPerks ? ACCOUNT_PERKS : config.benefits
  const loginPath = buildAuthPath('/login', currentPath)
  const signupPath = buildAuthPath('/signup', currentPath)

  return (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px]" style={{ background: 'var(--tara-soft)', color: 'var(--tara-ink)' }} aria-hidden="true">
          <Icon weight="duotone" className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 id={titleId} className="g-h3 text-[17px]">
            {title}
          </h2>
          <p className="g-sm g-mut mt-1 leading-5">{description}</p>
        </div>
        {onClose ? (
          <Button variant="text" size="sm" iconOnly className="-mr-2 -mt-2 !no-underline" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {showGuest ? (
        <Button variant="tara" size="lg" block className="mt-5" onClick={() => void continueAsGuest()} disabled={isStartingGuest} aria-busy={isStartingGuest}>
          {isStartingGuest ? 'Starting…' : 'Continue as guest'}
        </Button>
      ) : null}

      {perks.length > 0 ? (
        <>
          {showAccountPerks ? <p className="g-xs g-mut mt-5">A free account adds:</p> : null}
          <ul className={cx('m-perks', showAccountPerks && '!mt-2')} aria-label={showAccountPerks ? 'Account perks' : `${config.label} perks`}>
            {perks.map((benefit) => (
              <li key={benefit}>
                <Check weight="bold" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {showGuest ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="line" block onClick={() => navigateToPath(loginPath)}>
            Log in
          </Button>
          <Button variant="line" block onClick={() => navigateToPath(signupPath)}>
            Create account
          </Button>
        </div>
      ) : isGuest ? (
        <div className="mt-5 grid gap-2">
          <Button variant="tara" size="lg" block onClick={() => navigateToPath(signupPath)}>
            Create a free account
          </Button>
          <p className="g-xs g-mut text-center">Your saved places, plans and stamps move to your new account.</p>
          <Button variant="line" block onClick={() => navigateToPath(loginPath)}>
            I already have an account
          </Button>
        </div>
      ) : (
        <div className="mt-5 grid gap-2">
          <Button variant="tara" size="lg" block onClick={() => navigateToPath(loginPath)}>
            Log in
          </Button>
          <Button variant="line" block onClick={() => navigateToPath(signupPath)}>
            Create a free account
          </Button>
        </div>
      )}
      <div className="mt-1 flex justify-center">
        <Button variant="text" size="sm" onClick={onLater}>
          Maybe later
        </Button>
      </div>
    </>
  )
}

function GuestAuthPromptModal({ variant, isOpen, onClose, onContinue }: { variant: GuestAuthVariant; isOpen: boolean; onClose: () => void; onContinue?: GuestContinueHandler }) {
  const titleId = useId()

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
    <Sheet open onClose={onClose} labelledBy={titleId}>
      <div className="mx-auto w-full max-w-[420px] pb-1">
        <GuestAuthPromptBody variant={variant} titleId={titleId} onClose={onClose} onLater={onClose} onContinue={onContinue} />
      </div>
    </Sheet>,
    document.body,
  )
}

function GuestAuthPromptCard({ variant, className }: { variant: GuestAuthVariant; className?: string }) {
  const titleId = useId()
  return (
    <Panel as="section" aria-labelledby={titleId} className={cx('mx-auto w-full max-w-[480px] !rounded-[var(--r-4)] !p-5 shadow-[var(--sh-2)]', className)}>
      <GuestAuthPromptBody variant={variant} titleId={titleId} onLater={() => navigateToPath('/home')} />
    </Panel>
  )
}

export function useGuestAuthPrompt() {
  const [state, setState] = useState<{
    isOpen: boolean
    variant: GuestAuthVariant
  }>({ isOpen: false, variant: 'community' })
  const continueRef = useRef<GuestContinueHandler | undefined>(undefined)

  /** `onContinue` re-runs the tapped action once a guest session exists. */
  const open = useCallback((variant: GuestAuthVariant, onContinue?: GuestContinueHandler) => {
    continueRef.current = onContinue
    setState({ isOpen: true, variant })
  }, [])

  const close = useCallback(() => {
    setState((current) => ({ ...current, isOpen: false }))
  }, [])

  const handleContinue = useCallback((session: Session) => {
    const onContinue = continueRef.current
    continueRef.current = undefined
    setState((current) => ({ ...current, isOpen: false }))
    onContinue?.(session)
  }, [])

  const promptElement = (
    <GuestAuthPrompt
      variant={state.variant}
      mode="modal"
      isOpen={state.isOpen}
      onClose={close}
      onContinue={handleContinue}
    />
  )

  return { open, close, promptElement, isOpen: state.isOpen }
}

export function GuestAuthPrompt(props: GuestAuthPromptProps) {
  const { variant, mode = 'modal', isOpen, onClose, onContinue, className } = props

  if (mode === 'page-state') {
    return (
      <Page narrow>
        <GuestAuthPromptCard variant={variant} className="md:mt-6" />
      </Page>
    )
  }

  if (mode === 'inline-card') {
    return <GuestAuthPromptCard variant={variant} className={className} />
  }

  return <GuestAuthPromptModal variant={variant} isOpen={isOpen ?? false} onClose={onClose ?? (() => {})} onContinue={onContinue} />
}
