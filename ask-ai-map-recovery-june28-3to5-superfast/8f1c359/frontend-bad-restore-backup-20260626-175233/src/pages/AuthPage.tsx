import { useEffect, useMemo, useState, type FormEvent } from 'react'
import AuthMethodChooser from '../components/auth/AuthMethodChooser'
import { checkEmailExists, getPostAuthRedirect, signInWithEmailPassword, signUpWithEmailPassword } from '../services/authApi'
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

  const isCreateMode = mode === 'create_account'
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const emailAlreadyExists = isCreateMode && emailStatus === 'exists'

  const resetFormState = () => {
    setPassword('')
    setConfirmPassword('')
    setError('')
    setEmailStatus('idle')
    setEmailFieldMessage('')
    setIsConfirmationPending(false)
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
        await signUpWithEmailPassword(normalizedEmail, password)

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
      <main className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-black">
        <section className="w-full max-w-[420px] text-center">
          <button
            type="button"
            onClick={() => navigateToPath('/')}
            className="mb-10 text-sm font-black underline underline-offset-4"
          >
            Back
          </button>
          <h1 className="text-4xl font-black leading-tight">Check your email</h1>
          <p className="mt-4 text-base font-semibold leading-relaxed text-black/65">
            Check your email to confirm your GalaTayo account.
          </p>
          <p className="mt-3 text-sm font-semibold leading-6 text-black/55">
            After confirming, return to GalaTayo with your email and password.
          </p>
          <button
            type="button"
            onClick={resetFormState}
            className="mt-8 h-12 rounded-lg bg-black px-5 text-sm font-black text-white transition hover:bg-black/85"
          >
            Back
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-10 text-black">
      <section className="w-full max-w-[420px] text-center">
        <button
          type="button"
          onClick={() => navigateToPath('/')}
          className="mb-10 text-sm font-black underline underline-offset-4"
        >
          Back
        </button>
        <h1 className="text-4xl font-black leading-tight">{isCreateMode ? 'Create your GalaTayo account' : 'Log in to GalaTayo'}</h1>
        <p className="mt-4 text-base font-semibold leading-relaxed text-black/65">
          {isCreateMode ? 'Create your account before setting up your GalaTayo profile.' : 'Log in to continue your GalaTayo profile.'}
        </p>

        <div className="mt-8">
          <AuthMethodChooser
            isLoading={isOAuthLoading || isSubmitting}
            onLoadingChange={handleLoadingChange}
            onError={setError}
          />

          <div className="my-6 flex items-center gap-3 text-xs font-black uppercase text-black/35">
            <span className="h-px flex-1 bg-black/10" />
            Email
            <span className="h-px flex-1 bg-black/10" />
          </div>

          <form className="mt-5 grid gap-5 text-left" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-sm font-black text-black">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className={`h-12 rounded-lg border px-4 text-base font-semibold outline-none focus:ring-4 ${emailAlreadyExists ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : 'border-black/20 focus:border-black focus:ring-black/10'}`}
              />
              {isCreateMode && emailFieldMessage ? (
                <span className={`text-xs font-bold ${emailStatus === 'available' ? 'text-emerald-700' : emailStatus === 'checking' ? 'text-black/55' : 'text-red-600'}`}>
                  {emailFieldMessage}
                </span>
              ) : null}
            </label>
            <label className="grid gap-2 text-sm font-black text-black">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={isCreateMode ? minPasswordLength : undefined}
                autoComplete={isCreateMode ? 'new-password' : 'current-password'}
                className="h-12 rounded-lg border border-black/20 px-4 text-base font-semibold outline-none focus:border-black focus:ring-4 focus:ring-black/10"
              />
            </label>
            {isCreateMode ? (
              <label className="grid gap-2 text-sm font-black text-black">
                Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={minPasswordLength}
                  autoComplete="new-password"
                  className="h-12 rounded-lg border border-black/20 px-4 text-base font-semibold outline-none focus:border-black focus:ring-4 focus:ring-black/10"
                />
              </label>
            ) : null}
            <button
              type="submit"
              disabled={isSubmitting || isOAuthLoading || emailAlreadyExists || (isCreateMode && emailStatus === 'checking')}
              className="h-12 rounded-lg bg-black px-5 text-sm font-black text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? (isCreateMode ? 'Creating account...' : 'Signing in...') : isCreateMode ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </div>

        {error ? <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
      </section>
    </main>
  )
}

export default AuthPage
