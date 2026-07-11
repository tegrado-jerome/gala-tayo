import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../../components/AppHeader'
import { PageContainer, PageShell, StateContainer } from '../../components/layout/ResponsiveLayouts'
import { supabase } from '../../supabase'
import { refreshAdminMfaSession } from '../../utils/adminMfa'
import { navigateToPath } from '../../utils/navigation'
import { signOut } from '../../services/authApi'
import { ADMIN_BASE_PATH } from '../../utils/adminRoutes'

type EnrollmentState = {
  factorId: string
  qrCode: string
  secret: string
  uri: string
}

function normalizeCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6)
}

function AdminMfaSetupPage({ session }: { session: Session }) {
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const manualSecret = useMemo(() => enrollment?.secret ?? '', [enrollment?.secret])

  useEffect(() => {
    let isMounted = true

    const startEnrollment = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `GalaTayo Admin ${session.user.email ?? session.user.id}`,
        })

        if (error) {
          throw error
        }

        if (!isMounted || !data?.id || !data.totp) {
          return
        }

        setEnrollment({
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
          uri: data.totp.uri,
        })
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not start authenticator setup.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void startEnrollment()

    return () => {
      isMounted = false
    }
  }, [session.user.email, session.user.id])

  const handleVerify = async () => {
    if (!enrollment) {
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')
      setSuccessMessage('')

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollment.factorId,
      })

      if (challengeError) {
        throw challengeError
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challengeData.id,
        code,
      })

      if (verifyError) {
        throw verifyError
      }

      await refreshAdminMfaSession()
      setSuccessMessage('Verification successful. Redirecting to admin tools...')
      window.setTimeout(() => navigateToPath(ADMIN_BASE_PATH), 500)
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
          {isLoading ? (
            <StateContainer>
              <p className="text-sm text-[var(--muted)]">Preparing your admin MFA enrollment...</p>
            </StateContainer>
          ) : null}
          <section className="admin-card p-5 sm:p-6">
            <p className="admin-eyebrow">Admin Security</p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">Set up your authenticator</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Scan the QR code with your authenticator app, or enter the manual secret, then type the 6-digit code to finish setup.
            </p>

            <div className="mt-6 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Scan QR code</p>
                <div
                  className="mt-3 flex min-h-[192px] items-center justify-center rounded-2xl border border-dashed border-[var(--line)] bg-slate-50 p-3"
                  dangerouslySetInnerHTML={{ __html: enrollment?.qrCode ?? '' }}
                />
              </div>

              <div className="grid gap-4">
                <div className="rounded-2xl border border-[var(--line)] bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Manual secret</p>
                  <p className="mt-3 break-all rounded-xl border border-[var(--line)] bg-white px-3 py-3 font-mono text-sm font-bold text-slate-900">
                    {manualSecret || 'Secret unavailable'}
                  </p>
                </div>

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
                    {isSubmitting ? 'Verifying...' : 'Verify authenticator'}
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
            </div>
          </section>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default AdminMfaSetupPage
