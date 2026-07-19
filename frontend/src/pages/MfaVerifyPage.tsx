import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AppHeader from '../components/AppHeader'
import { PageContainer, PageShell } from '../components/layout/ResponsiveLayouts'
import { sendMfaEmailCode, verifyMfaEmailCode } from '../utils/userMfa'
import { navigateToPath } from '../utils/navigation'
import { signOut } from '../services/authApi'
import { FormSkeleton } from '../components/loading/SkeletonStates'

function normalizeCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6)
}

function MfaVerifyPage({ session }: { session: Session }) {
  const [maskedEmail, setMaskedEmail] = useState('')
  const [code, setCode] = useState('')
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isInitialSend, setIsInitialSend] = useState(true)

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next')
    return next && next.startsWith('/') ? next : '/home'
  }, [])
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCooldown = useCallback(() => {
    setCooldownSeconds(30)
    cooldownTimerRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current)
            cooldownTimerRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isInitialSend) {
      return
    }

    setIsInitialSend(false)

    const sendCode = async () => {
      try {
        setIsSendingCode(true)
        setErrorMessage('')
        const result = await sendMfaEmailCode(session)
        setMaskedEmail(result.maskedEmail)
        startCooldown()
      } catch (error) {
        if (error instanceof Error && 'retryAfterMs' in error && typeof (error as Error & { retryAfterMs?: number }).retryAfterMs === 'number') {
          setCooldownSeconds(Math.ceil(((error as Error & { retryAfterMs: number }).retryAfterMs) / 1000))
          setErrorMessage(error.message)
        } else {
          setErrorMessage(error instanceof Error ? error.message : 'Could not send verification code.')
        }
      } finally {
        setIsSendingCode(false)
      }
    }

    void sendCode()
  }, [isInitialSend, session, startCooldown])

  const handleSendCode = async () => {
    if (isSendingCode || cooldownSeconds > 0) {
      return
    }

    try {
      setIsSendingCode(true)
      setErrorMessage('')
      setSuccessMessage('')
      const result = await sendMfaEmailCode(session)
      setMaskedEmail(result.maskedEmail)
      setSuccessMessage('New code sent.')
      startCooldown()
    } catch (error) {
      if (error instanceof Error && 'retryAfterMs' in error && typeof (error as Error & { retryAfterMs?: number }).retryAfterMs === 'number') {
        setCooldownSeconds(Math.ceil(((error as Error & { retryAfterMs: number }).retryAfterMs) / 1000))
      }
      setErrorMessage(error instanceof Error ? error.message : 'Could not send verification code.')
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleVerify = async () => {
    if (code.length !== 6 || isVerifying) {
      return
    }

    try {
      setIsVerifying(true)
      setErrorMessage('')
      setSuccessMessage('')
      await verifyMfaEmailCode(session, code)
      setSuccessMessage('Verification successful.')
      window.setTimeout(() => {
        window.location.href = nextPath
      }, 500)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Invalid or expired code.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleCancel = async () => {
    await signOut().catch(() => undefined)
    navigateToPath('/login')
  }

  const codeLengthOk = code.length === 6

  useEffect(() => {
    if (codeLengthOk && !isVerifying) {
      void handleVerify()
    }
  }, [codeLengthOk])

  return (
    <PageShell>
      <AppHeader />
      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-10">
        <PageContainer size="narrow">
          {isSendingCode && !maskedEmail ? (
            <FormSkeleton rows={3} />
          ) : (
            <section className="admin-card p-5 sm:p-6">
              <h1 className="text-2xl font-black text-slate-950">Enter verification code</h1>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                We sent a 6-digit code to <span className="font-bold text-slate-800">{maskedEmail || 'your email'}</span>.
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
                    {errorMessage}
                  </p>
                ) : null}

                {successMessage && !errorMessage ? (
                  <p className="rounded-xl border border-[rgba(var(--accent-rgb),0.18)] bg-[var(--primary-soft)] px-4 py-3 text-sm font-semibold text-[var(--accent-deep)]">
                    {successMessage}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void handleVerify()}
                    disabled={!codeLengthOk || isVerifying}
                    className="app-button app-button-primary app-button-md"
                  >
                    {isVerifying ? 'Verifying...' : 'Verify and continue'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendCode()}
                    disabled={isSendingCode || cooldownSeconds > 0}
                    className="app-button app-button-secondary app-button-md"
                  >
                    {isSendingCode
                      ? 'Sending...'
                      : cooldownSeconds > 0
                        ? `Resend code (${cooldownSeconds}s)`
                        : 'Resend code'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={isVerifying}
                  className="text-sm font-semibold text-slate-500 underline hover:text-slate-700"
                >
                  Cancel / sign out
                </button>
              </div>
            </section>
          )}
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default MfaVerifyPage
