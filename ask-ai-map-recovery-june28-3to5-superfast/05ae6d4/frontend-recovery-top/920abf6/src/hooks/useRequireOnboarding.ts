import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { navigateToPath } from '../utils/navigation'
import { useOnboardingStatus } from './useOnboardingStatus'

export function useRequireOnboarding(session: Session | null, enabled = true) {
  const result = useOnboardingStatus(enabled ? session : null)

  useEffect(() => {
    if (!enabled || !session || result.isLoading || result.error || !result.status) {
      return
    }

    if (result.status.needsOnboarding && window.location.pathname !== '/onboarding') {
      navigateToPath('/onboarding')
    }
  }, [enabled, result.error, result.isLoading, result.status, session])

  return result
}
