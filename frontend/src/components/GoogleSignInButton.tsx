import { useEffect, useRef } from 'react'
import {
  loadGoogleIdentityServices,
  initializeGoogleClient,
  renderGoogleButton,
  handleGoogleCredential,
  getNextPathFromRedirectUrl,
} from '../utils/googleSignIn'

type GoogleSignInButtonProps = {
  compact?: boolean
  className?: string
  redirectTo?: string
}

const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()

function GoogleSignInButton({ compact = false, className = '', redirectTo }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRenderedRef = useRef(false)

  useEffect(() => {
    if (buttonRenderedRef.current || !GOOGLE_CLIENT_ID) return

    let isMounted = true

    const init = async () => {
      try {
        await loadGoogleIdentityServices()
        if (!isMounted || !containerRef.current) return

        initializeGoogleClient(GOOGLE_CLIENT_ID, async (response) => {
          if (!isMounted) return
          try {
            const nextPath = redirectTo ? getNextPathFromRedirectUrl(redirectTo) : null
            await handleGoogleCredential(response.credential, { nextPath })
          } catch {
            // Error is surfaced via parent or tooltip.
          }
        })

        buttonRenderedRef.current = true
        renderGoogleButton(containerRef.current, {
          type: compact ? 'icon' : 'standard',
          shape: compact ? 'circle' : 'rectangular',
          size: compact ? 'small' : 'medium',
          text: compact ? undefined : 'signin_with',
        })
      } catch {
        // GIS failed to load
      }
    }

    void init()

    return () => {
      isMounted = false
    }
  }, [compact, redirectTo])

  return (
    <div ref={containerRef} className={`relative ${className}`} />
  )
}

export default GoogleSignInButton
