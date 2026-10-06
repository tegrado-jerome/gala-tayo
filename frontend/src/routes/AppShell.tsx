import { Suspense, lazy, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import SeoHead from '../components/SeoHead'
import MobileBottomNav from '../components/navigation/MobileBottomNav'
import SiteHeader from '../components/navigation/SiteHeader'
import { shouldShowSiteHeader } from '../utils/routeGuards'
import { useFloatingChat } from '../utils/floatingChat'
import { PageShellSkeleton } from '../components/loading/SkeletonStates'
import { SignOut as LogOut } from '@phosphor-icons/react/dist/csr/SignOut'
import { AppUserProvider } from '../context/AppUserContext'
import { SavedFavoritesProvider } from '../context/SavedFavoritesContext'
import { SystemMessageProvider } from '../context/SystemMessageContext'
import { AskAiNotificationProvider } from '../context/AskAiNotificationContext'
import { BottomNavProvider, useBottomNav } from '../context/BottomNavContext'
import type { CurrentUserResponse } from '../utils/profileApi'
import type { AdminMfaStatus } from '../utils/adminMfa'
import { getAppShellState } from './appShellState'
import { getLabelForPath } from '../utils/routes'

const FloatingChat = lazy(() => import('../components/FloatingChat'))

/** The AI chat bundle loads the first time someone opens the chat, not on every page. */
function FloatingChatGate({ pathname }: { pathname: string }) {
  const { isOpen } = useFloatingChat()
  const [hasOpened, setHasOpened] = useState(isOpen)
  if (isOpen && !hasOpened) setHasOpened(true)
  if (!hasOpened) return null
  return (
    <Suspense fallback={null}>
      <FloatingChat pathname={pathname} />
    </Suspense>
  )
}

function BottomNavGate({ pathname }: { pathname: string }) {
  const { hidden } = useBottomNav()
  if (hidden) return null
  return <MobileBottomNav currentPath={pathname} />
}

export function AppShell({ session, currentUser, currentProfile, adminMfa, hasResolvedInitialAuth, pathname, search, showLogoutTransition, isLogoutTransitionExiting, children }: {
  session: Session | null
  currentUser: CurrentUserResponse['user'] | null
  currentProfile: CurrentUserResponse['profile'] | null
  adminMfa: {
    isLoading: boolean
    status: AdminMfaStatus | null
  }
  hasResolvedInitialAuth: boolean
  pathname: string
  search: string
  showLogoutTransition: boolean
  isLogoutTransitionExiting: boolean
  children: ReactNode
}) {
  const { showMobileBottomNav, shouldApplyGenericNoindex } = getAppShellState(pathname, search)
  const routeLabel = getLabelForPath(pathname)
  const routeTitle = routeLabel ? `${routeLabel} | GalaTayo` : 'GalaTayo'
  const appShellHeightClass = pathname.startsWith('/ask-ai')
    ? 'min-h-[var(--ask-ai-viewport-height,100svh)]'
    : 'min-h-[100dvh]'

  return (
    <AppUserProvider
      session={session}
      currentUser={currentUser}
      currentProfile={currentProfile}
      isSessionLoading={!hasResolvedInitialAuth}
      adminMfa={adminMfa}
    >
      <SystemMessageProvider>
        <SavedFavoritesProvider>
          <AskAiNotificationProvider>
            <BottomNavProvider>
              {shouldApplyGenericNoindex ? (
                <SeoHead title={routeTitle} canonicalPath={pathname} robots="noindex,follow" />
              ) : null}
              {shouldShowSiteHeader(pathname) ? <SiteHeader pathname={pathname} /> : null}
              <Suspense fallback={<PageShellSkeleton />}>
                <div className={`flex ${appShellHeightClass} flex-col`}>{children}</div>
              </Suspense>
              {showLogoutTransition ? (
                <div
                  className={`fixed inset-0 z-[8000] grid place-items-center bg-[color-mix(in_srgb,var(--paper)_86%,transparent)] px-4 backdrop-blur-sm transition-opacity duration-200 ${isLogoutTransitionExiting ? 'opacity-0' : 'animate-[g-fade_200ms_ease-out] opacity-100'}`}
                  aria-live="polite"
                  aria-busy="true"
                >
                  <div className="g-panel flex w-full max-w-[320px] items-center gap-3 shadow-[var(--sh-2)]">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--fill)] text-[var(--ink)]" aria-hidden="true">
                      <LogOut className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="g-h3">Logging out</p>
                      <p className="g-sm g-mut">Switching to guest mode…</p>
                    </div>
                  </div>
                </div>
              ) : null}
              {showMobileBottomNav ? <BottomNavGate pathname={pathname} /> : null}
              <FloatingChatGate pathname={pathname} />
            </BottomNavProvider>
          </AskAiNotificationProvider>
        </SavedFavoritesProvider>
      </SystemMessageProvider>
    </AppUserProvider>
  )
}
