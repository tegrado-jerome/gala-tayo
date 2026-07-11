import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getCurrentUser, isAdminRole } from '../utils/profileApi'
import { clearAdminAccessCache, readAdminAccessCache, writeAdminAccessCache } from '../utils/adminStateCache'

type AdminAccessState = {
  isAdmin: boolean
  isCheckingAccess: boolean
  errorMessage: string
  refreshAccess: () => void
}

export function useAdminAccess(session: Session | null): AdminAccessState {
  const [refreshCounter, setRefreshCounter] = useState(0)
  const [isAdmin, setIsAdmin] = useState(() => {
    if (!session) {
      return false
    }

    return readAdminAccessCache(session.user.id) ?? false
  })
  const [isCheckingAccess, setIsCheckingAccess] = useState(() => {
    if (!session) {
      return false
    }

    return readAdminAccessCache(session.user.id) === null
  })
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!session) {
      setIsAdmin(false)
      setIsCheckingAccess(false)
      setErrorMessage('')
      return undefined
    }

    let isMounted = true
    const cachedAccess = readAdminAccessCache(session.user.id)

    if (cachedAccess !== null) {
      setIsAdmin(cachedAccess)
      setIsCheckingAccess(false)
    } else {
      setIsAdmin(false)
      setIsCheckingAccess(true)
    }

    const verifyAccess = async () => {
      try {
        const currentUser = await getCurrentUser(session)

        if (!isMounted) {
          return
        }

        const nextIsAdmin = isAdminRole(currentUser.user.role)
        setIsAdmin(nextIsAdmin)
        writeAdminAccessCache(session.user.id, nextIsAdmin)
        setErrorMessage('')
      } catch (error) {
        if (!isMounted) {
          return
        }

        clearAdminAccessCache()
        setErrorMessage(error instanceof Error ? error.message : 'Failed to check admin access.')

        if (cachedAccess === null) {
          setIsAdmin(false)
        }
      } finally {
        if (isMounted) {
          setIsCheckingAccess(false)
        }
      }
    }

    void verifyAccess()

    return () => {
      isMounted = false
    }
  }, [refreshCounter, session])

  return {
    isAdmin,
    isCheckingAccess,
    errorMessage,
    refreshAccess: () => setRefreshCounter((current) => current + 1),
  }
}
