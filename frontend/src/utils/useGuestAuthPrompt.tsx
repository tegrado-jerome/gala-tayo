import { useState } from 'react'
import { GuestAuthPrompt, type GuestAuthVariant } from '../components/GuestAuthPrompt'

export function useGuestAuthPrompt() {
  const [state, setState] = useState<{
    isOpen: boolean
    variant: GuestAuthVariant
  }>({ isOpen: false, variant: 'community' })

  const open = (variant: GuestAuthVariant) => {
    setState({ isOpen: true, variant })
  }

  const close = () => {
    setState({ isOpen: false, variant: state.variant })
  }

  const promptElement = (
    <GuestAuthPrompt
      variant={state.variant}
      mode="modal"
      isOpen={state.isOpen}
      onClose={close}
    />
  )

  return { open, close, promptElement, isOpen: state.isOpen }
}
