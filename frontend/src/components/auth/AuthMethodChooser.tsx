import { linkGoogleToGuest, markSignupOnboardingAccess, setRememberMePreference, signInWithGoogle } from '../../services/authApi'
import { useAppUser } from '../../context/AppUserContext'
import { getRequestedNextPath } from '../../services/authApi'
import { Button } from '../ui'
import GoogleMark from './GoogleMark'

type AuthMethodChooserProps = {
  isGoogleLoading: boolean
  onGoogleLoadingChange: (isLoading: boolean) => void
  onError: (message: string) => void
  nextPath?: string | null
  flow?: 'signup'
  rememberMe?: boolean
}

function AuthMethodChooser({ isGoogleLoading, onGoogleLoadingChange, onError, nextPath, flow, rememberMe }: AuthMethodChooserProps) {
  const { isGuest } = useAppUser()

  const handleGoogleSignIn = async () => {
    try {
      onGoogleLoadingChange(true)
      onError('')
      setRememberMePreference(rememberMe ?? true)
      if (flow === 'signup') {
        markSignupOnboardingAccess()
      }
      if (isGuest && flow === 'signup') {
        await linkGoogleToGuest(nextPath ?? getRequestedNextPath())
        return
      }
      await signInWithGoogle(nextPath ?? getRequestedNextPath(), flow)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.')
      onGoogleLoadingChange(false)
    }
  }

  return (
    <Button variant="line" block onClick={() => void handleGoogleSignIn()} disabled={isGoogleLoading}>
      <GoogleMark />
      {isGoogleLoading ? 'Opening Google...' : 'Continue with Google'}
    </Button>
  )
}

export default AuthMethodChooser
