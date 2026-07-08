import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from './AppIcon'
import { useSystemMessage } from '../context/SystemMessageContext'
import { supabase } from '../supabase'
import { CenteredModal } from './layout/Primitives'

type FeedbackModalProps = {
  isOpen: boolean
  onClose: () => void
}

const COMMENT_MAX_LENGTH = 500
const DAILY_LIMIT_MESSAGE = 'Daily feedback limit reached. Please try again tomorrow.'

function StarIcon({ filled }: { filled: boolean }) {
  return <AppIcon name="reviews" className="h-7 w-7" fill={filled ? 'currentColor' : 'none'} strokeWidth={1.8} />
}

function getApiEndpoint(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl}${path}` : `/api${path}`
}

function parseJsonResponse(text: string): { message?: string } {
  if (!text.trim()) {
    return {}
  }

  try {
    return JSON.parse(text) as { message?: string }
  } catch {
    return {}
  }
}

function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLimitReached, setIsLimitReached] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { showSystemMessage } = useSystemMessage()

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      setRating(0)
      setComment('')
      setErrorMessage('')
      setIsSubmitting(false)
      setIsSubmitted(false)
      setIsLimitReached(false)
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (isSubmitted) {
      setRating(0)
      setComment('')
      setErrorMessage('')
      setIsSubmitted(false)
      return
    }

    if (isLimitReached) {
      return
    }

    if (rating < 1 || rating > 5) {
      setErrorMessage('Please choose a rating first.')
      return
    }

    const cleanComment = comment.trim()

    if (cleanComment.length > COMMENT_MAX_LENGTH) {
      setErrorMessage('Comment must be 500 characters or less.')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')

      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (!token) {
        throw new Error('Please sign in again before submitting feedback.')
      }

      const response = await fetch(getApiEndpoint('/feedback'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating,
          comment: cleanComment || null,
        }),
      })

      const responseText = await response.text()
      const result = parseJsonResponse(responseText)

      if (!response.ok) {
        if (response.status === 429) {
          setIsLimitReached(true)
          throw new Error(result.message || DAILY_LIMIT_MESSAGE)
        }

        throw new Error(result.message || 'Unable to submit feedback. Please try again.')
      }

      showSystemMessage({
        title: 'Feedback Sent!',
        description: 'Thanks for sharing how GalaTayo feels today.',
      })
      setRating(0)
      setComment('')
      setIsSubmitted(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) {
    return null
  }

  return createPortal(
    <CenteredModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      panelClassName="gala-card relative max-w-[460px] overflow-hidden"
      ariaLabel="Submit feedback"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          aria-label="Close"
        >
          <AppIcon name="clear" className="h-4 w-4" strokeWidth={2.1} />
        </button>

        <div className="px-5 pb-5 pt-6">
          <div className="pr-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Feedback</p>
            <h2 id="feedback-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              Rate GalaTayo
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Tell us how the app feels today.
            </p>
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Rating</p>
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRating(value)
                    setErrorMessage('')
                  }}
                  disabled={isSubmitting || isSubmitted || isLimitReached}
                  className={`rounded-lg border p-2 transition hover:-translate-y-[1px] ${
                    value <= rating
                      ? 'border-amber-200 bg-amber-50 text-amber-500'
                      : 'border-[var(--line)] bg-white text-slate-300 hover:text-amber-400'
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                  aria-label={`Rate ${value} out of 5`}
                >
                  <StarIcon filled={value <= rating} />
                </button>
              ))}
            </div>
          </div>

          <label className="mt-5 block">
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Comment
                <span className="optional-label">Optional</span>
              </span>
              <span className="text-xs font-medium text-[var(--muted)]">{comment.length}/{COMMENT_MAX_LENGTH}</span>
            </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
              maxLength={COMMENT_MAX_LENGTH}
              disabled={isSubmitting || isSubmitted || isLimitReached}
              placeholder="Thoughts, bugs, or ideas..."
              className="gala-field mt-2 w-full resize-none px-3 py-2.5 text-sm text-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            />
          </label>

          <div className="mt-3 min-h-5">
            {errorMessage ? <p className="text-sm font-medium text-red-600">{errorMessage}</p> : null}
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex justify-center rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent-deep)]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || isLimitReached}
              className="app-button app-button-primary app-button-md px-4"
            >
              {isSubmitting ? 'Submitting...' : isSubmitted ? 'Rate again' : 'Submit feedback'}
            </button>
          </div>
        </div>
      </div>
    </CenteredModal>,
    document.body,
  )
}

export default FeedbackModal
