import { useState } from 'react'
import { supabase } from '../supabase'
import { getAuthCallbackUrl } from '../services/authApi'
import GoogleMark from './auth/GoogleMark'
import { Button, cx } from './ui'

type GoogleSignInButtonProps = {
  compact?: boolean
  className?: string
  redirectTo?: string
}

function GoogleSignInButton({ compact = false, className = '', redirectTo }: GoogleSignInButtonProps) {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const targetRedirectTo = redirectTo ?? getAuthCallbackUrl()

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
    <div className={cx('relative', className)}>
      <Button
        variant="line"
        size="sm"
        iconOnly={compact}
        onClick={() => void handleSignIn()}
        disabled={isSigningIn}
        aria-busy={isSigningIn}
        aria-label={compact ? (isSigningIn ? 'Signing in with Google' : 'Sign in with Google') : undefined}
      >
        <GoogleMark />
        {compact ? null : isSigningIn ? 'Signing in...' : 'Sign in'}
      </Button>

      {errorMessage ? (
        <p role="alert" className="g-hint is-error absolute right-0 top-[calc(100%+6px)] z-20 w-[220px] px-3 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-2)', boxShadow: 'var(--sh-2)' }}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}

export default GoogleSignInButton
