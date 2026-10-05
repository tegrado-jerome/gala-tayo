import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import { Button, Panel, Skeleton } from '../../components/ui'
import { supabase } from '../../supabase'
import { refreshAdminMfaSession } from '../../utils/adminMfa'
import { navigateToPath } from '../../utils/navigation'
import { signOut } from '../../services/authApi'
import { ADMIN_BASE_PATH } from '../../utils/adminRoutes'
import './admin.css'

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
    <main className="ga-center">
      {isLoading ? (
        <div className="grid w-full max-w-3xl gap-3" aria-busy="true">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <Panel as="section" className="w-full max-w-3xl">
          <p className="g-eyebrow flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Admin security
          </p>
          <h1 className="g-h1 mt-2">Set up your authenticator</h1>
          <p className="g-sm g-mut mt-2">
            Scan the QR code with your authenticator app, or enter the manual secret, then type the 6-digit code to finish setup.
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              <p className="g-eyebrow">Scan QR code</p>
              <div className="ga-qr mt-2" dangerouslySetInnerHTML={{ __html: enrollment?.qrCode ?? '' }} />
            </div>

            <div className="grid content-start gap-4">
              <div className="ga-box">
                <p className="g-eyebrow">Manual secret</p>
                <p className="ga-mono mt-2">{manualSecret || 'Secret unavailable'}</p>
              </div>

              <label className="g-field">
                <span className="g-label">Enter 6-digit code</span>
                <input
                  value={code}
                  onChange={(event) => setCode(normalizeCode(event.target.value))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="g-input ga-code"
                />
              </label>

              {errorMessage ? <p role="alert" className="ga-msg is-bad">Invalid or expired code. {errorMessage}</p> : null}
              {successMessage ? <p role="status" className="ga-msg is-ok">{successMessage}</p> : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => void handleVerify()} disabled={code.length !== 6 || isSubmitting}>
                  {isSubmitting ? 'Verifying...' : 'Verify authenticator'}
                </Button>
                <Button variant="line" onClick={() => void handleCancel()} disabled={isSubmitting}>
                  Cancel / logout
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      )}
    </main>
  )
}

export default AdminMfaSetupPage
