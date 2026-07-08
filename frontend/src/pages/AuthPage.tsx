import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppIcon } from '../components/AppIcon'
import AuthMethodChooser from '../components/auth/AuthMethodChooser'
import { checkEmailExists, getPostAuthRedirect, signInWithEmailPassword, signUpWithEmailPassword } from '../services/authApi'
import { buildAuthPath, getRequestedNextPath } from '../utils/authRedirect'
import { navigateToPath } from '../utils/navigation'
import galaTayoLogo from '../assets/brand/galatayo-logo.svg'

type AuthMode = 'sign_in' | 'create_account'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const minPasswordLength = 8

function getFriendlyAuthError(error: unknown, mode: AuthMode) {
  const message = error instanceof Error ? error.message : ''
  const lowerMessage = message.toLowerCase()

  if (
    message === 'Email is required.' ||
    message === 'Enter a valid email address.' ||
    message === 'Password is required.' ||
    message === 'Passwords do not match.' ||
    message === 'Use a stronger password with at least 8 characters.'
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
      ? 'Use a stronger password with at least 8 characters.'
      : 'The email or password is incorrect.'
  }

  if (lowerMessage.includes('invalid email')) {
    return 'Enter a valid email address.'
  }

  return message || (mode === 'create_account' ? 'Could not create your account. Please try again.' : 'Could not sign you in. Please try again.')
}

type AuthPageProps = {
  mode?: AuthMode
}

