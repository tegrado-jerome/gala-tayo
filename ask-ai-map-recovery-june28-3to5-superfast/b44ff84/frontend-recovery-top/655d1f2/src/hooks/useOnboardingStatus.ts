import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getOnboardingStatus, type OnboardingStatusResponse } from '../utils/profileApi'

export function useOnboardingStatus(session: Session | null, refreshKey = 0) {
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    if (!session) {
      setStatus(null)
      setError('')
      setIsLoading(false)
      return undefined
    }

    setIsLoading(true)
    setError('')

    void getOnboardingStatus(session)
      .then((data) => {
        if (isMounted) {
          setStatus(data)
        }
      })
      .catch((caughtError) => {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : 'Failed to load onboarding status.')
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [refreshKey, session])

  return { status, isLoading, error }
}
