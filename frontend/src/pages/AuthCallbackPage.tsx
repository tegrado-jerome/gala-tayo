import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { StateContainer } from '../components/layout/ResponsiveLayouts'
import { getCurrentEmailConflict, getPostAuthRedirect, getRequestedNextPath } from '../services/authApi'
import { buildAuthPath } from '../services/authApi'
import { navigateToPath } from '../utils/navigation'
import { trackLoginCompleted, trackSignUpCompleted } from '../utils/analytics'

async function waitForSession(): Promise<Session | null> {
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession()

  if (currentSession) {
    return currentSession
  }

  return new Promise<Session | null>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      subscription.unsubscribe()
      resolve(null)
    }, 2500)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        return
      }

      window.clearTimeout(timeoutId)
      subscription.unsubscribe()
      resolve(nextSession as Session)
    })
  })
}

function AuthCallbackPage() {
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const finishAuth = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code')

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError) {
            const existingSession = await waitForSession()

            if (!existingSession) {
              throw exchangeError
            }
          }
        }

        const session = await waitForSession()

        if (!session) {
          throw new Error('We could not finish signing you in.')
        }

        const emailConflict = await getCurrentEmailConflict(session)

        if (emailConflict.conflict) {
          await supabase.auth.signOut({ scope: 'local' })
          throw new Error('This email already has a GalaTayo account. Please log in using the original method for that account.')
        }

        const params = new URLSearchParams(window.location.search)
        const requestedNextPath = getRequestedNextPath(window.location.search)
        const authFlow = params.get('flow')

        if (authFlow === 'signup' || requestedNextPath === '/onboarding') {
          trackSignUpCompleted({
            source: 'signup',
          })
          if (isMounted) {
            navigateToPath('/onboarding')
          }
          return
        }

        const redirectTo = await getPostAuthRedirect(session, window.location.search)
        trackLoginCompleted({
          source: 'login',
        })

        if (isMounted) {
          navigateToPath(redirectTo)
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'We could not finish signing you in.')
        }
      }
    }

    void finishAuth()

    return () => {
      isMounted = false
    }
  }, [])

  if (errorMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--panel)] px-6 text-black">
        <StateContainer>
          <section className="w-full max-w-[420px] text-center">
            <h1 className="text-3xl font-black">Sign-in problem</h1>
            <p className="mt-4 text-sm font-semibold leading-6 text-black/65">{errorMessage}</p>
            <button
              type="button"
              onClick={() => navigateToPath(buildAuthPath('/login', window.location.search ? new URLSearchParams(window.location.search).get('next') : null))}
              className="mt-8 h-12 rounded-lg bg-black px-5 text-sm font-black text-white transition hover:bg-black/85"
            >
              Back to login
            </button>
          </section>
        </StateContainer>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--panel)] px-6 text-black">
      <StateContainer>
        <section className="w-full text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-black/15 border-t-black" />
          <h1 className="mt-6 text-3xl font-black">Finishing sign in</h1>
          <p className="mt-3 text-sm font-semibold text-black/60">Checking your GalaTayo account...</p>
        </section>
      </StateContainer>
    </main>
  )
}

export default AuthCallbackPage
