import { useEffect } from 'react'
import { AskAiModePanel } from './home/ask-ai/AskAiComponents'
import { GuestAuthPrompt } from './GuestAuthPrompt'
import { useAskAiChat } from '../hooks/useAskAiChat'
import { closeFloatingChat, useFloatingChat } from '../utils/floatingChat'
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock'
import { navigateToPath } from '../utils/navigation'
import { isAdminPath } from '../utils/adminRoutes'
import { isPath } from '../utils/routes'

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
      />
      <div
        role="dialog"
        aria-label="GalaTayo AI chat"
        className="fixed inset-0 z-[7000] h-[100dvh] overflow-hidden bg-[var(--paper)] sm:inset-auto sm:right-4 sm:top-[72px] sm:h-[min(680px,calc(100dvh-6rem))] sm:w-[400px] sm:rounded-[var(--r-4)] sm:border sm:border-[var(--line)] sm:shadow-[var(--sh-3)] lg:right-8 lg:top-[80px]"
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
  const isHidden = isAdminPath(pathname) || HIDDEN_PATHS.some((path) => isPath(pathname, path))

  useEffect(() => {
    if (isHidden) {
      closeFloatingChat()
    }
  }, [isHidden])

  if (isHidden) {
    return null
  }

  return isOpen ? <FloatingChatPanel key={initialQuestion} initialQuestion={initialQuestion} /> : null
}

export default FloatingChat
