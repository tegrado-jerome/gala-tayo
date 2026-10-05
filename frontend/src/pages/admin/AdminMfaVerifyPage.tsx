import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button, Panel } from '../../components/ui'
import { supabase } from '../../supabase'
import { refreshAdminMfaSession } from '../../utils/adminMfa'
import { navigateToPath } from '../../utils/navigation'
import { signOut } from '../../services/authApi'
import { ADMIN_BASE_PATH } from '../../utils/adminRoutes'
import './admin.css'

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
      <Panel as="section" className="w-full max-w-md">
        <p className="g-eyebrow flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Admin security
        </p>
        <h1 className="g-h1 mt-2">Verify your authenticator</h1>
        <p className="g-sm g-mut mt-2">
          Enter the latest 6-digit code from your authenticator app to continue to the admin dashboard.
        </p>

        <div className="mt-6 grid gap-4">
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
              {isSubmitting ? 'Verifying...' : 'Verify and continue'}
            </Button>
            <Button variant="line" onClick={() => void handleCancel()} disabled={isSubmitting}>
              Cancel / logout
            </Button>
          </div>
        </div>
      </Panel>
    </main>
  )
}

export default AdminMfaVerifyPage
