import { useState } from 'react'
import type { FormEvent } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import MinimalBackNav from '../components/MinimalBackNav'
import { PageContainer, PageShell, CardSurface, Stack } from '../components/layout/ResponsiveLayouts'
import { useSystemMessage } from '../context/SystemMessageContext'
import { updateAccountPassword } from '../services/authApi'

function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [securityError, setSecurityError] = useState('')
  const { showSystemMessage } = useSystemMessage()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (newPassword.length < 8) {
      setSecurityError('Use a stronger password with at least 8 characters.')
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
            <MinimalBackNav to="/settings" label="Back to settings" />
            <CardSurface pad="loose">
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
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      className="gala-field px-4"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-black text-slate-900">Confirm New Password</span>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      minLength={8}
                      autoComplete="new-password"
                      className="gala-field px-4"
                    />
                  </label>
                </Stack>

                {securityError ? <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{securityError}</p> : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-500">Minimum 8 characters.</p>
                  <button
                    type="submit"
                    disabled={isSavingPassword || !newPassword || !confirmNewPassword}
                    className="app-button app-button-primary app-button-md"
                  >
                    {isSavingPassword ? 'Updating password...' : 'Save New Password'}
                  </button>
                </div>
              </form>
            </CardSurface>
          </Stack>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default ChangePasswordPage
