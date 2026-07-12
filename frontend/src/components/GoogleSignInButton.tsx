import { useState } from 'react'
import { supabase } from '../supabase'
import { getPublicSiteOrigin } from '../utils/site'

type GoogleSignInButtonProps = {
  compact?: boolean
  className?: string
  redirectTo?: string
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

function GoogleSignInButton({ compact = false, className = '', redirectTo }: GoogleSignInButtonProps) {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const targetRedirectTo = redirectTo ?? getPublicSiteOrigin()

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true)
      setErrorMessage('')

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: targetRedirectTo,
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
        aria-busy={isSigningIn}
        className={`group inline-flex items-center justify-center rounded-lg border border-[var(--line-strong)] bg-white font-semibold text-slate-800 transition duration-200 hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-70 ${
          compact ? 'mt-1 h-9 w-9 p-0' : 'h-10 w-[108px] gap-2 py-1 pl-1.5 pr-3 text-sm'
        }`}
      >
        <span className={`relative flex shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-[var(--line)] transition ${
          compact ? 'h-9 w-9 p-2' : 'h-8 w-8 p-1.5'
        }`}
        >
          {isSigningIn ? (
            <span className="absolute inset-[-3px] animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)] border-r-[var(--mint)]" aria-hidden="true" />
          ) : null}
          <GoogleIcon />
        </span>
        {!isSigningIn && !compact ? (
          <span className="whitespace-nowrap font-semibold text-slate-800">
            Sign-in
          </span>
        ) : null}
        <span className="sr-only">{isSigningIn ? 'Signing in' : 'Sign-in'}</span>
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
