import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import PasswordStrengthBar from '../components/auth/PasswordStrengthBar'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import { PageContainer, PageShell, Stack } from '../components/layout/ResponsiveLayouts'
import { useSystemMessage } from '../context/SystemMessageContext'
import { getPasswordStrength } from '../utils/passwordStrength'
import { updateAccountPassword } from '../services/authApi'

function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false)
  const [isConfirmNewPasswordVisible, setIsConfirmNewPasswordVisible] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [securityError, setSecurityError] = useState('')
  const { showSystemMessage } = useSystemMessage()
  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!passwordStrength.meetsComplexity) {
      setSecurityError('Use a stronger password with uppercase, lowercase, digit, and special character.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setSecurityError('Passwords do not match.')
      return
    }

    try {
      setIsSavingPassword(true)
      setSecurityError('')
      await updateAccountPassword(newPassword)
      setNewPassword('')
      setConfirmNewPassword('')
      setIsNewPasswordVisible(false)
      setIsConfirmNewPasswordVisible(false)
      showSystemMessage({
        title: 'Password Updated!',
        description: 'Your account password was updated successfully.',
      })
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not update password.')
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <PageShell>
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="narrow">
          <Stack gap="default">
            <MinimalBackNav to="/account-settings" label="Back to account settings" />
            <section className="px-0 py-2 sm:py-4">
              <div className="border-b border-slate-100 pb-6">
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <AppIcon name="lock" className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="gala-page-kicker">Security</p>
                    <h1 className="gala-page-title">Change Password</h1>
                    <p className="mt-2 max-w-[560px] text-sm font-semibold leading-6 text-slate-500">
                      This updates the actual sign-in password for your GalaTayo account through Supabase Auth. It is not just a profile field.
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 grid gap-6">
                <section className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 sm:px-5">
                  <p className="text-sm font-black text-slate-900">How it works</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    After saving, your next email-and-password login will use this new password. Social login users can also set one here if Supabase allows the session to update credentials.
                  </p>
                </section>

                <Stack gap="default">
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">New Password</span>
                    <span className="flex h-12 items-center gap-3 rounded-full border border-[var(--line)] bg-white px-4 shadow-[inset_0_1px_2px_rgba(27,26,23,0.03)] transition focus-within:border-[var(--primary)]">
                      <input
                        type={isNewPasswordVisible ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        minLength={8}
                        autoComplete="new-password"
                        className="auth-form-input h-full w-full min-w-0 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setIsNewPasswordVisible((current) => !current)}
                        className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.12)]"
                        aria-label={isNewPasswordVisible ? 'Hide password' : 'Show password'}
                        aria-pressed={isNewPasswordVisible}
                      >
                        <AppIcon name={isNewPasswordVisible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                      </button>
                    </span>
                    <PasswordStrengthBar password={newPassword} />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Confirm New Password</span>
                    <span className="flex h-12 items-center gap-3 rounded-full border border-[var(--line)] bg-white px-4 shadow-[inset_0_1px_2px_rgba(27,26,23,0.03)] transition focus-within:border-[var(--primary)]">
                      <input
                        type={isConfirmNewPasswordVisible ? 'text' : 'password'}
                        value={confirmNewPassword}
                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                        minLength={8}
                        autoComplete="new-password"
                        className="auth-form-input h-full w-full min-w-0 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setIsConfirmNewPasswordVisible((current) => !current)}
                        className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--bg)] hover:text-[var(--accent-deep)] focus:outline-none focus:ring-4 focus:ring-[rgba(37,99,235,0.12)]"
                        aria-label={isConfirmNewPasswordVisible ? 'Hide password' : 'Show password'}
                        aria-pressed={isConfirmNewPasswordVisible}
                      >
                        <AppIcon name={isConfirmNewPasswordVisible ? 'eyeOff' : 'eye'} className="h-4 w-4" />
                      </button>
                    </span>
                  </label>
                </Stack>

                {securityError ? <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{securityError}</p> : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-500">Must have uppercase, lowercase, digit, and special character.</p>
                  <button
                    type="submit"
                    disabled={isSavingPassword || !newPassword || !confirmNewPassword}
                    className="app-button app-button-primary app-button-md"
                  >
                    {isSavingPassword ? 'Updating password...' : 'Save New Password'}
                  </button>
                </div>
              </form>
            </section>
          </Stack>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default ChangePasswordPage
