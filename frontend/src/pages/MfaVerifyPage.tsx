import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogOut, CheckCircle2 } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { PageContainer, PageShell } from '../components/layout/ResponsiveLayouts'
import { sendMfaEmailCode, verifyMfaEmailCode } from '../utils/userMfa'
import { setDeviceToken } from '../utils/mfaDevice'
import { navigateToPath } from '../utils/navigation'
import { signOut } from '../services/authApi'
import { FormSkeleton } from '../components/loading/SkeletonStates'
import galaTayoLogo from '../assets/brand/galatayo-logo.svg'

const OTP_LENGTH = 6

function MfaVerifyPage({ session }: { session: Session }) {
  const [maskedEmail, setMaskedEmail] = useState('')
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [trustDevice, setTrustDevice] = useState(true)
  const [devOtp, setDevOtp] = useState('')
  const hasAutoSentRef = useRef(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next')
    return next && next.startsWith('/') ? next : '/home'
  }, [])

  const code = digits.join('')

  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCooldown = useCallback((seconds?: number) => {
    const duration = seconds ?? 30
    setCooldownSeconds(duration)

    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current)
    }

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
    if (!successMessage) return
    const timer = setTimeout(() => setSuccessMessage(''), 5000)
    return () => clearTimeout(timer)
  }, [successMessage])

  useEffect(() => {
    if (hasAutoSentRef.current) {
      return
    }
    hasAutoSentRef.current = true

    const sendCode = async () => {
      try {
        setIsSendingCode(true)
        setErrorMessage('')
        const result = await sendMfaEmailCode(session)
        setMaskedEmail(result.maskedEmail)
        if (result.devOtp) {
          setDevOtp(result.devOtp)
        }
        startCooldown()
      } catch (error) {
        if (error instanceof Error && 'retryAfterMs' in error && typeof (error as Error & { retryAfterMs?: number }).retryAfterMs === 'number') {
          const retryMs = (error as Error & { retryAfterMs: number }).retryAfterMs
          startCooldown(Math.ceil(retryMs / 1000))
          setErrorMessage(error.message)
        } else {
          setErrorMessage(error instanceof Error ? error.message : 'Could not send verification code.')
        }
      } finally {
        setIsSendingCode(false)
      }
    }

    void sendCode()
  }, [session, startCooldown])

  const focusInput = (index: number) => {
    if (index >= 0 && index < OTP_LENGTH) {
      inputRefs.current[index]?.focus()
    }
  }

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(0, 1)
    if (!digit) return

    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setErrorMessage('')
    setSuccessMessage('')

    if (index < OTP_LENGTH - 1) {
      focusInput(index + 1)
    }
  }

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits]
        newDigits[index - 1] = ''
        setDigits(newDigits)
        focusInput(index - 1)
      } else if (digits[index]) {
        const newDigits = [...digits]
        newDigits[index] = ''
        setDigits(newDigits)
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1)
    } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      focusInput(index + 1)
    }
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return

    event.preventDefault()
    const newDigits = [...digits]
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i]
    }
    setDigits(newDigits)
    setErrorMessage('')
    setSuccessMessage('')

    const nextIndex = Math.min(pasted.length, OTP_LENGTH - 1)
    focusInput(nextIndex)
  }

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
      setDigits(Array(OTP_LENGTH).fill(''))
      if (result.devOtp) {
        setDevOtp(result.devOtp)
      }
      setSuccessMessage('New code sent.')
      startCooldown()
      focusInput(0)
    } catch (error) {
      if (error instanceof Error && 'retryAfterMs' in error && typeof (error as Error & { retryAfterMs?: number }).retryAfterMs === 'number') {
        startCooldown(Math.ceil(((error as Error & { retryAfterMs: number }).retryAfterMs) / 1000))
      }
      setErrorMessage(error instanceof Error ? error.message : 'Could not send verification code.')
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleVerify = async () => {
    if (code.length !== OTP_LENGTH || isVerifying) {
      return
    }

    try {
      setIsVerifying(true)
      setErrorMessage('')
      setSuccessMessage('')
      const result = await verifyMfaEmailCode(session, code, trustDevice)
      if (result.deviceToken) {
        setDeviceToken(result.deviceToken)
      }
      setSuccessMessage('Verification successful.')
      window.setTimeout(() => {
        navigateToPath(nextPath)
      }, 200)
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

  const codeComplete = code.length === OTP_LENGTH

  const resendText = isSendingCode
    ? 'Sending...'
    : cooldownSeconds > 0
      ? `Resend in ${cooldownSeconds}s`
      : 'Resend OTP'

  return (
    <PageShell>
      <AppHeader />
      <main className="flex flex-1 w-full items-center justify-center px-4 sm:px-6">
        <PageContainer size="narrow">
          {isSendingCode && !maskedEmail ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <FormSkeleton rows={3} />
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[420px] flex-col items-center text-center">
              <img
                src={galaTayoLogo}
                alt="GalaTayo"
                className="mb-8 h-auto w-[180px] sm:w-[210px] md:w-[230px]"
                loading="eager"
              />

              <h1 className="text-[26px] font-black text-slate-950 sm:text-[30px]">Verify OTP</h1>
              <p className="mt-2 max-w-[320px] text-sm font-semibold leading-6 text-slate-500">
                Enter the 6-digit code sent to{' '}
                <span className="font-bold text-slate-800">{maskedEmail || 'your email'}</span>
              </p>

              {devOtp && import.meta.env.DEV ? (
                <p className="mt-3 w-full rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm font-bold text-yellow-800">
                  DEV MODE — OTP: <span className="tracking-[0.3em]">{devOtp}</span>
                </p>
              ) : null}

              <div className="mt-8 flex w-full items-center justify-center gap-2.5 sm:gap-3">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : undefined}
                    maxLength={1}
                    value={digit}
                    onChange={(event) => handleDigitChange(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    className="h-14 w-12 rounded-xl border border-[var(--line)] bg-white text-center text-2xl font-black text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.03)] outline-none transition focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] sm:h-16 sm:w-14 sm:text-[28px]"
                  />
                ))}
              </div>

              {errorMessage ? (
                <p className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              {successMessage && !errorMessage ? (
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--accent-deep)]">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
                  {successMessage}
                </p>
              ) : null}

              <div className="mt-5 text-sm font-semibold leading-6 text-slate-500">
                <p>Didn&#39;t receive the code?</p>
                <button
                  type="button"
                  onClick={() => void handleSendCode()}
                  disabled={isSendingCode || cooldownSeconds > 0}
                  className="font-semibold text-[var(--accent)] underline hover:text-[var(--accent-deep)] disabled:text-slate-300 disabled:no-underline"
                >
                  {resendText}
                </button>
              </div>

              <div className="mt-6 w-full">
                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={!codeComplete || isVerifying}
                  className="app-button app-button-primary app-button-md w-full"
                >
                  {isVerifying ? 'Verifying...' : 'Verify OTP'}
                </button>
              </div>

              <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(event) => setTrustDevice(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                Remember this device
              </label>

              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={isVerifying}
                className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:text-red-700"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
                Cancel
              </button>
            </div>
          )}
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default MfaVerifyPage
