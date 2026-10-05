import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarPlus, Camera, Check, Flag, Heart, MessageCircle, ShieldAlert, Sparkles, Star, UserRound, Users, X, type LucideIcon } from 'lucide-react'
import { buildAuthPath } from '../services/authApi'
import { navigateToPath } from '../utils/navigation'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { Button, Page, Panel, Sheet, cx } from './ui'

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

export type GuestAuthDisplayMode = 'modal' | 'inline-card' | 'page-state'

export type GuestAuthPromptProps = {
  variant: GuestAuthVariant
  mode?: GuestAuthDisplayMode
  isOpen?: boolean
  onClose?: () => void
  className?: string
}

type VariantConfig = {
  icon: LucideIcon
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
}

function GuestAuthPromptBody({ variant, titleId, onClose, onLater }: { variant: GuestAuthVariant; titleId: string; onClose?: () => void; onLater: () => void }) {
  const config = variantConfigs[variant]
  const Icon = config.icon
  const currentPath = `${window.location.pathname}${window.location.search}`

  return (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: 'var(--fill)', color: 'var(--ink)' }} aria-hidden="true">
          <Icon className="g-ic" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="g-eyebrow">{config.label}</p>
          <h2 id={titleId} className="g-h3 mt-1">
            {config.title}
          </h2>
        </div>
        {onClose ? (
          <Button variant="soft" size="sm" iconOnly onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <p className="g-sm g-mut mt-3 leading-5">{config.description}</p>

      {config.benefits.length > 0 ? (
        <ul className="mt-3 grid gap-1.5">
          {config.benefits.map((benefit) => (
            <li key={benefit} className="g-sm flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--ok)' }} aria-hidden="true" />
              {benefit}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="ink" block onClick={() => navigateToPath(buildAuthPath('/login', currentPath))}>
          Log in
        </Button>
        <Button variant="line" block onClick={() => navigateToPath(buildAuthPath('/signup', currentPath))}>
          Create account
        </Button>
      </div>
      <div className="mt-2 flex justify-center">
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
    <Panel as="section" aria-labelledby={titleId} className={cx('mx-auto w-full max-w-[480px]', className)}>
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
