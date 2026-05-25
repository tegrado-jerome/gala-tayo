import { useState } from 'react'
import { supabase } from '../supabase'

type GoogleSignInButtonProps = {
  compact?: boolean
  className?: string
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
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

function GoogleSignInButton({ compact = false, className = '' }: GoogleSignInButtonProps) {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true)
      setErrorMessage('')

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed. Try again.'
      setErrorMessage(message)
      setIsSigningIn(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => void handleSignIn()}
        disabled={isSigningIn}
        className={`group inline-flex items-center justify-center rounded-md border border-[#dadce0] bg-white font-medium tracking-[0.01em] text-[#3c4043] shadow-[0_1px_2px_rgba(60,64,67,0.16)] transition duration-150 hover:border-[#c6cacf] hover:bg-[#f8fafd] hover:shadow-[0_2px_6px_rgba(60,64,67,0.18)] focus:outline-none focus:ring-2 focus:ring-[#1a73e8]/25 active:bg-[#f1f3f4] active:shadow-[0_1px_1px_rgba(60,64,67,0.12)] disabled:cursor-not-allowed disabled:opacity-70 ${
          compact ? 'h-8 gap-1 px-2 text-[10px]' : 'h-10 gap-2.5 px-3.5 text-sm'
        }`}
      >
        <span className={`flex shrink-0 items-center justify-center rounded-sm bg-white ${compact ? 'h-4 w-4' : 'h-6 w-6'}`}>
          <GoogleIcon />
        </span>
        <span className="whitespace-nowrap">
          {isSigningIn ? 'Signing-in...' : 'Sign-in'}
        </span>
        {isSigningIn ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#dadce0] border-t-[#4285f4]" />
        ) : null}
      </button>

      {errorMessage ? (
        <p className="absolute right-0 top-[calc(100%+6px)] z-20 w-[220px] rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-600 shadow-[0_12px_26px_rgba(15,23,42,0.12)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}

export default GoogleSignInButton
