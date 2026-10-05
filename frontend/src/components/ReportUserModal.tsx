import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { reportUser, type SubmitUserReportPayload, type UserReportReason } from '../utils/userReportsApi'
import { useGuestAuthPrompt } from './GuestAuthPrompt'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { Button, Sheet } from './ui'
import '../design/me.css'

const userReportReasons: Array<{ label: string; value: UserReportReason }> = [
  { label: 'Fake account', value: 'fake_account' },
  { label: 'Harassment or bullying', value: 'harassment' },
  { label: 'Inappropriate profile', value: 'inappropriate_profile' },
  { label: 'Spam', value: 'spam' },
  { label: 'Impersonation', value: 'impersonation' },
  { label: 'Other', value: 'other' },
]

type ReportUserModalProps = {
  isOpen: boolean
  userId: string | null
  username?: string | null
  displayName?: string | null
  authToken?: string | null
  onClose: () => void
  onSubmitted?: (payload: { reportedUserId: string; alreadyReported: boolean; message: string }) => void
}

function ReportUserModal({
  isOpen,
  userId,
  username,
  displayName,
  authToken,
  onClose,
  onSubmitted,
}: ReportUserModalProps) {
  const [reason, setReason] = useState<UserReportReason | ''>('')
  const [details, setDetails] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const guestAuth = useGuestAuthPrompt()

  useEffect(() => {
    if (!isOpen) {
      setReason('')
      setDetails('')
      setErrorMessage('')
      setIsSubmitting(false)
    }
  }, [isOpen])

  if (!isOpen || !userId) {
    return null
  }

  const reportingLabel = username?.trim()
    ? `Reporting @${username.trim()}`
    : displayName?.trim()
      ? `Reporting ${displayName.trim()}`
      : 'Reporting this user'

  const closeIfIdle = () => {
    if (!isSubmitting) {
      onClose()
    }
  }

  const handleSubmit = async () => {
    if (!authToken) {
      guestAuth.open('report-user')
      return
    }

    if (!reason) {
      setErrorMessage('Please choose a reason.')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const payload: SubmitUserReportPayload = {
        reason,
        details,
      }
      const result = await reportUser(userId, authToken, payload)
      onSubmitted?.({
        reportedUserId: userId,
        alreadyReported: result.alreadyReported,
        message: result.message,
      })
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not submit user report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {createPortal(
        <Sheet open={isOpen} onClose={closeIfIdle} title="Report user" labelledBy="report-user-title">
          <div className="-mt-1 flex items-center gap-3 rounded-[var(--r-3)] bg-[var(--fill)] p-3">
            <span className="me-ic is-bad" aria-hidden="true">
              <Flag weight="duotone" />
            </span>
            <div className="min-w-0">
              <p className="g-sm truncate font-semibold">{reportingLabel}</p>
              <p className="g-xs g-mut">Private, and only admins see it.</p>
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="g-label">Why are you reporting this user?</legend>
            <div role="radiogroup" aria-label="Reason" className="mt-2">
              {userReportReasons.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={reason === option.value}
                  className="me-choice"
                  disabled={isSubmitting}
                  onClick={() => {
                    setReason(option.value)
                    setErrorMessage('')
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="g-field mt-4">
            <label htmlFor="report-user-details">Details <span className="g-fnt font-normal">Optional</span></label>
            <textarea
              id="report-user-details"
              className="g-input"
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, 500))}
              disabled={isSubmitting}
              maxLength={500}
              rows={3}
              placeholder="Add details to help us review this report."
            />
            <span className="g-hint text-right">{details.length}/500</span>
          </div>

          {errorMessage ? (
            <p className="g-hint is-error mt-2" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="line" block onClick={closeIfIdle} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="tara" block onClick={() => void handleSubmit()} disabled={isSubmitting || !reason}>
              {isSubmitting ? 'Submitting…' : 'Submit report'}
            </Button>
          </div>
        </Sheet>,
        document.body,
      )}
      {guestAuth.promptElement}
    </>
  )
}

export default ReportUserModal
