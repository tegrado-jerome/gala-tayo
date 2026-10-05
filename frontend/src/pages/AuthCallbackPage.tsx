import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import { getCurrentEmailConflict, getPostAuthRedirect, markSignupOnboardingAccess } from '../services/authApi'
import { getOnboardingStatus } from '../utils/profileApi'
import { getUserMfaStatus } from '../utils/userMfa'
import { buildAuthPath } from '../services/authApi'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
import { trackLoginCompleted, trackSignUpCompleted } from '../utils/analytics'
import { AuthCard } from '../components/auth/AuthCard'
import { Button, Page } from '../components/ui'

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
      <AuthCard title="Sign-in problem" sub={errorMessage}>
        <div className="grid gap-2">
          <Button
            variant="ink"
            block
            onClick={() => {
              setErrorMessage('')
              setRetryCount((current) => current + 1)
            }}
          >
            Try again
          </Button>
          <Button
            variant="text"
            className="mx-auto"
            onClick={() => navigateToPath(buildAuthPath('/login', window.location.search ? new URLSearchParams(window.location.search).get('next') : null))}
          >
            Back to login
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <Page>
      <p className="g-sm g-mut mt-16 text-center" role="status" aria-live="polite">
        Signing you in...
      </p>
    </Page>
  )
}

export default AuthCallbackPage
