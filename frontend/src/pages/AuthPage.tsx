import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppIcon } from '../components/AppIcon'
import AuthMethodChooser from '../components/auth/AuthMethodChooser'
import { FormContainer } from '../components/layout/ResponsiveLayouts'
import { checkEmailExists, getPostAuthRedirect, signInWithEmailPassword, signUpWithEmailPassword } from '../services/authApi'
import { buildAuthPath, getRequestedNextPath } from '../utils/authRedirect'
import { navigateToPath } from '../utils/navigation'

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

  if (lowerMessage.includes('already registered') || lowerMessage.includes('already exists') || lowerMessage.includes('already has an account') || lowerMessage.includes('user already')) {
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
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'exists' | 'invalid'>('idle')
  const [emailFieldMessage, setEmailFieldMessage] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)

  const isCreateMode = mode === 'create_account'
  const nextPath = getRequestedNextPath()
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const emailAlreadyExists = isCreateMode && emailStatus === 'exists'
  const isEmailValid = emailPattern.test(normalizedEmail)
  const passwordMeetsLength = password.length >= minPasswordLength
  const confirmPasswordMatches = !isCreateMode || confirmPassword.length === 0 || password === confirmPassword
  const confirmPasswordHasMismatch = isCreateMode && confirmPassword.length > 0 && password !== confirmPassword
  const isCreateFormValid = isEmailValid && passwordMeetsLength && confirmPassword.length >= minPasswordLength && password === confirmPassword && !emailAlreadyExists && emailStatus !== 'checking'
  const isLoginFormValid = isEmailValid && password.length > 0
  const isSubmitDisabled = isSubmitting || isOAuthLoading || (isCreateMode ? !isCreateFormValid : !isLoginFormValid)

  const resetFormState = () => {
    setPassword('')
    setConfirmPassword('')
    setError('')
    setEmailStatus('idle')
    setEmailFieldMessage('')
    setIsConfirmationPending(false)
    setIsPasswordVisible(false)
    setIsConfirmPasswordVisible(false)
  }

  useEffect(() => {
    if (!isCreateMode) {
      setEmailStatus('idle')
      setEmailFieldMessage('')
      return undefined
    }

    if (!normalizedEmail) {
      setEmailStatus('idle')
      setEmailFieldMessage('')
      return undefined
    }

    if (!emailPattern.test(normalizedEmail)) {
      setEmailStatus('invalid')
      setEmailFieldMessage('Enter a valid email address.')
      return undefined
    }

    let isMounted = true
    const timer = window.setTimeout(() => {
      setEmailStatus('checking')
      setEmailFieldMessage('Checking email...')

      void checkEmailExists(normalizedEmail)
        .then((result) => {
          if (!isMounted) {
            return
          }

          if (result.exists) {
            setEmailStatus('exists')
            setEmailFieldMessage('This email already has an account.')
            return
          }

          setEmailStatus('available')
          setEmailFieldMessage('Email is available.')
        })
        .catch((caughtError) => {
          if (!isMounted) {
            return
          }

          setEmailStatus('idle')
          setEmailFieldMessage(caughtError instanceof Error ? caughtError.message : 'Could not check email.')
        })
    }, 450)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [isCreateMode, normalizedEmail])

  const validateForm = (normalizedEmail: string) => {
    if (!normalizedEmail) {
      throw new Error('Email is required.')
    }

    if (!emailPattern.test(normalizedEmail)) {
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

  if (isConfirmationPending) {
    return (
      <main className="gala-page-background relative flex min-h-screen min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-6 text-[var(--text)] sm:px-6 sm:py-8">
        <FormContainer className="relative z-[2]">
          <section className="mx-auto flex w-full max-w-[360px] items-center justify-center md:max-w-[420px] lg:max-w-[440px]">
            <div className="w-full text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[1.2rem] border border-[var(--line)] bg-white shadow-sm">
                <AppIcon name="email" className="h-5 w-5 text-[var(--accent-deep)]" />
              </div>
              <div className="mt-5">
                <h1 className="text-[1.6rem] font-semibold leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-[1.85rem]">Check your email</h1>
                <p className="mx-auto mt-3 max-w-[260px] text-[13px] leading-6 text-slate-500 sm:text-[14px] sm:leading-7">
                  Check your email to confirm your GalaTayo account.
                </p>
                <p className="mt-3 text-[13px] leading-6 text-slate-500">
                  After confirming, return to GalaTayo with your email and password.
                </p>
                <button
                  type="button"
                  onClick={resetFormState}
                  className="mt-6 inline-flex min-h-[2.75rem] items-center justify-center rounded-[0.875rem] bg-[var(--accent)] px-6 text-[14px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
                >
                  Continue
                </button>
              </div>
            </div>
          </section>
        </FormContainer>
      </main>
    )
  }

  return (
    <main className="gala-page-background relative flex min-h-screen min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-6 text-[var(--text)] sm:px-6 sm:py-8">
      <FormContainer className="relative z-[2]">
        <section className="mx-auto flex w-full max-w-[360px] items-center justify-center md:max-w-[420px] lg:max-w-[440px]">
          <div className="w-full">
            <div className="pb-3 pt-1 text-center">
              <div className="mx-auto max-w-[280px] px-2">
                <h1 className="inline-flex flex-wrap items-center justify-center gap-2 text-[1.6rem] font-bold leading-[0.96] tracking-[-0.05em] text-[var(--text-main)] sm:text-[1.85rem]">
                    <AppIcon name={isCreateMode ? 'sparkles' : 'home'} className="h-6 w-6 text-[var(--accent-deep)]" />
                    {isCreateMode ? 'Create an account' : 'Welcome back'}
                  </h1>
                <p className="mx-auto mt-3 max-w-[260px] text-[13px] leading-6 text-[var(--muted)] sm:text-[14px] sm:leading-7">
                  {isCreateMode ? 'Set up your GalaTayo account and start planning your next gala.' : 'Continue planning your next gala.'}
                </p>
              </div>

              <div className="mt-6">
                <AuthMethodChooser
                  isLoading={isOAuthLoading || isSubmitting}
                  onLoadingChange={handleLoadingChange}
                  onError={setError}
                />

                <div className="my-4 flex items-center gap-4 text-[9px] font-semibold uppercase tracking-[0.26em] text-[var(--muted)]">
                  <span className="h-px flex-1 bg-[var(--line)]" />
                  OR
                  <span className="h-px flex-1 bg-[var(--line)]" />
                </div>

                <form className="mt-3 grid gap-3 text-left" onSubmit={handleSubmit}>
                  <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-medium text-[var(--text)]">
                      <AppIcon name="email" className="h-3.5 w-3.5 text-[var(--accent-deep)]" />
                      Email
                    </span>
                    <span className={`flex h-[2.85rem] items-center rounded-[1.2rem] border px-3.5 shadow-sm transition focus-within:-translate-y-0.5 focus-within:ring-4 ${emailAlreadyExists ? 'border-red-300 bg-white focus-within:border-red-400 focus-within:ring-red-100' : 'border-[var(--line)] bg-white focus-within:border-[var(--accent)] focus-within:bg-white focus-within:ring-[var(--accent-soft)]'}`}>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        autoComplete="email"
                        placeholder="Enter your email"
                        className="h-full w-full bg-transparent text-[14px] font-medium text-[var(--text)] outline-none placeholder:font-normal placeholder:text-slate-400"
                      />
                    </span>
                    {isCreateMode && emailFieldMessage ? (
                      <span className={`text-xs ${emailStatus === 'available' ? 'text-emerald-700' : emailStatus === 'checking' ? 'text-[var(--muted)]' : 'text-red-600'}`}>
                        {emailFieldMessage}
                      </span>
                    ) : null}
                  </label>
                  <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-medium text-[var(--text)]">
                      <AppIcon name="lock" className="h-3.5 w-3.5 text-[var(--accent-deep)]" />
                      Password
                    </span>
                    <span className="flex h-[2.85rem] items-center gap-3 rounded-[1.2rem] border border-[var(--line)] bg-white px-3.5 shadow-sm transition focus-within:-translate-y-0.5 focus-within:border-[var(--accent)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--accent-soft)]">
                      <input
                        type={isPasswordVisible ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        minLength={isCreateMode ? minPasswordLength : undefined}
                        autoComplete={isCreateMode ? 'new-password' : 'current-password'}
                        placeholder="Enter your password"
                        className="h-full w-full min-w-0 bg-transparent text-[14px] font-medium text-[var(--text)] outline-none placeholder:font-normal placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setIsPasswordVisible((current) => !current)}
                        className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
                        aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                        aria-pressed={isPasswordVisible}
                      >
                        <AppIcon name={isPasswordVisible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                      </button>
                    </span>
                    {isCreateMode ? (
                      <span className={`text-xs ${password.length > 0 && !passwordMeetsLength ? 'text-red-600' : 'text-[var(--muted)]'}`}>
                        Use at least 8 characters.
                      </span>
                    ) : null}
                  </label>
                  {!isCreateMode ? (
                    <button
                      type="button"
                      className="mt-0 min-h-10 w-fit pl-1 text-[13px] font-medium text-[var(--accent-deep)] transition hover:text-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
                    >
                      Forgot password?
                    </button>
                  ) : null}
                  {isCreateMode ? (
                    <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                      <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-medium text-[var(--text)]">
                        <AppIcon name="lock" className="h-3.5 w-3.5 text-[var(--accent-deep)]" />
                        Confirm Password
                      </span>
                      <span className={`flex h-[2.85rem] items-center gap-3 rounded-[1.2rem] border px-3.5 shadow-sm transition focus-within:-translate-y-0.5 focus-within:ring-4 ${confirmPasswordHasMismatch ? 'border-red-300 bg-white focus-within:border-red-400 focus-within:ring-red-100' : 'border-[var(--line)] bg-white focus-within:border-[var(--accent)] focus-within:bg-white focus-within:ring-[var(--accent-soft)]'}`}>
                        <input
                          type={isConfirmPasswordVisible ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          required
                          minLength={minPasswordLength}
                          autoComplete="new-password"
                          placeholder="Confirm your password"
                          className="h-full w-full min-w-0 bg-transparent text-[14px] font-medium text-[var(--text)] outline-none placeholder:font-normal placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          onClick={() => setIsConfirmPasswordVisible((current) => !current)}
                          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--accent-wash)] hover:text-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
                          aria-label={isConfirmPasswordVisible ? 'Hide password' : 'Show password'}
                          aria-pressed={isConfirmPasswordVisible}
                        >
                          <AppIcon name={isConfirmPasswordVisible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                        </button>
                      </span>
                      {confirmPasswordHasMismatch ? (
                        <span className="text-xs text-red-600">
                          Confirm password does not match.
                        </span>
                      ) : confirmPassword.length > 0 && confirmPasswordMatches ? (
                        <span className="text-xs text-emerald-700">
                          Passwords match.
                        </span>
                      ) : null}
                    </label>
                  ) : null}
                  <button
                    type="submit"
                    disabled={isSubmitDisabled}
                    className="w-full inline-flex h-[2.75rem] items-center justify-center gap-2 rounded-[0.875rem] bg-[var(--accent)] px-5 text-[14px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="inline-flex h-4.5 w-4.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                        {isCreateMode ? 'Creating account...' : 'Signing in...'}
                      </>
                    ) : (
                      <>
                        {isCreateMode ? 'Create account' : 'Sign in'}
                      </>
                    )}
                  </button>
                </form>
              </div>

              {isCreateMode ? (
                <p className="mx-auto mt-3 max-w-[280px] text-center text-[11px] font-semibold leading-5 text-[var(--muted)]">
                  By creating an account, you agree to GalaTayo&apos;s{' '}
                  <button type="button" onClick={() => navigateToPath('/terms')} className="font-semibold text-[var(--accent-deep)] underline underline-offset-2 focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]">
                    Terms
                  </button>{' '}
                  and{' '}
                  <button type="button" onClick={() => navigateToPath('/privacy')} className="font-semibold text-[var(--accent-deep)] underline underline-offset-2 focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]">
                    Privacy Policy
                  </button>
                  .
                </p>
              ) : null}

              {error ? <p className="mt-3 rounded-[0.875rem] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 shadow-sm">{error}</p> : null}

              <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
                {isCreateMode ? 'Already have an account?' : 'New to GalaTayo?'}{' '}
                  <button
                    type="button"
                    onClick={() => navigateToPath(buildAuthPath(isCreateMode ? '/login' : '/signup', nextPath))}
                    className="min-h-10 font-semibold text-[var(--accent-deep)] underline underline-offset-2 transition hover:text-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
                  >
                    {isCreateMode ? 'Log in' : 'Create account'}
                </button>
              </p>
            </div>
          </div>
        </section>
      </FormContainer>
    </main>
  )
}

export default AuthPage
