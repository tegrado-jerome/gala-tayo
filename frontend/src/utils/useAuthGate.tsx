import { useCallback, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { GuestAuthPrompt, type GuestAuthVariant } from '../components/GuestAuthPrompt'

export function useAuthGate(session: Session | null) {
  const [pendingVariant, setPendingVariant] = useState<GuestAuthVariant | null>(null)

  const requireAuth = useCallback(
    (actionVariant: GuestAuthVariant, callback: () => void) => {
      if (session?.user) {
        callback()
        return
      }

      setPendingVariant(actionVariant)
    },
    [session],
  )

  const handleClose = useCallback(() => {
    setPendingVariant(null)
  }, [])

  const authGateElement =
    pendingVariant ? (
      <GuestAuthPrompt
        variant={pendingVariant}
        mode="modal"
        isOpen={true}
        onClose={handleClose}
      />
    ) : null

  return {
    requireAuth,
    authGateElement,
    isPrompting: pendingVariant !== null,
  }
}
