import { signInWithGoogle } from '../../services/authApi'
import { getRequestedNextPath } from '../../utils/authRedirect'

type AuthMethodChooserProps = {
  isLoading: boolean
  onLoadingChange: (isLoading: boolean) => void
  onError: (message: string) => void
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.6 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.8 0-5.2-1.9-6.1-4.5H2.2v2.8A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.7-2.8Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A10.8 10.8 0 0 0 12 1 11 11 0 0 0 2.2 7.1l3.7 2.8C6.8 7.3 9.2 5.4 12 5.4Z"
      />
    </svg>
  )
}

function AuthMethodChooser({ isLoading, onLoadingChange, onError }: AuthMethodChooserProps) {
  const handleGoogleSignIn = async () => {
    try {
      onLoadingChange(true)
      onError('')
      await signInWithGoogle(getRequestedNextPath())
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
        className="inline-flex h-[2.75rem] w-full items-center justify-center gap-3 rounded-[0.875rem] border border-[var(--line)] bg-white/80 px-5 text-[14px] font-semibold text-[var(--text)] shadow-[0_10px_30px_rgba(15,23,42,0.05)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <GoogleMark />
        {isLoading ? 'Opening Google...' : 'Continue with Google'}
      </button>
    </div>
  )
}

export default AuthMethodChooser
