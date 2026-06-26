import { signInWithGoogle } from '../../services/authApi'

type AuthMethodChooserProps = {
  isLoading: boolean
  onLoadingChange: (isLoading: boolean) => void
  onError: (message: string) => void
}

function AuthMethodChooser({ isLoading, onLoadingChange, onError }: AuthMethodChooserProps) {
  const handleGoogleSignIn = async () => {
    try {
      onLoadingChange(true)
      onError('')
      await signInWithGoogle()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.')
      onLoadingChange(false)
    }
  }

  return (
    <div className="grid gap-4">
      <button
        type="button"
        onClick={() => void handleGoogleSignIn()}
        disabled={isLoading}
        className="h-14 w-full rounded-lg bg-black px-5 text-base font-black text-white transition hover:bg-black/85 focus:outline-none focus:ring-4 focus:ring-black/15 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading ? 'Opening Google...' : 'Continue with Google'}
      </button>
    </div>
  )
}

export default AuthMethodChooser
