import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { getCurrentEmailConflict, getPostAuthRedirect, markSignupOnboardingAccess } from '../services/authApi'
import { getOnboardingStatus } from '../utils/profileApi'
import { getUserMfaStatus } from '../utils/userMfa'
import { buildAuthPath } from '../services/authApi'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
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
    }, 10000)

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
  const [retryCount, setRetryCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const finishAuth = async () => {
      try {
        const flow = new URLSearchParams(window.location.search).get('flow')
        const isSignupFlow = flow === 'signup'
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

        if (isSignupFlow) {
          markSignupOnboardingAccess()

          if (isMounted) {
            replaceWithPath('/onboarding')
          }

          void getOnboardingStatus(session)
            .then(({ completed }) => {
              if (!completed) {
                trackSignUpCompleted({
                  source: 'signup',
                })
              }
            })
            .catch(() => undefined)

          return
        }

        const emailConflict = await getCurrentEmailConflict(session)

        if (emailConflict.conflict) {
          await supabase.auth.signOut({ scope: 'global' })
          throw new Error('This email already has a GalaTayo account. Please log in using the original method for that account.')
        }

        const { needsOnboarding, completed } = await getOnboardingStatus(session)

        if (needsOnboarding) {
          if (!completed) {
            trackSignUpCompleted({
              source: 'signup',
            })
          }

          if (isMounted) {
            replaceWithPath('/onboarding')
          }
          return
        }

        const redirectTo = await getPostAuthRedirect(session, window.location.search)
        trackLoginCompleted({
          source: 'login',
        })

        if (isMounted) {
          const mfaStatus = await getUserMfaStatus(session)
          if (mfaStatus.needsMfa) {
            replaceWithPath(`/mfa/verify?next=${encodeURIComponent(redirectTo)}`)
          } else {
            replaceWithPath(redirectTo)
          }
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
  }, [retryCount])

  if (errorMessage) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-[var(--panel)] px-6 text-black">
        <section className="flex w-full max-w-[420px] flex-col items-center text-center">
          <h1 className="text-3xl font-black">Sign-in problem</h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-black/65">{errorMessage}</p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setErrorMessage('')
                setRetryCount((current) => current + 1)
              }}
              className="h-12 w-[220px] rounded-lg bg-black px-5 text-sm font-black text-white transition hover:bg-black/85"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => navigateToPath(buildAuthPath('/login', window.location.search ? new URLSearchParams(window.location.search).get('next') : null))}
              className="text-sm font-semibold text-black/50 underline underline-offset-2 transition hover:text-black/80"
            >
              Back to login
            </button>
          </div>
        </section>
      </main>
    )
  }

  return null
}

export default AuthCallbackPage
