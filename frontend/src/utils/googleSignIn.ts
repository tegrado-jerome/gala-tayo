import { supabase } from '../supabase'
import {
  getCurrentEmailConflict,
  getPostAuthRedirect,
  getRequestedNextPath,
  markSignupOnboardingAccess,
} from '../services/authApi'
import { navigateToPath } from './navigation'
import { trackLoginCompleted, trackSignUpCompleted } from './analytics'

let gsiInitialized = false
let gsiLoadPromise: Promise<void> | null = null

export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).google?.accounts) {
    return Promise.resolve()
  }

  if (gsiLoadPromise) {
    return gsiLoadPromise
  }

  gsiLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      gsiLoadPromise = null
      reject(new Error('Failed to load Google sign-in.'))
    }
    document.head.appendChild(script)
  })

  return gsiLoadPromise
}

export function initializeGoogleClient(
  clientId: string,
  callback: (response: GoogleCredentialResponse) => void,
): void {
  if (gsiInitialized) return

  window.google!.accounts.id.initialize({
    client_id: clientId,
    callback,
    cancel_on_tap_outside: false,
  })

  gsiInitialized = true
}

export function renderGoogleButton(element: HTMLElement, config?: GoogleRenderButtonConfig): void {
  window.google!.accounts.id.renderButton(element, {
    type: 'standard',
    shape: 'rectangular',
    size: 'large',
    text: 'continue_with',
    logo_alignment: 'left',
    ...config,
  })
}

export async function handleGoogleCredential(
  credential: string,
  options?: { nextPath?: string | null; flow?: 'signup' },
): Promise<void> {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: credential,
  })

  if (error || !data.session) {
    throw error || new Error('Could not sign in with Google.')
  }

  const emailConflict = await getCurrentEmailConflict(data.session)

  if (emailConflict.conflict) {
    await supabase.auth.signOut({ scope: 'local' })
    throw new Error(
      'This email already has a GalaTayo account. Please log in using the original method for that account.',
    )
  }

  const requestedNextPath = options?.nextPath ?? getRequestedNextPath()
  const authFlow = options?.flow

  if (authFlow === 'signup' || requestedNextPath === '/onboarding') {
    trackSignUpCompleted({ source: 'signup' })
    markSignupOnboardingAccess(data.session.user.id)
    navigateToPath('/onboarding')
    return
  }

  const redirectTo = await getPostAuthRedirect(data.session)
  trackLoginCompleted({ source: 'login' })
  navigateToPath(redirectTo)
}

export function getNextPathFromRedirectUrl(redirectTo?: string): string | null {
  if (!redirectTo) return null

  try {
    const url = new URL(redirectTo, window.location.origin)

    if (url.pathname && url.pathname !== '/') {
      return url.pathname
    }
  } catch {
    // not a valid URL
  }

  return null
}
