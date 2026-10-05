import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
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
import { buildAuthPath } from '../services/authApi'
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

export type GuestAuthPromptProps = {
  variant: GuestAuthVariant
  mode?: GuestAuthDisplayMode
  isOpen?: boolean
  onClose?: () => void
  className?: string
}

type VariantConfig = {
  icon: PhosphorIcon
  label: string
  title: string
  description: string
  benefits: string[]
}

const variantConfigs: Record<GuestAuthVariant, VariantConfig> = {
  'ask-ai': {
    icon: Sparkles,
    label: 'AI planning',
    title: 'You have reached your GalaTayo AI limit',
    description: 'Create an account to unlock 20 chatbot asks and 10 map searches per day, plus save your planning history.',
    benefits: ['20 AI chatbot asks daily', '10 AI map searches daily', 'Save your chats and plans'],
  },
  profile: {
    icon: UserRound,
    label: 'Profile',
    title: 'Log in to manage your profile',
    description: 'Set up your public profile, follow friends, and make GalaTayo yours.',
    benefits: ['Edit your username and bio', 'Manage your profile privacy', 'Find and follow friends'],
  },
  favorite: {
    icon: Heart,
    label: 'Saved',
    title: 'Log in to save this place',
    description: 'Add this spot to your saved places and find it again later.',
    benefits: ['Save favorite places', 'Track recently viewed spots', 'Add places to gala plans'],
  },
  'add-plan': {
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
    icon: Heart,
    label: 'Saved',
    title: 'Log in to see your saved places',
    description: 'Everything you heart stays here, on every device.',
    benefits: ['Keep a list of spots to try', 'See places you viewed recently', 'Turn saved spots into a plan'],
  },
  'plans-page': {
    icon: CalendarPlus,
    label: 'Plans',
    title: 'Log in to plan with your barkada',
    description: 'Build a gala, share one link, and let everyone RSVP and vote.',
    benefits: ['Plan with AI in one sentence', 'Share a Tara? link with friends', 'Split the bill with Hatian'],
  },
  'passport-page': {
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

function GuestAuthPromptBody({ variant, titleId, onClose, onLater }: { variant: GuestAuthVariant; titleId: string; onClose?: () => void; onLater: () => void }) {
  const config = variantConfigs[variant]
  const Icon = config.icon
  const currentPath = `${window.location.pathname}${window.location.search}`

  return (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px]" style={{ background: 'var(--tara-soft)', color: 'var(--tara-ink)' }} aria-hidden="true">
          <Icon weight="duotone" className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 id={titleId} className="g-h3 text-[17px]">
            {config.title}
          </h2>
          <p className="g-sm g-mut mt-1 leading-5">{config.description}</p>
        </div>
        {onClose ? (
          <Button variant="text" size="sm" iconOnly className="-mr-2 -mt-2 !no-underline" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {config.benefits.length > 0 ? (
        <ul className="m-perks" aria-label={`${config.label} perks`}>
          {config.benefits.map((benefit) => (
            <li key={benefit}>
              <Check weight="bold" aria-hidden="true" />
              {benefit}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 grid gap-2">
        <Button variant="tara" size="lg" block onClick={() => navigateToPath(buildAuthPath('/login', currentPath))}>
          Log in
        </Button>
        <Button variant="line" block onClick={() => navigateToPath(buildAuthPath('/signup', currentPath))}>
          Create a free account
        </Button>
      </div>
      <div className="mt-1 flex justify-center">
        <Button variant="text" size="sm" onClick={onLater}>
          Maybe later
        </Button>
      </div>
    </>
  )
}

function GuestAuthPromptModal({ variant, isOpen, onClose }: { variant: GuestAuthVariant; isOpen: boolean; onClose: () => void }) {
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
        <GuestAuthPromptBody variant={variant} titleId={titleId} onClose={onClose} onLater={onClose} />
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
    return (
      <Page narrow>
        <GuestAuthPromptCard variant={variant} className="md:mt-6" />
      </Page>
    )
  }

  if (mode === 'inline-card') {
    return <GuestAuthPromptCard variant={variant} className={className} />
  }

  return <GuestAuthPromptModal variant={variant} isOpen={isOpen ?? false} onClose={onClose ?? (() => {})} />
}
