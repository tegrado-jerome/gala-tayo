import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppIcon } from '../components/AppIcon'
import PasswordStrengthBar from '../components/auth/PasswordStrengthBar'
import { FormContainer } from '../components/layout/ResponsiveLayouts'
import { FormSkeleton } from '../components/loading/SkeletonStates'
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
      <main className="gala-page-background relative flex min-h-screen min-h-[100dvh] items-center justify-center overflow-x-hidden px-4 py-6 text-[var(--text)] sm:px-6 sm:py-8">
        <FormContainer className="relative z-[2]">
          <FormSkeleton rows={3} className="mx-auto max-w-[440px]" />
        </FormContainer>
      </main>
    )
  }

  if (!hasSession) {
    return (
      <main className="gala-page-background relative flex min-h-screen min-h-[100dvh] items-center justify-center overflow-x-hidden px-4 py-6 text-[var(--text)] sm:px-6 sm:py-8">
        <FormContainer className="relative z-[2]">
          <section className="mx-auto flex w-full max-w-[360px] items-center justify-center md:max-w-[420px] lg:max-w-[440px]">
            <div className="w-full text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[1.2rem] border border-[var(--line)] bg-white shadow-sm">
                <AppIcon name="warning" className="h-5 w-5 text-[var(--warning)]" />
              </div>
              <div className="mt-5">
                <h1 className="text-[1.6rem] font-semibold leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-[1.85rem]">Invalid or expired link</h1>
                <p className="mx-auto mt-3 max-w-[280px] text-[13px] leading-6 text-slate-500 sm:text-[14px] sm:leading-7">
                  This password reset link is no longer valid. Please request a new one.
                </p>
                <button
                  type="button"
                  onClick={() => navigateToPath('/forgot-password')}
                  className="mt-6 inline-flex min-h-[2.75rem] items-center justify-center rounded-[0.875rem] bg-[var(--accent)] px-6 text-[14px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)]"
                >
                  Request new link
                </button>
              </div>
            </div>
          </section>
        </FormContainer>
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
                  Reset your password
                </h1>
                <p className="mx-auto mt-3 max-w-[260px] text-[13px] leading-6 text-[var(--muted)] sm:text-[14px] sm:leading-7">
                  Enter a new password for your account.
                </p>
              </div>

              <div className="mt-6">
                <form className="mt-3 grid gap-3 text-left" onSubmit={handleSubmit}>
                  <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-medium text-[var(--text)]">
                      <AppIcon name="lock" className="h-3.5 w-3.5 text-[var(--accent-deep)]" />
                      New Password
                    </span>
                    <span className="flex h-[2.85rem] items-center gap-3 rounded-[1.2rem] border border-[var(--line)] bg-white px-3.5 shadow-sm transition focus-within:border-[var(--accent)] focus-within:bg-white">
                      <input
                        type={isPasswordVisible ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        required
                        minLength={minPasswordLength}
                        autoComplete="new-password"
                        placeholder="Enter new password"
                        className="auth-form-input h-full w-full min-w-0 bg-transparent text-[14px] font-medium text-[var(--text)] outline-none placeholder:font-normal placeholder:text-slate-400"
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
                    <PasswordStrengthBar password={newPassword} />
                  </label>

                  <label className="grid gap-2 text-[13px] font-medium text-[var(--text)]">
                    <span className="inline-flex items-center gap-1.5 pl-1 text-[13px] font-medium text-[var(--text)]">
                      <AppIcon name="lock" className="h-3.5 w-3.5 text-[var(--accent-deep)]" />
                      Confirm New Password
                    </span>
                    <span className={`flex h-[2.85rem] items-center gap-3 rounded-[1.2rem] border px-3.5 shadow-sm transition ${confirmPasswordHasMismatch ? 'border-red-300 bg-white focus-within:border-red-400' : 'border-[var(--line)] bg-white focus-within:border-[var(--accent)] focus-within:bg-white'}`}>
                      <input
                        type={isConfirmPasswordVisible ? 'text' : 'password'}
                        value={confirmNewPassword}
                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                        required
                        minLength={minPasswordLength}
                        autoComplete="new-password"
                        placeholder="Confirm new password"
                        className="auth-form-input h-full w-full min-w-0 bg-transparent text-[14px] font-medium text-[var(--text)] outline-none placeholder:font-normal placeholder:text-slate-400"
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
                    ) : confirmNewPassword.length > 0 && confirmPasswordMatches ? (
                      <span className="text-xs text-[var(--accent-deep)]">
                        Passwords match.
                      </span>
                    ) : null}
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmitDisabled}
                    className="w-full inline-flex h-[2.75rem] items-center justify-center gap-2 rounded-[0.875rem] bg-[var(--accent)] px-5 text-[14px] font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSubmitting ? 'Resetting password...' : 'Reset password'}
                  </button>
                </form>
              </div>

              {error ? <p className="mt-3 rounded-[0.875rem] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 shadow-sm">{error}</p> : null}
            </div>
          </div>
        </section>
      </FormContainer>
    </main>
  )
}

export default ResetPasswordPage
