import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { EnvelopeSimple as Mail } from '@phosphor-icons/react/dist/csr/EnvelopeSimple'
import AuthMethodChooser from '../components/auth/AuthMethodChooser'
import PasswordStrengthBar from '../components/auth/PasswordStrengthBar'
import {
  getPostAuthRedirect,
  isEmailTakenError,
  markAdminPasswordSession,
  markSignupOnboardingAccess,
  resendGuestUpgradeEmail,
  resendSignUpConfirmationEmail,
  setRememberMePreference,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  upgradeGuestWithEmailPassword,
} from '../services/authApi'
import { buildAuthPath, getRequestedNextPath } from '../services/authApi'
import { navigateToPath, replaceWithPath } from '../utils/navigation'
import { getCurrentUser, isAdminRole } from '../utils/profileApi'
import { AuthCard, AuthNotice, InlineLink, OrDivider } from '../components/auth/AuthCard'
import PasswordField from '../components/auth/PasswordField'
import { Button } from '../components/ui'
import { getPasswordStrength } from '../utils/passwordStrength'
import { formatCooldownDuration, useResendCooldown } from '../hooks/useResendCooldown'
import { useAppUser } from '../context/AppUserContext'
import { getUserMfaStatus } from '../utils/userMfa'

type AuthMode = 'sign_in' | 'create_account'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const minPasswordLength = 8
const resendCooldownMs = 2 * 60 * 1000
const GUEST_EMAIL_TAKEN_MESSAGE = 'This email already has an account. Log in instead. What you did as a guest stays in this guest session and won’t move over.'

async function preloadAuthTargetPath(path: string) {
  if (path.startsWith('/mfa/verify')) {
    await import('./MfaVerifyPage')
    return
  }

  if (path === '/home' || path.startsWith('/home?')) {
    await import('./HomePage')
    return
  }

  if (path === '/onboarding' || path.startsWith('/onboarding?')) {
    await import('./OnboardingPage')
  }
}

function getFriendlyAuthError(error: unknown, mode: AuthMode) {
  const message = error instanceof Error ? error.message : ''
  const lowerMessage = message.toLowerCase()

  if (
    message === 'Email is required.' ||
    message === 'Enter a valid email address.' ||
    message === 'Password is required.' ||
    message === 'Passwords do not match.' ||
    message === 'Use a stronger password with uppercase, lowercase, digit, and special character.'
  ) {
    return message
  }

  if (lowerMessage.includes('email not confirmed') || lowerMessage.includes('email_not_confirmed')) {
    return 'Please confirm your email before signing in.'
  }

  if (lowerMessage.includes('invalid login credentials')) {
    return 'The email or password is incorrect.'
  }

  if (
    lowerMessage.includes('already registered') ||
    lowerMessage.includes('already exists') ||
    lowerMessage.includes('already has an account') ||
    lowerMessage.includes('user already')
  ) {
    return 'An account with this email already exists. Please log in instead. If you used Google first, log in with Google and set a password in Account/Security.'
  }

  if (lowerMessage.includes('weak password') || lowerMessage.includes('password')) {
    return mode === 'create_account'
      ? 'Use a stronger password with uppercase, lowercase, digit, and special character.'
      : 'The email or password is incorrect.'
  }

  if (lowerMessage.includes('invalid email')) {
    return 'Enter a valid email address.'
  }

  return message || (mode === 'create_account' ? 'Could not create your account. Please try again.' : 'Could not sign you in. Please try again.')
}

type AuthPageProps = {
  mode?: AuthMode
  surface?: 'app' | 'admin'
}

