import { useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWandMagicSparkles, faXmark } from '@fortawesome/free-solid-svg-icons'
import { AskAiModePanel } from './home/ask-ai/AskAiComponents'
import { GuestAuthPrompt } from './GuestAuthPrompt'
import { useBottomNav } from '../context/BottomNavContext'
import { useAskAiChat } from '../hooks/useAskAiChat'
import { closeFloatingChat, openFloatingChat, useFloatingChat } from '../utils/floatingChat'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { navigateToPath } from '../utils/navigation'
import { isAdminPath } from '../utils/adminRoutes'
import { isPath, parseCanonicalPlacePath } from '../utils/routes'
import { shouldShowMobileBottomNav } from '../utils/routeGuards'

const HIDDEN_PATHS = [
  '/',
  '/ask-ai/maps',
  '/ask-ai/map',
  '/plan-with-ai',
  '/login',
  '/signup',
  '/auth',
  '/auth/callback',
  '/onboarding',
  '/forgot-password',
  '/reset-password',
  '/auth/reset-password',
  '/mfa/verify',
]

const PHONE_QUERY = '(max-width: 639px)'

function FloatingChatPanel({ initialQuestion }: { initialQuestion: string }) {
  const { panelProps, isGuestPromptOpen, closeGuestPrompt } = useAskAiChat(initialQuestion)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFloatingChat()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    const isPhone = window.matchMedia(PHONE_QUERY).matches
    if (isPhone) {
      lockBodyScroll()
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (isPhone) {
        unlockBodyScroll()
      }
    }
  }, [])

  return (
    <>
      <GuestAuthPrompt
        variant="ask-ai"
        mode="modal"
        isOpen={isGuestPromptOpen}
        onClose={closeGuestPrompt}
        className="gala-auth-prompt--protected-feature gala-auth-prompt--protected-feature-accent"
      />
      <div
        role="dialog"
        aria-label="GalaTayo AI chat"
        className="fixed inset-0 z-[7000] h-[100dvh] overflow-hidden bg-[var(--bg)] sm:inset-auto sm:bottom-[calc(env(safe-area-inset-bottom,0px)+9rem)] sm:right-4 sm:h-[min(640px,calc(100dvh-12rem))] sm:w-[400px] sm:rounded-[24px] sm:border sm:border-[var(--line)] sm:shadow-[0_24px_60px_rgba(27,26,23,0.22)] lg:bottom-24 lg:right-6 lg:h-[min(640px,calc(100dvh-8rem))]"
      >
        <AskAiModePanel
          {...panelProps}
          onClose={closeFloatingChat}
          onShowOnMap={(question) => {
            closeFloatingChat()
            navigateToPath(`/ask-ai/maps?q=${encodeURIComponent(question)}`)
          }}
          className="h-full"
        />
      </div>
    </>
  )
}

function FloatingChat({ pathname }: { pathname: string }) {
  const { isOpen, initialQuestion } = useFloatingChat()
  const { hidden: isBottomNavHidden } = useBottomNav()
  const isHidden = isAdminPath(pathname) || HIDDEN_PATHS.some((path) => isPath(pathname, path))
  const hasBottomNav = !isBottomNavHidden && (isPath(pathname, '/home') || shouldShowMobileBottomNav(pathname))
  // Place pages add a sticky action bar above the nav on phones; lift the bubble over it.
  const hasPlaceActionBar = Boolean(parseCanonicalPlacePath(pathname))

  useEffect(() => {
    if (isHidden) {
      closeFloatingChat()
    }
  }, [isHidden])

  if (isHidden) {
    return null
  }

  return (
    <>
      {isOpen ? <FloatingChatPanel key={initialQuestion} initialQuestion={initialQuestion} /> : null}
      <button
        type="button"
        onClick={() => (isOpen ? closeFloatingChat() : openFloatingChat())}
        aria-label={isOpen ? 'Close GalaTayo AI chat' : 'Open GalaTayo AI chat'}
        aria-expanded={isOpen}
        title="GalaTayo AI"
        className={`fixed right-4 z-[6500] h-14 w-14 items-center justify-center gap-2.5 rounded-full bg-[var(--primary)] text-white shadow-[0_12px_28px_-8px_rgba(var(--accent-rgb),0.6)] transition hover:scale-[1.03] hover:bg-[var(--primary-dark)] active:scale-95 lg:bottom-8 lg:right-8 lg:h-[60px] lg:w-auto lg:px-6 lg:pl-5 ${
          isOpen ? 'hidden sm:flex' : 'flex'
        } ${
          hasPlaceActionBar
            ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+9.5rem)]'
            : hasBottomNav
            ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)]'
            : 'bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]'
        }`}
      >
        <FontAwesomeIcon icon={isOpen ? faXmark : faWandMagicSparkles} className="h-6 w-6" />
        <span className="hidden text-[16px] font-bold lg:inline">{isOpen ? 'Close' : 'Ask GalaTayo AI'}</span>
      </button>
    </>
  )
}

export default FloatingChat
