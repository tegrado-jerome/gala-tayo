import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CheckCircle as CircleCheck } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck'
import { SignOut as LogOut } from '@phosphor-icons/react/dist/csr/SignOut'
import { sendMfaEmailCode, verifyMfaEmailCode } from '../utils/userMfa'
import { setDeviceToken } from '../utils/mfaDevice'
import { navigateToPath } from '../utils/navigation'
import { getRequestedNextPath, signOut } from '../services/authApi'
import { AuthCard, AuthNotice } from './auth/AuthCard'
import { Button, buttonClass } from './ui'

const OTP_LENGTH = 6

type MfaVerificationProps = {
  session: Session
  nextPath?: string
  onSuccess?: () => void
}

function MfaVerification({ session, nextPath: nextPathProp, onSuccess }: MfaVerificationProps) {
  const [maskedEmail, setMaskedEmail] = useState('')
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [isSendingCode, setIsSendingCode] = useState(true)
  const [isVerifying, setIsVerifying] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [trustDevice, setTrustDevice] = useState(true)
  const [devOtp, setDevOtp] = useState('')
  const hasAutoSentRef = useRef(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const verifyButtonRef = useRef<HTMLButtonElement | null>(null)

  const nextPath = useMemo(() => {
    if (nextPathProp) return nextPathProp
    return getRequestedNextPath() ?? '/home'
  }, [nextPathProp])

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
    } else if (event.key === 'Enter' && codeComplete && !isVerifying) {
      verifyButtonRef.current?.click()
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
      setTimeout(() => {
        onSuccess?.()
        navigateToPath(nextPath)
      }, 1000)
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
    <AuthCard
      bar="Two-step check"
      icon={<ShieldCheck weight="duotone" />}
      title="Enter your code"
      sub={
        <>
          We sent a 6-digit code to <b style={{ color: 'var(--ink)' }}>{maskedEmail || 'your email'}</b>.
        </>
      }
    >
      {devOtp && import.meta.env.DEV ? (
        <AuthNotice tone="warn">
          Dev mode OTP: <span className="font-semibold tracking-[0.3em]">{devOtp}</span>
        </AuthNotice>
      ) : null}

      <div className="m-otp" role="group" aria-label="6-digit code">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            aria-label={`Digit ${index + 1}`}
            aria-invalid={Boolean(errorMessage) || undefined}
            onChange={(event) => handleDigitChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={index === 0 ? handlePaste : undefined}
            className={digit ? 'is-f' : undefined}
          />
        ))}
      </div>

      {errorMessage ? <AuthNotice tone="bad">{errorMessage}</AuthNotice> : null}

      {successMessage && !errorMessage ? (
        <p className="g-sm flex items-center gap-2 font-semibold" role="status" style={{ color: 'var(--ok)' }}>
          <CircleCheck className="g-ic" aria-hidden="true" />
          {successMessage}
        </p>
      ) : null}

      <button ref={verifyButtonRef} type="button" className={buttonClass({ variant: 'tara', size: 'lg', block: true })} onClick={() => void handleVerify()} disabled={!codeComplete || isVerifying}>
        {isVerifying ? 'Verifying...' : 'Verify'}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <label className="g-sm inline-flex min-h-11 cursor-pointer items-center gap-2" style={{ color: 'var(--ink-2)' }}>
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
            className="h-[18px] w-[18px]"
            style={{ accentColor: 'var(--ink)' }}
          />
          Remember this device
        </label>
        <Button variant="text" size="sm" onClick={() => void handleSendCode()} disabled={isSendingCode || cooldownSeconds > 0}>
          {resendText}
        </Button>
      </div>

      <hr className="g-sep" />

      <Button variant="text" size="sm" className="mx-auto" onClick={() => void handleCancel()} disabled={isVerifying}>
        <LogOut aria-hidden="true" />
        Cancel and log out
      </Button>
    </AuthCard>
  )
}

export default MfaVerification
