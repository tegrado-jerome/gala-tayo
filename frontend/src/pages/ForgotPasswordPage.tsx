import { useMemo, useState, type FormEvent } from 'react'
import { EnvelopeSimple as Mail } from '@phosphor-icons/react/dist/csr/EnvelopeSimple'
import { AuthCard, AuthNotice, InlineLink } from '../components/auth/AuthCard'
import { Button } from '../components/ui'
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
      <AuthCard
        bar="Reset password"
        icon={<Mail weight="light" />}
        title="Check your email"
        sub="If an account exists with that email, we sent password reset instructions."
      >
        {statusMessage ? <AuthNotice>{statusMessage}</AuthNotice> : null}
        {error ? <AuthNotice tone="bad">{error}</AuthNotice> : null}
        <div className="grid gap-3">
          <Button variant="tara" size="lg" block onClick={() => navigateToPath('/login')}>
            Back to login
          </Button>
          <Button variant="line" block onClick={() => void handleResendResetEmail()} disabled={resendCooldown.isCoolingDown || isResending}>
            {isResending ? 'Sending...' : resendLabel}
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard bar="Reset password" onBack={() => navigateToPath('/login')} backLabel="Back to login" title="Forgot your password?" sub="No problem! Enter your email and we'll send you a reset link.">
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="g-field">
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            placeholder="you@email.com"
            aria-invalid={Boolean(error) || undefined}
            aria-describedby="forgot-email-hint"
            className="g-input h-14 text-[16px]"
          />
          <span id="forgot-email-hint" className="g-hint">
            One resend every 2 minutes, to keep things secure.
          </span>
        </div>

        {error ? <AuthNotice tone="bad">{error}</AuthNotice> : null}

        <Button type="submit" variant="tara" size="lg" block disabled={isSubmitDisabled}>
          {isSubmitting ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>

      <p className="g-sm g-mut text-center">
        Remember your password? <InlineLink onClick={() => navigateToPath('/login')}>Log in</InlineLink>
      </p>
    </AuthCard>
  )
}

export default ForgotPasswordPage
