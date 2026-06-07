import { useState } from 'react'
import { supabase } from '../supabase'
import { navigateToPath } from '../utils/navigation'

function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true)
      setErrorMessage('')

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed. Please try again.')
      setIsSigningIn(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 text-black">
      <section className="w-full max-w-[420px] text-center">
        <button
          type="button"
          onClick={() => navigateToPath('/')}
          className="mb-10 text-sm font-semibold underline underline-offset-4"
        >
          Back
        </button>
        <h1 className="text-4xl font-black leading-tight">Log in to GalaTayo</h1>
        <p className="mt-4 text-base leading-relaxed text-black/65">
          Continue to save favorites and keep your gala history.
        </p>
        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={isSigningIn}
          className="mt-8 h-14 w-full rounded-2xl border-2 border-black bg-white px-5 text-base font-bold text-black transition hover:bg-black hover:text-white focus:outline-none focus:ring-4 focus:ring-black/15 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSigningIn ? 'Opening Google...' : 'Continue with Google'}
        </button>
        {errorMessage ? <p className="mt-4 text-sm font-medium text-black">{errorMessage}</p> : null}
      </section>
    </main>
  )
}

export default LoginPage
