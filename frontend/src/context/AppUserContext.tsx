import { createContext, useContext, type PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { CurrentUserResponse } from '../utils/profileApi'
import type { AdminMfaStatus } from '../utils/adminMfa'

type AppUserContextValue = {
  session: Session | null
  currentUser: CurrentUserResponse['user'] | null
  currentProfile: CurrentUserResponse['profile'] | null
  isSessionLoading: boolean
  adminMfa: {
    isLoading: boolean
    status: AdminMfaStatus | null
  }
}

const AppUserContext = createContext<AppUserContextValue | null>(null)

type AppUserProviderProps = PropsWithChildren<AppUserContextValue>

function AppUserProvider({
  children,
  session,
  currentUser,
  currentProfile,
  isSessionLoading,
  adminMfa,
}: AppUserProviderProps) {
  return (
    <AppUserContext.Provider
      value={{
        session,
        currentUser,
        currentProfile,
        isSessionLoading,
        adminMfa,
      }}
    >
      {children}
    </AppUserContext.Provider>
  )
}

function useAppUser() {
  const context = useContext(AppUserContext)

  if (!context) {
    throw new Error('useAppUser must be used inside AppUserProvider.')
  }

  return context
}

export { AppUserProvider, useAppUser }
export type { AppUserContextValue }
