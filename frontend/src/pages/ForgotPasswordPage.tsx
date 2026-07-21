import { useMemo, useState, type FormEvent } from 'react'
import { AppIcon } from '../components/AppIcon'
import { FormContainer } from '../components/layout/ResponsiveLayouts'
import { sendPasswordResetEmail } from '../services/authApi'
import { navigateToPath } from '../utils/navigation'
import { formatCooldownDuration, useResendCooldown } from '../hooks/useResendCooldown'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const resendCooldownMs = 2 * 60 * 1000

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [isResending, setIsResending] = useState(false)
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const resendCooldown = useResendCooldown(normalizedEmail ? `recovery:${normalizedEmail}` : null, resendCooldownMs)

  const isEmailValid = emailPattern.test(normalizedEmail)
  const isSubmitDisabled = isSubmitting || !isEmailValid

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!normalizedEmail) {
      setError('Email is required.')
      return
    }

    if (!emailPattern.test(normalizedEmail)) {
      setError('Enter a valid email address.')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')
      setStatusMessage('')
      await sendPasswordResetEmail(normalizedEmail)
      setIsSent(true)
      resendCooldown.startCooldown()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send reset email. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResendResetEmail = async () => {
    if (resendCooldown.isCoolingDown || isResending) {
      return
    }

    try {
      setIsResending(true)
      setError('')
      setStatusMessage('')
      await sendPasswordResetEmail(normalizedEmail)
      resendCooldown.startCooldown()
      setStatusMessage('We sent another reset email.')
    } catch (caughtError) {
      if (caughtError instanceof Error && typeof (caughtError as Error & { retryAfterMs?: number }).retryAfterMs === 'number') {
        resendCooldown.startCooldown((caughtError as Error & { retryAfterMs: number }).retryAfterMs)
      }
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send reset email. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  if (isSent) {
    const resendLabel = resendCooldown.isCoolingDown
      ? `Resend in ${formatCooldownDuration(resendCooldown.remainingMs)}`
      : 'Resend reset email'

    return (
      <main className="gala-page-background min-h-screen min-h-[100dvh] px-4 py-6 text-[var(--text)] sm:px-6 sm:py-8">
        <section className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] items-center justify-center">
          <div className="w-full px-6 py-8 text-center sm:px-8 sm:py-10">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
              <AppIcon name="email" className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <h1 className="mt-5 text-[1.65rem] font-extrabold leading-[1.02] tracking-[-0.05em] text-[var(--text-main)] sm:text-[1.9rem]">
              Check your email
            </h1>
            <p className="mx-auto mt-3 max-w-[280px] text-[14px] leading-6 text-[var(--muted)]">
              If an account exists with that email, we sent password reset instructions.
            </p>
            {statusMessage ? (
              <p className="mx-auto mt-4 max-w-[280px] rounded-[12px] border border-[rgba(var(--accent-rgb),0.18)] bg-[var(--primary-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--accent-deep)] shadow-sm">
                {statusMessage}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => void handleResendResetEmail()}
                disabled={resendCooldown.isCoolingDown || isResending}
                className="app-button app-button-secondary app-button-md w-[240px] max-w-full disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isResending ? 'Sending...' : resendLabel}
              </button>
              <button
                type="button"
                onClick={() => navigateToPath('/login')}
                className="app-button app-button-primary app-button-md w-[240px] max-w-full"
              >
                Back to login
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
      <main className="gala-page-background relative flex min-h-screen min-h-[100dvh] items-center justify-center overflow-x-hidden px-4 py-6 text-[var(--text)] sm:px-6 sm:py-8">
        <FormContainer className="relative z-[2]">
        <section className="mx-auto flex w-full max-w-[360px] items-center justify-center md:max-w-[420px] lg:max-w-[440px]">
          <div className="w-full">
            <div className="pb-3 pt-1 text-center">
              <div className="mx-auto max-w-[280px] px-2">
                <h1 className="inline-flex flex-wrap items-center justify-center gap-2 text-[1.6rem] font-bold leading-[0.96] tracking-[-0.05em] text-[var(--text-main)] sm:text-[1.85rem]">
                  <AppIcon name="lock" className="h-6 w-6 text-[var(--accent-deep)]" />
                  Forgot password?
                </h1>
                <p className="mx-auto mt-3 max-w-[260px] text-[13px] leading-6 text-[var(--muted)] sm:text-[14px] sm:leading-7">
                  No worries. Enter your email and we will send you a reset link.
                </p>
              </div>

              <div className="mt-6">
                <form className="mt-3 grid gap-3 text-left" onSubmit={handleSubmit}>
                  <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-medium text-[var(--text)]">
                      <AppIcon name="email" className="h-3.5 w-3.5 text-[var(--accent-deep)]" />
                      Email
                    </span>
                    <span className="flex h-[2.85rem] items-center rounded-[1.2rem] border border-[var(--line)] bg-[var(--panel)] px-3.5 shadow-sm transition">
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        autoComplete="email"
                        placeholder="Enter your email"
                        className="h-full w-full bg-transparent text-[14px] font-medium text-[var(--text)] outline-none focus-visible:!shadow-none placeholder:font-normal placeholder:text-[var(--text-disabled)]"
                      />
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmitDisabled}
                    className="w-full inline-flex h-[2.75rem] items-center justify-center gap-2 rounded-[0.875rem] bg-[var(--accent)] px-5 text-[14px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? 'Sending...' : 'Send reset link'}
                  </button>
                </form>
              </div>

              {error ? <p className="mt-3 rounded-[0.875rem] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13px] text-[var(--danger)] shadow-sm">{error}</p> : null}

              <p className="mt-4 text-center text-[12px] leading-6 text-[var(--muted)]">
                Need another reset link? We allow one resend every 2 minutes to keep things secure.
              </p>

              <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => navigateToPath('/login')}
                  className="min-h-10 font-semibold text-[var(--accent-deep)] underline underline-offset-2 transition hover:text-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
                >
                  Log in
                </button>
              </p>
            </div>
          </div>
        </section>
      </FormContainer>
    </main>
  )
}

export default ForgotPasswordPage
