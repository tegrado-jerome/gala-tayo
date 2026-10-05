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
        className="gala-auth-prompt--protected-feature gala-auth-prompt--protected-feature-accent"
      />
      <div
        role="dialog"
        aria-label="GalaTayo AI chat"
        className="fixed inset-0 z-[7000] h-[100dvh] overflow-hidden bg-[var(--bg)] sm:inset-auto sm:top-[84px] sm:bottom-auto sm:right-4 sm:h-[min(640px,calc(100dvh-12rem))] sm:w-[400px] sm:rounded-[24px] sm:border sm:border-[var(--line)] sm:shadow-[0_24px_60px_rgba(27,26,23,0.22)] lg:right-6 lg:h-[min(640px,calc(100dvh-7rem))]"
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
