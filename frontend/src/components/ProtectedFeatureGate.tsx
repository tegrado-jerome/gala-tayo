import { CalendarDays, Heart, History, Lock, MessageSquareWarning, Sparkles, Upload, UserRound, type LucideIcon } from 'lucide-react'
import { GuestAuthPrompt, type GuestAuthVariant } from './GuestAuthPrompt'
import { Page, PlaceCardSkeleton } from './ui'
import AskAiOverviewPage from '../pages/AskAiOverviewPage'
import { ADMIN_BASE_PATH } from '../utils/adminRoutes'
import { navigateToPath } from '../utils/navigation'

type ProtectedFeatureGateProps = {
  pathname: string
  search?: string
}

type FeaturePreview = {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
}

const featurePreviews: Array<{
  matches: (pathname: string) => boolean
  preview: FeaturePreview
}> = [
  {
    matches: (pathname) => pathname === '/favorites' || pathname === '/favorites/',
    preview: {
      icon: Heart,
      eyebrow: 'Saved places',
      title: 'Your saved places stay with your account',
      description: 'Log in to keep every saved spot synced across devices and easy to revisit.',
    },
  },
  {
    matches: (pathname) => pathname === '/history' || pathname === '/history/',
    preview: {
      icon: History,
      eyebrow: 'Recent activity',
      title: 'Your history is tied to your account',
      description: 'Log in to reopen places you viewed and plans you started without starting over.',
    },
  },
  {
    matches: (pathname) => pathname.startsWith('/gala-plan') || pathname.startsWith('/gala-plans'),
    preview: {
      icon: CalendarDays,
      eyebrow: 'Gala plans',
      title: 'Build and save plans with an account',
      description: 'Create itineraries, invite your barkada, and keep every gala idea in one place.',
    },
  },
  {
    matches: (pathname) =>
      pathname === '/profile' ||
      pathname === '/profile/' ||
      pathname === '/me' ||
      pathname === '/me/' ||
      pathname === '/account-settings' ||
      pathname === '/account-settings/' ||
      pathname.startsWith('/account-settings') ||
      pathname.startsWith('/settings'),
    preview: {
      icon: UserRound,
      eyebrow: 'Your account',
      title: 'Manage your profile after logging in',
      description: 'Your public profile, settings, and security tools are here once you log in.',
    },
  },
  {
    matches: (pathname) =>
      pathname === '/submit-place' ||
      pathname === '/submit-place/' ||
      pathname === '/submissions' ||
      pathname === '/submissions/' ||
      pathname.startsWith(ADMIN_BASE_PATH),
    preview: {
      icon: Upload,
      eyebrow: 'Community places',
      title: 'Submit and track places with an account',
      description: 'Log in to suggest places, add details, and follow your submission status.',
    },
  },
  {
    matches: (pathname) => pathname === '/feedback' || pathname === '/feedback/' || pathname === '/reports' || pathname === '/reports/' || pathname === '/comment-notices' || pathname === '/comment-notices/',
    preview: {
      icon: MessageSquareWarning,
      eyebrow: 'Support and reports',
      title: 'You need an account for this',
      description: 'This area holds your own reports, moderation notices, and feedback history.',
    },
  },
  {
    matches: (pathname) =>
      pathname === '/ask-ai' ||
      pathname === '/ask-ai/' ||
      pathname === '/ask-ai/chatbot' ||
      pathname === '/ask-ai/chatbot/' ||
      pathname === '/ask-ai/maps' ||
      pathname === '/ask-ai/maps/' ||
      pathname === '/ask-ai/prompt-builder' ||
      pathname === '/ask-ai/prompt-builder/',
    preview: {
      icon: Sparkles,
      eyebrow: 'AI planning',
      title: 'Log in to use account-based AI tools',
      description: 'Your AI planning, preferences, and map results work best when tied to your account.',
    },
  },
]

const fallbackPreview: FeaturePreview = {
  icon: Lock,
  eyebrow: 'Members only',
  title: 'This feature needs an account first',
  description: 'Create an account or log in to continue. We will bring you back here after.',
}

function getAuthVariant(pathname: string): GuestAuthVariant {
  if (pathname.startsWith('/ask-ai')) return 'ask-ai'
  if (pathname.startsWith('/favorites') || pathname.startsWith('/history')) return 'saved-page'
  if (pathname.startsWith('/gala-plan') || pathname.startsWith('/plan-with-ai')) return 'plans-page'
  if (pathname.startsWith('/passport')) return 'passport-page'
  if (/^\/(profile|account-settings|settings|privacy-center|my-submissions|reports|feedback|submit-place)/.test(pathname)) return 'account-page'
  return 'community'
}

function getFeaturePreview(pathname: string): FeaturePreview {
  return featurePreviews.find((entry) => entry.matches(pathname))?.preview ?? fallbackPreview
}

function ProtectedFeatureGate({ pathname }: ProtectedFeatureGateProps) {
  const preview = getFeaturePreview(pathname)
  const authVariant = getAuthVariant(pathname)
  const Icon = preview.icon
  const leaveGate = () => navigateToPath('/home')

  return (
    <>
      {pathname.startsWith('/ask-ai') ? (
        <div className="pointer-events-none select-none opacity-40 blur-[3px]" aria-hidden="true" inert>
          <AskAiOverviewPage />
        </div>
      ) : (
        <Page>
          <header className="max-w-[560px]">
            <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: 'var(--fill)', color: 'var(--ink)' }} aria-hidden="true">
              <Icon className="g-ic" />
            </span>
            <p className="g-eyebrow mt-4">{preview.eyebrow}</p>
            <h1 className="g-h1 mt-2">{preview.title}</h1>
            <p className="g-mut mt-2">{preview.description}</p>
          </header>
          <div className="g-grid mt-8" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <PlaceCardSkeleton key={index} />
            ))}
          </div>
        </Page>
      )}
      <GuestAuthPrompt variant={authVariant} mode="modal" isOpen onClose={leaveGate} />
    </>
  )
}

export default ProtectedFeatureGate
