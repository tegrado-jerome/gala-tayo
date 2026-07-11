import { useState } from 'react'
import AppHeader from '../../components/AppHeader'
import { PageContainer, PageShell } from '../../components/layout/ResponsiveLayouts'
import { supabase } from '../../supabase'
import { refreshAdminMfaSession } from '../../utils/adminMfa'
import { navigateToPath } from '../../utils/navigation'
import { signOut } from '../../services/authApi'

function normalizeCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6)
}

function AdminMfaVerifyPage({ factorId }: { factorId: string | null }) {
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleVerify = async () => {
    if (!factorId) {
      setErrorMessage('No verified authenticator is available for this admin account.')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')
      setSuccessMessage('')

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      })

      if (error) {
        throw error
      }

      await refreshAdminMfaSession()
      setSuccessMessage('Verification successful. Redirecting to admin tools...')
      window.setTimeout(() => navigateToPath('/admin'), 500)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Invalid or expired code.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = async () => {
    await signOut().catch(() => undefined)
    navigateToPath('/login')
  }

  return (
    <PageShell>
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="narrow">
          <section className="admin-card p-5 sm:p-6">
            <p className="admin-eyebrow">Admin Security</p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">Verify your authenticator</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Enter the latest 6-digit code from your authenticator app to continue to the admin dashboard.
            </p>

            <div className="mt-6 grid gap-4">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Enter 6-digit code</span>
                <input
                  value={code}
                  onChange={(event) => setCode(normalizeCode(event.target.value))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="mt-2 h-12 w-full rounded-2xl border border-[var(--line)] bg-white px-4 text-lg font-black tracking-[0.35em] text-slate-900 outline-none focus:border-[var(--accent)]"
                />
              </label>

              {errorMessage ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  Invalid or expired code. {errorMessage}
                </p>
              ) : null}

              {successMessage ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {successMessage}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={code.length !== 6 || isSubmitting}
                  className="app-button app-button-primary app-button-md"
                >
                  {isSubmitting ? 'Verifying...' : 'Verify and continue'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={isSubmitting}
                  className="app-button app-button-secondary app-button-md"
                >
                  Cancel / logout
                </button>
              </div>
            </div>
          </section>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AdminMfaVerifyPage
