import { Suspense, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import SeoHead from '../components/SeoHead'
import MobileBottomNav from '../components/MobileBottomNav'
import { PageShellSkeleton } from '../components/loading/SkeletonStates'
import { AppIcon } from '../components/AppIcon'
import { AppUserProvider } from '../context/AppUserContext'
import { SavedFavoritesProvider } from '../context/SavedFavoritesContext'
import { SystemMessageProvider } from '../context/SystemMessageContext'
import { AskAiNotificationProvider } from '../context/AskAiNotificationContext'
import { BottomNavProvider, useBottomNav } from '../context/BottomNavContext'
import type { CurrentUserResponse } from '../utils/profileApi'
import type { AdminMfaStatus } from '../utils/adminMfa'
import { getAppShellState } from './appShellState'

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
                <SeoHead title="GalaTayo" canonicalPath={pathname} robots="noindex,follow" />
              ) : null}
              <Suspense fallback={<PageShellSkeleton />}>
                <div className={`flex ${appShellHeightClass} flex-col`}>{children}</div>
              </Suspense>
              {showLogoutTransition ? (
                <div className={`gala-logout-overlay ${isLogoutTransitionExiting ? 'exit' : 'enter'}`} aria-live="polite" aria-busy="true">
                  <div className="gala-logout-card">
                    <div className="gala-logout-status">
                      <span className="gala-logout-icon" aria-hidden="true">
                        <AppIcon name="logOut" className="h-5 w-5" />
                      </span>
                      <div className="gala-logout-copy">
                        <p className="gala-logout-title">Logging out</p>
                        <p className="gala-logout-message">Switching to Guest mode...</p>
                      </div>
                    </div>
                    <div className="gala-logout-progress" aria-hidden="true">
                      <span />
                    </div>
                    <div className="gala-logout-preview" aria-hidden="true">
                      <div className="gala-logout-preview-main">
                        <span className="gala-logout-preview-chip">
                          <AppIcon name="sparkles" className="h-3.5 w-3.5" />
                          Guest mode
                        </span>
                        <span className="gala-logout-preview-line gala-logout-preview-line-wide" />
                        <span className="gala-logout-preview-line" />
                      </div>
                      <div className="gala-logout-preview-side">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {showMobileBottomNav ? <BottomNavGate pathname={pathname} /> : null}
            </BottomNavProvider>
          </AskAiNotificationProvider>
        </SavedFavoritesProvider>
      </SystemMessageProvider>
    </AppUserProvider>
  )
}
