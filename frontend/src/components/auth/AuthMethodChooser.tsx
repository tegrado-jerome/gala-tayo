import { useEffect, useRef } from 'react'
import {
  loadGoogleIdentityServices,
  initializeGoogleClient,
  renderGoogleButton,
  handleGoogleCredential,
} from '../../utils/googleSignIn'
import { getRequestedNextPath } from '../../services/authApi'

type AuthMethodChooserProps = {
  isGoogleLoading: boolean
  onGoogleLoadingChange: (isLoading: boolean) => void
  onError: (message: string) => void
  nextPath?: string | null
  flow?: 'signup'
}

const GOOGLE_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()

function AuthMethodChooser({ isGoogleLoading: _isGoogleLoading, onGoogleLoadingChange, onError, nextPath, flow }: AuthMethodChooserProps) {
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
          onGoogleLoadingChange(true)
          try {
            await handleGoogleCredential(response.credential, {
              nextPath: nextPath ?? getRequestedNextPath(),
              flow,
            })
          } catch (error) {
            onError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.')
          } finally {
            if (isMounted) onGoogleLoadingChange(false)
          }
        })

        buttonRenderedRef.current = true
        renderGoogleButton(containerRef.current, {
          text: 'continue_with',
          width: containerRef.current.clientWidth || 360,
        })
      } catch (error) {
        if (isMounted) {
          onError(error instanceof Error ? error.message : 'Could not load Google sign-in.')
        }
      }
    }

    void init()

    return () => {
      isMounted = false
    }
  }, [flow, nextPath, onError, onGoogleLoadingChange])

  return (
    <div className="grid gap-4">
      <div
        ref={containerRef}
        className="mx-auto flex w-full max-w-[360px] items-center justify-center lg:w-[240px]"
      />
    </div>
  )
}

export default AuthMethodChooser
