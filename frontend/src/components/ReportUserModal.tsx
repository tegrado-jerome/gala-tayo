import { useEffect, useState } from 'react'
import { AppIcon } from './AppIcon'
import { reportUser, type SubmitUserReportPayload, type UserReportReason } from '../utils/userReportsApi'
import { useGuestAuthPrompt } from './GuestAuthPrompt'
import { BottomSheet } from './layout/Primitives'

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
      <BottomSheet
        isOpen={isOpen}
        onClose={closeIfIdle}
        sheetClassName="max-w-[380px] rounded-[24px] border border-[#E5E7EB] bg-[#FFFFFF] p-4 shadow-[0_24px_70px_rgba(15,23,42,0.16)] sm:p-4.5"
        ariaLabel="Report user"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-user-title"
        >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            <AppIcon name="reports" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 id="report-user-title" className="text-[17px] font-black text-[var(--text-main)]">
              Report user
            </h3>
            <p className="mt-0.5 text-[12px] font-medium leading-5 text-[var(--muted)]">
              Your report is private and reviewed by admins.
            </p>
            <p className="mt-1.5 text-[12px] font-black text-[var(--accent)]">{reportingLabel}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-1.5">
          {userReportReasons.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setReason(option.value)
                setErrorMessage('')
              }}
              disabled={isSubmitting}
              className={`min-h-10 rounded-[16px] border px-3.5 py-2.5 text-left text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                reason === option.value
                  ? 'border-[#1E3A8A] bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'border-[#E5E7EB] bg-[#FFFFFF] text-[var(--text-main)] hover:border-[#CBD5E1]'
              }`}
              aria-pressed={reason === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="mt-4 block">
          <span className="text-[12px] font-black text-[var(--text-main)]">Details</span>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value.slice(0, 500))}
            disabled={isSubmitting}
            maxLength={500}
            rows={3}
            placeholder="Add details to help us review this report."
            className="mt-1.5 w-full resize-none rounded-[16px] border border-[#E5E7EB] bg-[#FFFFFF] px-3.5 py-3 text-[13px] font-medium leading-5 text-[var(--text-main)] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#DBEAFE] disabled:cursor-not-allowed disabled:opacity-70"
          />
          <span className="mt-1 block text-right text-[11px] font-bold text-[var(--muted)]">{details.length}/500</span>
        </label>

        <div className="mt-2 min-h-5">
          {errorMessage ? <p className="text-[12px] font-bold text-red-600">{errorMessage}</p> : null}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={closeIfIdle}
            disabled={isSubmitting}
            className="inline-flex min-h-10 flex-1 sm:flex-none items-center justify-center rounded-full border border-[#E5E7EB] bg-[#FFFFFF] px-4 text-[13px] font-black text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !reason}
            className="inline-flex min-h-10 flex-1 sm:flex-none items-center justify-center rounded-full border border-[#1E3A8A] bg-[#1E3A8A] px-4 text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
        </div>
      </BottomSheet>
      {guestAuth.promptElement}
    </>
  )
}

export default ReportUserModal