function AuthPage({ mode = 'sign_in', surface = 'app' }: AuthPageProps) {
  const { session, isGuest } = useAppUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isConfirmationPending, setIsConfirmationPending] = useState(false)
  const [error, setError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [step, setStep] = useState<'email' | 'password'>('email')

  const isCreateMode = mode === 'create_account'
  const isAdminSurface = surface === 'admin'
  const nextPath = useMemo(() => getRequestedNextPath(), [])
  const resetSuccess = new URLSearchParams(window.location.search).get('reset') === 'success'
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const signUpCooldown = useResendCooldown(isCreateMode && normalizedEmail ? `signup:${normalizedEmail}` : null, resendCooldownMs)
  const isEmailValid = emailPattern.test(normalizedEmail)
  const emailFormatIsValid = !normalizedEmail || isEmailValid
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password])
  const emailIsInvalid = isCreateMode && !emailFormatIsValid
  const passwordIsInvalid = isCreateMode && password.length > 0 && !passwordStrength.meetsComplexity
  const confirmPasswordHasMismatch = isCreateMode && confirmPassword.length > 0 && password !== confirmPassword
  const fieldErrors = {
    email: !normalizedEmail ? 'Enter your email.' : !isEmailValid ? 'Enter a valid email address.' : undefined,
    password: !password
      ? isCreateMode ? 'Create a password.' : 'Enter your password.'
      : isCreateMode && !passwordStrength.meetsComplexity
        ? 'Use uppercase, lowercase, a number, and a symbol.'
        : undefined,
    confirm: !isCreateMode ? undefined : !confirmPassword ? 'Type your password again.' : password !== confirmPassword ? 'Passwords do not match.' : undefined,
  }
  const shownErrors: Partial<typeof fieldErrors> = submitAttempted ? fieldErrors : {}
  const emailError = shownErrors.email ?? (emailIsInvalid ? 'Enter a valid email address.' : undefined)
  const allowGoogle = !isAdminSurface
  const allowSignupLink = !isAdminSurface
  const allowForgotPassword = !isCreateMode
  const isSubmitDisabled = isSubmitting || isGoogleLoading

  useEffect(() => {
    // A guest session is not "signed in" here: the guest is on this page to log in or upgrade.
    if (!session || isGuest) {
      return
    }

    let isMounted = true

    const redirectSignedInUser = async () => {
      try {
        if (isCreateMode) {
          markSignupOnboardingAccess()

          if (isMounted) {
            await preloadAuthTargetPath('/onboarding')
            replaceWithPath('/onboarding')
          }
          return
        }

        const mfaStatus = await getUserMfaStatus(session)
        const redirectTo = await getPostAuthRedirect(session, window.location.search)

        if (isMounted) {
          if (mfaStatus.needsMfa) {
            const mfaVerifyPath = `/mfa/verify?next=${encodeURIComponent(redirectTo)}`
            await preloadAuthTargetPath(mfaVerifyPath)
            navigateToPath(mfaVerifyPath)
          } else {
            await preloadAuthTargetPath(redirectTo)
            navigateToPath(redirectTo)
          }
        }
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : 'We could not continue to onboarding.')
        }
      }
    }

    void redirectSignedInUser()

    return () => {
      isMounted = false
    }
  }, [isCreateMode, isGuest, session])

  const resetFormState = () => {
    setPassword('')
    setConfirmPassword('')
    setError('')
    setIsConfirmationPending(false)
    setIsGoogleLoading(false)
    setIsPasswordVisible(false)
    setIsConfirmPasswordVisible(false)
    setConfirmPasswordTouched(false)
    setSubmitAttempted(false)
    setResendMessage('')
    setStep('email')
  }

  const editEmail = () => {
    setStep('email')
    setError('')
    setSubmitAttempted(false)
    window.setTimeout(() => document.getElementById('auth-email')?.focus(), 0)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setError('')

    if (step === 'email') {
      if (fieldErrors.email) {
        setSubmitAttempted(true)
        document.getElementById('auth-email')?.focus()
        return
      }
      setSubmitAttempted(false)
      setEmail(normalizedEmail)
      setStep('password')
      window.setTimeout(() => document.getElementById('auth-password')?.focus(), 0)
      return
    }

    setSubmitAttempted(true)
    const firstInvalidField = fieldErrors.email ? 'auth-email' : fieldErrors.password ? 'auth-password' : fieldErrors.confirm ? 'auth-confirm-password' : null
    if (firstInvalidField) {
      document.getElementById(firstInvalidField)?.focus()
      return
    }

    try {
      setIsSubmitting(true)

      if (isCreateMode && isGuest) {
        try {
          await upgradeGuestWithEmailPassword(normalizedEmail, password, nextPath)
        } catch (upgradeError) {
          setError(isEmailTakenError(upgradeError) ? GUEST_EMAIL_TAKEN_MESSAGE : getFriendlyAuthError(upgradeError, mode))
          return
        }
        setEmail(normalizedEmail)
        setPassword('')
        setConfirmPassword('')
        setIsConfirmationPending(true)
        signUpCooldown.startCooldown()
        return
      }

      if (isCreateMode) {
        setRememberMePreference(true)
        markSignupOnboardingAccess()
        const signUpData = await signUpWithEmailPassword(normalizedEmail, password, nextPath)

        if (signUpData.session) {
          await preloadAuthTargetPath('/onboarding')
          replaceWithPath('/onboarding')
          return
        }

        setEmail(normalizedEmail)
        setPassword('')
        setConfirmPassword('')
        setIsConfirmationPending(true)
        signUpCooldown.startCooldown()
        return
      }

      setRememberMePreference(rememberMe)
      const session = await signInWithEmailPassword(normalizedEmail, password)

      if (isAdminSurface) {
        const currentUser = await getCurrentUser(session)

        if (!isAdminRole(currentUser.user.role)) {
          throw new Error('This email does not have admin access.')
        }

        markAdminPasswordSession(session.user.id)
        navigateToPath('/mfa/verify?next=/admin')
        return
      }

      const mfaStatus = await getUserMfaStatus(session)
      if (mfaStatus.needsMfa) {
        const postAuthRedirect = await getPostAuthRedirect(session, window.location.search)
        const mfaVerifyPath = postAuthRedirect !== '/home'
          ? `/mfa/verify?next=${encodeURIComponent(postAuthRedirect)}`
          : '/mfa/verify'
        await preloadAuthTargetPath(mfaVerifyPath)
        navigateToPath(mfaVerifyPath)
      } else {
        const postAuthRedirect = await getPostAuthRedirect(session, window.location.search)
        await preloadAuthTargetPath(postAuthRedirect)
        navigateToPath(postAuthRedirect)
      }
    } catch (caughtError) {
      setError(getFriendlyAuthError(caughtError, mode))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleLoadingChange = (isLoading: boolean) => {
    setIsGoogleLoading(isLoading)
  }

  const handleResendConfirmationEmail = async () => {
    if (signUpCooldown.isCoolingDown || isResendingConfirmation) {
      return
    }

    try {
      setIsResendingConfirmation(true)
      setError('')
      setResendMessage('')
      if (isGuest) {
        await resendGuestUpgradeEmail(normalizedEmail)
      } else {
        await resendSignUpConfirmationEmail(normalizedEmail, nextPath)
      }
      signUpCooldown.startCooldown()
      setResendMessage('We sent another confirmation email.')
    } catch (caughtError) {
      if (caughtError instanceof Error && typeof (caughtError as Error & { retryAfterMs?: number }).retryAfterMs === 'number') {
        signUpCooldown.startCooldown((caughtError as Error & { retryAfterMs: number }).retryAfterMs)
      }
      setError(getFriendlyAuthError(caughtError, mode))
    } finally {
      setIsResendingConfirmation(false)
    }
  }

  const barTitle = isAdminSurface ? 'Admin sign in' : isCreateMode ? 'Sign up' : 'Log in'
  const cardTitle = isAdminSurface ? 'Admin sign in' : isCreateMode ? 'Welcome to GalaTayo' : 'Welcome back'
  const cardDescription = isAdminSurface
    ? 'Use your admin email and password to continue.'
    : step === 'password'
      ? isCreateMode
        ? 'Pick a password for your new account.'
        : 'Enter your password to continue.'
      : isCreateMode
        ? isGuest
          ? 'Keep everything you did as a guest and use it on any device.'
          : 'Make an account and start planning your next gala with the barkada.'
        : 'Log in to see your plans and barkadas.'

  if (isConfirmationPending) {
    const resendLabel = signUpCooldown.isCoolingDown
      ? `Resend in ${formatCooldownDuration(signUpCooldown.remainingMs)}`
      : 'Resend confirmation email'

    return (
      <AuthCard
        bar="Sign up"
        icon={<Mail weight="light" />}
        title="Check your email"
        sub={
          <>
            We sent a link to <b style={{ color: 'var(--ink)' }}>{normalizedEmail}</b>.{' '}
            {isGuest
              ? 'Open it to finish your account. Your saved places, plans and stamps come with you.'
              : 'Confirm it, then come back and log in with your email and password.'}
          </>
        }
      >
        {resendMessage ? <AuthNotice>{resendMessage}</AuthNotice> : null}
        {error ? <AuthNotice tone="bad">{error}</AuthNotice> : null}
        <div className="grid gap-3">
          <Button variant="tara" size="lg" block onClick={resetFormState}>
            Continue
          </Button>
          <Button
            variant="line"
            block
            onClick={() => void handleResendConfirmationEmail()}
            disabled={signUpCooldown.isCoolingDown || isResendingConfirmation}
          >
            {isResendingConfirmation ? 'Sending...' : resendLabel}
          </Button>
        </div>
      </AuthCard>
    )
  }

  const submitLabel = isSubmitting
    ? isCreateMode
      ? 'Creating account...'
      : isAdminSurface
        ? 'Checking access...'
        : 'Signing in...'
    : step === 'email'
      ? 'Continue'
      : isCreateMode
        ? 'Create account'
        : isAdminSurface
          ? 'Sign in securely'
          : 'Log in'

  return (
    <AuthCard bar={barTitle} onBack={step === 'password' ? editEmail : undefined} backLabel="Change email" title={cardTitle} sub={cardDescription}>
      {resetSuccess ? <AuthNotice>Password updated. You can now sign in with your new password.</AuthNotice> : null}
      {!allowGoogle ? <AuthNotice tone="warn">Admin access uses email and password only. Account creation is disabled here.</AuthNotice> : null}
      {resendMessage ? <AuthNotice>{resendMessage}</AuthNotice> : null}
      {isGuest && !isCreateMode ? (
        <AuthNotice tone="warn">You’re using GalaTayo as a guest. Logging in switches to your account, and guest stuff stays behind. To keep it, create an account instead.</AuthNotice>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {step === 'email' ? (
          <div className="g-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              autoFocus
              placeholder="you@email.com"
              aria-invalid={Boolean(emailError) || undefined}
              aria-describedby={emailError ? 'auth-email-msg' : undefined}
              className="g-input h-14 text-[16px]"
            />
            {emailError ? <span id="auth-email-msg" className="g-hint is-error">{emailError}</span> : null}
          </div>
        ) : (
          <>
            <input type="email" name="username" autoComplete="username" value={normalizedEmail} readOnly hidden />
            <div className="m-auth-who">
              <b title={normalizedEmail}>{normalizedEmail}</b>
              <Button variant="text" size="sm" onClick={editEmail}>
                Edit
              </Button>
            </div>

            <PasswordField
              id="auth-password"
              label={isCreateMode ? 'Create a password' : 'Password'}
              value={password}
              onChange={setPassword}
              visible={isPasswordVisible}
              onToggleVisible={() => setIsPasswordVisible((current) => !current)}
              required
              minLength={isCreateMode ? minPasswordLength : undefined}
              autoComplete={isCreateMode ? 'new-password' : 'current-password'}
              placeholder={isCreateMode ? 'At least 8 characters' : 'Your password'}
              invalid={passwordIsInvalid || Boolean(shownErrors.password)}
              error={shownErrors.password}
              hint={isCreateMode ? 'Use uppercase, lowercase, a number, and a symbol.' : undefined}
            >
              {isCreateMode ? <PasswordStrengthBar password={password} /> : null}
            </PasswordField>

            {isCreateMode ? (
              <PasswordField
                id="auth-confirm-password"
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                onBlur={() => setConfirmPasswordTouched(true)}
                visible={isConfirmPasswordVisible}
                onToggleVisible={() => setIsConfirmPasswordVisible((current) => !current)}
                required
                minLength={minPasswordLength}
                autoComplete="new-password"
                placeholder="Type it again"
                invalid={confirmPasswordHasMismatch || Boolean(shownErrors.confirm)}
                error={shownErrors.confirm ?? (confirmPasswordTouched && confirmPasswordHasMismatch ? 'Passwords do not match.' : undefined)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <label className="g-sm inline-flex min-h-11 cursor-pointer items-center gap-2" style={{ color: 'var(--ink-2)' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-[18px] w-[18px]"
                    style={{ accentColor: 'var(--ink)' }}
                  />
                  Remember me
                </label>
                {allowForgotPassword ? (
                  <Button variant="text" size="sm" onClick={() => navigateToPath('/forgot-password')}>
                    Forgot password?
                  </Button>
                ) : null}
              </div>
            )}
          </>
        )}

        {error ? <AuthNotice tone="bad">{error}</AuthNotice> : null}

        <Button type="submit" variant="tara" size="lg" block disabled={isSubmitDisabled}>
          {submitLabel}
        </Button>
      </form>

      {allowGoogle && step === 'email' ? (
        <>
          <OrDivider />
          <AuthMethodChooser
            isGoogleLoading={isGoogleLoading}
            onGoogleLoadingChange={handleGoogleLoadingChange}
            onError={setError}
            nextPath={isCreateMode ? (nextPath ?? '/onboarding') : nextPath}
            flow={isCreateMode ? 'signup' : undefined}
            rememberMe={rememberMe}
          />
        </>
      ) : null}

      {allowSignupLink ? (
        <p className="g-sm g-mut text-center">
          {isCreateMode ? 'Already have an account?' : 'New to GalaTayo?'}{' '}
          <InlineLink onClick={() => navigateToPath(buildAuthPath(isCreateMode ? '/login' : '/signup', nextPath))}>
            {isCreateMode ? 'Log in' : 'Create an account'}
          </InlineLink>
        </p>
      ) : null}

      {isCreateMode ? (
        <p className="m-auth-fine">
          By creating an account, you agree to GalaTayo&apos;s{' '}
          <button type="button" onClick={() => navigateToPath('/terms')}>
            Terms
          </button>{' '}
          and{' '}
          <button type="button" onClick={() => navigateToPath('/privacy')}>
            Privacy Policy
          </button>
          .
        </p>
      ) : null}
    </AuthCard>
  )
}

export default AuthPage