function AuthPage({ mode = 'sign_in' }: AuthPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOAuthLoading, setIsOAuthLoading] = useState(false)
  const [isConfirmationPending, setIsConfirmationPending] = useState(false)
  const [error, setError] = useState('')
  const [emailLookupStatus, setEmailLookupStatus] = useState<'idle' | 'checking' | 'available' | 'exists'>('idle')
  const [emailFieldMessage, setEmailFieldMessage] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false)

  const isCreateMode = mode === 'create_account'
  const nextPath = getRequestedNextPath()
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const isEmailValid = emailPattern.test(normalizedEmail)
  const emailFormatIsValid = !normalizedEmail || isEmailValid
  const emailAlreadyExists = isCreateMode && emailLookupStatus === 'exists'
  const passwordMeetsLength = password.length >= minPasswordLength
  const emailIsInvalid = isCreateMode && (!emailFormatIsValid || emailAlreadyExists)
  const passwordIsInvalid = isCreateMode && password.length > 0 && !passwordMeetsLength
  const confirmPasswordHasMismatch = isCreateMode && confirmPassword.length > 0 && password !== confirmPassword
  const isCreateFormValid =
    isEmailValid &&
    passwordMeetsLength &&
    confirmPassword.length >= minPasswordLength &&
    password === confirmPassword &&
    !emailAlreadyExists &&
    emailLookupStatus !== 'checking'
  const isLoginFormValid = isEmailValid && password.length > 0
  const isSubmitDisabled = isSubmitting || isOAuthLoading || (isCreateMode ? !isCreateFormValid : !isLoginFormValid)

  const resetFormState = () => {
    setPassword('')
    setConfirmPassword('')
    setError('')
    setEmailLookupStatus('idle')
    setEmailFieldMessage('')
    setIsConfirmationPending(false)
    setIsPasswordVisible(false)
    setIsConfirmPasswordVisible(false)
    setConfirmPasswordTouched(false)
  }

  useEffect(() => {
    if (!isCreateMode || !normalizedEmail || !isEmailValid) {
      return undefined
    }

    let isMounted = true
    const timer = window.setTimeout(() => {
      setEmailLookupStatus('checking')
      setEmailFieldMessage('')

      void checkEmailExists(normalizedEmail)
        .then((result) => {
          if (!isMounted) {
            return
          }

          if (result.exists) {
            setEmailLookupStatus('exists')
            setEmailFieldMessage('This email already has an account.')
            return
          }

          setEmailLookupStatus('available')
          setEmailFieldMessage('')
        })
        .catch((caughtError) => {
          if (!isMounted) {
            return
          }

          setEmailLookupStatus('idle')
          setEmailFieldMessage(caughtError instanceof Error ? caughtError.message : 'Could not check email.')
        })
    }, 450)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [isCreateMode, normalizedEmail, isEmailValid])

  const validateForm = (normalizedValue: string) => {
    if (!normalizedValue) {
      throw new Error('Email is required.')
    }

    if (!emailPattern.test(normalizedValue)) {
      throw new Error('Enter a valid email address.')
    }

    if (!password) {
      throw new Error('Password is required.')
    }

    if (isCreateMode && password.length < minPasswordLength) {
      throw new Error('Use a stronger password with at least 8 characters.')
    }

    if (isCreateMode && password !== confirmPassword) {
      throw new Error('Passwords do not match.')
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    try {
      setError('')
      validateForm(normalizedEmail)

      if (emailAlreadyExists) {
        throw new Error('This email already has an account.')
      }

      setIsSubmitting(true)

      if (isCreateMode) {
        await signUpWithEmailPassword(normalizedEmail, password, nextPath)

        setEmail(normalizedEmail)
        setPassword('')
        setConfirmPassword('')
        setIsConfirmationPending(true)
        return
      }

      const session = await signInWithEmailPassword(normalizedEmail, password)

      if (!session) {
        throw new Error('Please confirm your email before signing in.')
      }

      const redirectTo = await getPostAuthRedirect(session)
      navigateToPath(redirectTo)
    } catch (caughtError) {
      setError(getFriendlyAuthError(caughtError, mode))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLoadingChange = (isLoading: boolean) => {
    setIsOAuthLoading(isLoading)
  }

  const cardTitle = isCreateMode ? 'Create an account' : 'Welcome back'
  const cardDescription = isCreateMode
    ? 'Set up your GalaTayo account and start planning your next gala.'
    : 'Continue planning your next gala.'
  if (isConfirmationPending) {
    return (
      <main className="gala-page-background min-h-screen min-h-[100dvh] px-4 py-6 text-[var(--text)] sm:px-6 sm:py-8">
        <section className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] items-center justify-center">
          <div className="w-full rounded-[24px] border border-[var(--line)] bg-white px-6 py-8 text-center shadow-[0_20px_40px_rgba(0,0,0,0.05)] sm:px-8 sm:py-10">
            <img src={galaTayoLogo} alt="GalaTayo" className="mx-auto h-auto w-[160px] sm:w-[180px]" loading="eager" />
            <div className="mx-auto mt-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
              <AppIcon name="email" className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <h1 className="mt-5 text-[1.65rem] font-extrabold leading-[1.02] tracking-[-0.05em] text-[var(--text-main)] sm:text-[1.9rem]">
              Check your email
            </h1>
            <p className="mx-auto mt-3 max-w-[280px] text-[14px] leading-6 text-[var(--muted)]">
              Check your email to confirm your GalaTayo account.
            </p>
            <p className="mx-auto mt-3 max-w-[300px] text-[14px] leading-6 text-[var(--muted)]">
              After confirming, return to GalaTayo with your email and password.
            </p>
            <button
              type="button"
              onClick={resetFormState}
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-[12px] bg-[#2563eb] px-6 text-[14px] font-semibold text-white shadow-[0_12px_24px_rgba(37,99,235,0.18)] transition hover:-translate-y-0.5 hover:bg-[#1d4ed8] focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.16)]"
            >
              Continue
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="gala-page-background min-h-screen min-h-[100dvh] text-[var(--text)]">
      <div className="mx-auto grid w-full max-w-[1100px] items-start md:min-h-[100dvh] md:items-center md:grid-cols-2">
        <section className="flex flex-col items-center justify-start px-4 pb-2 pt-12 text-center md:items-start md:px-8 md:py-6 md:text-left lg:px-12 lg:py-8">
          <div className="flex w-full max-w-[520px] flex-col items-center gap-4 md:items-center">
            <img
              src={galaTayoLogo}
              alt="GalaTayo"
              className="mb-2 h-auto w-[160px] sm:w-[180px] md:hidden"
              loading="eager"
            />
            <div className="max-w-[28rem]">
              <h1 className="text-[2rem] font-extrabold leading-[0.98] tracking-[-0.055em] text-[var(--text-main)] sm:text-[2.35rem] lg:text-[3rem]">
                {cardTitle}
              </h1>
              <p className="mt-2 max-w-[26rem] text-[15px] leading-7 text-[var(--muted)] sm:text-[16px]">
                {cardDescription}
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-start justify-center px-4 pb-8 pt-0 md:px-6 md:pb-8 lg:px-10 lg:pb-10">
          <div className="w-full max-w-[540px] px-0 py-0">
            <img
              src={galaTayoLogo}
              alt="GalaTayo"
              className="mx-auto mb-4 hidden h-auto w-[160px] sm:w-[180px] md:block"
              loading="eager"
            />
            <div className="mt-3">
              <AuthMethodChooser
                isLoading={isOAuthLoading || isSubmitting}
                onLoadingChange={handleLoadingChange}
                onError={setError}
              />
            </div>

            <div className="my-4 flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--muted)]">
              <span className="h-px flex-1 bg-[var(--line)]" />
              OR
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>

            <form className="grid gap-4 text-left" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-semibold text-[var(--text-main)]">
                  <AppIcon name="email" className="h-3.5 w-3.5 text-[var(--accent)]" />
                  Email
                </span>
                <span
                  className={`flex h-12 items-center rounded-[12px] border bg-white px-3.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition focus-within:-translate-y-0.5 focus-within:border-[#2563eb] focus-within:shadow-[inset_0_1px_2px_rgba(15,23,42,0.08),0_0_0_4px_rgba(37,99,235,0.12)] ${
                    emailIsInvalid ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[inset_0_1px_2px_rgba(15,23,42,0.08),0_0_0_4px_rgba(220,38,38,0.1)]' : 'border-[var(--line)]'
                  }`}
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    placeholder="Enter your email"
                    className="h-full w-full bg-transparent text-[14px] font-medium text-[var(--text-main)] outline-none placeholder:font-normal placeholder:text-slate-400"
                  />
                </span>
                {isCreateMode && emailFieldMessage ? (
                  <span className="text-xs text-red-600">{emailFieldMessage || 'This email already has an account.'}</span>
                ) : null}
              </label>

              <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-semibold text-[var(--text-main)]">
                  <AppIcon name="lock" className="h-3.5 w-3.5 text-[var(--accent)]" />
                  Password
                </span>
                <span
                  className={`flex h-12 items-center gap-3 rounded-[12px] border bg-white px-3.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition focus-within:-translate-y-0.5 focus-within:border-[#2563eb] focus-within:shadow-[inset_0_1px_2px_rgba(15,23,42,0.08),0_0_0_4px_rgba(37,99,235,0.12)] ${
                    passwordIsInvalid ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[inset_0_1px_2px_rgba(15,23,42,0.08),0_0_0_4px_rgba(220,38,38,0.1)]' : 'border-[var(--line)]'
                  }`}
                >
                  <input
                    type={isPasswordVisible ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={isCreateMode ? minPasswordLength : undefined}
                    autoComplete={isCreateMode ? 'new-password' : 'current-password'}
                    placeholder="Enter your password"
                    className="h-full w-full min-w-0 bg-transparent text-[14px] font-medium text-[var(--text-main)] outline-none placeholder:font-normal placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((current) => !current)}
                    className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.12)]"
                    aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                    aria-pressed={isPasswordVisible}
                  >
                    <AppIcon name={isPasswordVisible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                  </button>
                </span>
                {isCreateMode && password.length > 0 && !passwordMeetsLength ? (
                  <span className="text-xs text-red-600">Use at least 8 characters.</span>
                ) : null}
              </label>

              {!isCreateMode ? (
                <button
                  type="button"
                  onClick={() => navigateToPath('/forgot-password')}
                  className="w-fit text-[13px] font-semibold text-[var(--accent-deep)] transition hover:text-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.12)]"
                >
                  Forgot password?
                </button>
              ) : null}

              {isCreateMode ? (
                <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                  <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-semibold text-[var(--text-main)]">
                    <AppIcon name="lock" className="h-3.5 w-3.5 text-[var(--accent)]" />
                    Confirm Password
                  </span>
                  <span
                    className={`flex h-12 items-center gap-3 rounded-[12px] border bg-white px-3.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] transition focus-within:-translate-y-0.5 focus-within:border-[#2563eb] focus-within:shadow-[inset_0_1px_2px_rgba(15,23,42,0.08),0_0_0_4px_rgba(37,99,235,0.12)] ${
                      confirmPasswordHasMismatch ? 'border-red-300 focus-within:border-red-400 focus-within:shadow-[inset_0_1px_2px_rgba(15,23,42,0.08),0_0_0_4px_rgba(220,38,38,0.1)]' : 'border-[var(--line)]'
                    }`}
                  >
                    <input
                      type={isConfirmPasswordVisible ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      onBlur={() => setConfirmPasswordTouched(true)}
                      required
                      minLength={minPasswordLength}
                      autoComplete="new-password"
                      placeholder="Confirm your password"
                      className="h-full w-full min-w-0 bg-transparent text-[14px] font-medium text-[var(--text-main)] outline-none placeholder:font-normal placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setIsConfirmPasswordVisible((current) => !current)}
                      className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.12)]"
                      aria-label={isConfirmPasswordVisible ? 'Hide password' : 'Show password'}
                      aria-pressed={isConfirmPasswordVisible}
                    >
                      <AppIcon name={isConfirmPasswordVisible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                    </button>
                  </span>
                  {confirmPasswordTouched && confirmPasswordHasMismatch ? (
                    <span className="text-xs text-red-600">Confirm password does not match.</span>
                  ) : null}
                </label>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#2563eb] px-5 text-[14px] font-semibold text-white shadow-[0_14px_28px_rgba(37,99,235,0.18)] transition hover:-translate-y-0.5 hover:bg-[#1d4ed8] focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.16)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <span
                      className="inline-flex h-4.5 w-4.5 animate-spin rounded-full border-2 border-white/35 border-t-white"
                      aria-hidden="true"
                    />
                    {isCreateMode ? 'Creating account...' : 'Signing in...'}
                  </>
                ) : (
                  <>{isCreateMode ? 'Create account' : 'Sign in'}</>
                )}
              </button>
            </form>

            {isCreateMode ? (
              <p className="mt-4 text-center text-[11px] leading-5 text-[var(--muted)]">
                By creating an account, you agree to GalaTayo&apos;s{' '}
                <button
                  type="button"
                  onClick={() => navigateToPath('/terms')}
                  className="font-semibold text-[var(--accent-deep)] underline underline-offset-2 focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.12)]"
                >
                  Terms
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => navigateToPath('/privacy')}
                  className="font-semibold text-[var(--accent-deep)] underline underline-offset-2 focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.12)]"
                >
                  Privacy Policy
                </button>
                .
              </p>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 shadow-sm">
                {error}
              </p>
            ) : null}

            <p className="mt-5 text-center text-[13px] text-[var(--muted)]">
              {isCreateMode ? 'Already have an account?' : 'New to GalaTayo?'}{' '}
              <button
                type="button"
                onClick={() => navigateToPath(buildAuthPath(isCreateMode ? '/login' : '/signup', nextPath))}
                className="min-h-10 font-semibold text-[var(--accent-deep)] underline underline-offset-2 transition hover:text-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.12)]"
              >
                {isCreateMode ? 'Log in' : 'Create account'}
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}

export default AuthPage
