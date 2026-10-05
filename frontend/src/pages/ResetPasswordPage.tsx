import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Warning as TriangleAlert } from '@phosphor-icons/react/dist/csr/Warning'
import { AuthCard, AuthNotice } from '../components/auth/AuthCard'
import PasswordField from '../components/auth/PasswordField'
import PasswordStrengthBar from '../components/auth/PasswordStrengthBar'
import { Button, Skeleton } from '../components/ui'
import { supabase } from '../supabase'
import { getPasswordStrength } from '../utils/passwordStrength'
import { navigateToPath } from '../utils/navigation'

const minPasswordLength = 8

function ResetPasswordPage() {
  const [hasSession, setHasSession] = useState(false)
  const [isSessionReady, setIsSessionReady] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false)
  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword])

  useEffect(() => {
    let isMounted = true

    const initializeSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!isMounted) {
        return
      }

      setHasSession(Boolean(session))
      setIsSessionReady(true)
    }

    void initializeSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return
      }

      setHasSession(Boolean(nextSession))
      setIsSessionReady(true)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const confirmPasswordMatches = confirmNewPassword.length === 0 || newPassword === confirmNewPassword
  const confirmPasswordHasMismatch = confirmNewPassword.length > 0 && newPassword !== confirmNewPassword
  const isFormValid = Boolean(newPassword.trim()) && passwordStrength.meetsComplexity && newPassword === confirmNewPassword
  const isSubmitDisabled = isSubmitting || !isFormValid

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!hasSession) {
      setError('Your reset link is invalid or expired. Please request a new one.')
      return
    }

    if (!passwordStrength.meetsComplexity) {
      setError('Use a stronger password with uppercase, lowercase, digit, and special character.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

      if (updateError) {
        throw updateError
      }

      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})

      navigateToPath('/login?reset=success')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not reset your password. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isSessionReady) {
    return (
      <AuthCard bar="Reset password" title={<Skeleton className="h-8 w-2/3" />}>
        <div className="flex flex-col gap-4" aria-busy="true">
          <span className="sr-only">Checking your reset link</span>
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-[52px] w-full" />
        </div>
      </AuthCard>
    )
  }

  if (!hasSession) {
    return (
      <AuthCard
        bar="Reset password"
        icon={<TriangleAlert weight="duotone" style={{ color: 'var(--warn)' }} />}
        title="Invalid or expired link"
        sub="This password reset link is no longer valid. Request a new one and use it right away."
      >
        <Button variant="tara" size="lg" block onClick={() => navigateToPath('/forgot-password')}>
          Request new link
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard bar="Reset password" title="Pick a new password" sub="Make it strong, then log in with it right away.">
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <PasswordField
          id="reset-password"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          visible={isPasswordVisible}
          onToggleVisible={() => setIsPasswordVisible((current) => !current)}
          required
          minLength={minPasswordLength}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Use uppercase, lowercase, a number, and a symbol."
        >
          <PasswordStrengthBar password={newPassword} />
        </PasswordField>

        <PasswordField
          id="reset-confirm-password"
          label="Confirm new password"
          value={confirmNewPassword}
          onChange={setConfirmNewPassword}
          visible={isConfirmPasswordVisible}
          onToggleVisible={() => setIsConfirmPasswordVisible((current) => !current)}
          required
          minLength={minPasswordLength}
          autoComplete="new-password"
          placeholder="Type it again"
          invalid={confirmPasswordHasMismatch}
          error={confirmPasswordHasMismatch ? 'Confirm password does not match.' : undefined}
          hint={confirmNewPassword.length > 0 && confirmPasswordMatches ? <span style={{ color: 'var(--ok)' }}>Passwords match.</span> : undefined}
        />

        {error ? <AuthNotice tone="bad">{error}</AuthNotice> : null}

        <Button type="submit" variant="tara" size="lg" block disabled={isSubmitDisabled}>
          {isSubmitting ? 'Resetting password...' : 'Reset password'}
        </Button>
      </form>
    </AuthCard>
  )
}

export default ResetPasswordPage
