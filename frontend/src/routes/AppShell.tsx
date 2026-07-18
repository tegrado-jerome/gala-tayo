import { Suspense, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import SeoHead from '../components/SeoHead'
import MobileBottomNav from '../components/MobileBottomNav'
import { PageShellSkeleton } from '../components/loading/SkeletonStates'
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
                <div>{children}</div>
              </Suspense>
              {showLogoutTransition ? (
                <div className={`gala-logout-overlay ${isLogoutTransitionExiting ? 'exit' : 'enter'}`} aria-live="polite" aria-busy="true">
                  <div className="gala-logout-card">
                    <PageShellSkeleton className="max-h-[360px] overflow-hidden px-0 py-0" />
                    <p className="gala-logout-title">Logging out</p>
                    <p className="gala-logout-message">Switching to Guest mode...</p>
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
