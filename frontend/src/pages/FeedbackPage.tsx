import { useMemo, useState } from 'react'
import { SmileyAngry as Angry } from '@phosphor-icons/react/dist/csr/SmileyAngry'
import { SmileySad as Frown } from '@phosphor-icons/react/dist/csr/SmileySad'
import { SmileyWink as Laugh } from '@phosphor-icons/react/dist/csr/SmileyWink'
import { SmileyMeh as Meh } from '@phosphor-icons/react/dist/csr/SmileyMeh'
import { Smiley as Smile } from '@phosphor-icons/react/dist/csr/Smiley'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { Button, Page, Panel, cx } from '../components/ui'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { getApiUrl } from '../utils/apiClient'
import { getPublicSiteUrl } from '../utils/site'
import { InlineSkeleton } from '../components/loading/SkeletonStates'

const COMMENT_MAX_LENGTH = 500

const ratingOptions = [
  { value: 1, label: 'Very bad', Icon: Angry },
  { value: 2, label: 'Bad', Icon: Frown },
  { value: 3, label: 'Okay', Icon: Meh },
  { value: 4, label: 'Good', Icon: Smile },
  { value: 5, label: 'Excellent', Icon: Laugh },
]

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

function FeedbackPage() {
  const { session, isSessionLoading } = useSavedFavorites()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const remainingCount = useMemo(() => COMMENT_MAX_LENGTH - comment.length, [comment.length])

  const handleSubmit = async () => {
    if (!session?.access_token) {
      setErrorMessage('Please sign in before submitting feedback.')
      return
    }

    if (rating < 1 || rating > 5) {
      setErrorMessage('Please choose your overall experience.')
      setStatusMessage('')
      return
    }

    const cleanComment = comment.trim()

    try {
      setIsSubmitting(true)
      setErrorMessage('')
      setStatusMessage('')

      const response = await fetch(getApiUrl('/feedback'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating,
          comment: cleanComment || null,
        }),
      })

      const result = parseJsonResponse(await response.text())

      if (!response.ok) {
        throw new Error(result.message || 'Unable to submit feedback. Please try again.')
      }

      setStatusMessage('Thanks for your feedback!')
      setComment('')
      setRating(0)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Page narrow>
      <MinimalBackNav to="/home" label="Home" preferHistory={false} />
      <p className="g-eyebrow mt-2">Help and feedback</p>
      <h1 className="g-h1 mt-2">How can we help?</h1>
      <p className="g-mut mt-1 text-[15px]">Send feedback connected to your account.</p>

      {isSessionLoading ? <InlineSkeleton className="mt-6" /> : null}

      {!isSessionLoading && !session?.user ? (
        <Panel className="mt-6">
          <h2 className="g-h3">Sign in to send feedback</h2>
          <p className="g-sm g-mut mt-1">Feedback is connected to your account so we can keep submissions useful.</p>
          <GoogleSignInButton className="mt-4" redirectTo={getPublicSiteUrl('/feedback')} />
        </Panel>
      ) : null}

      {!isSessionLoading && session?.user ? (
        <section id="feedback-form" className="mt-6 scroll-mt-6">
          <Panel className="grid gap-6">
            <fieldset>
              <legend className="g-h3">How was your experience?</legend>
              <div className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
                {ratingOptions.map(({ value, label, Icon }) => {
                  const isSelected = rating === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      aria-pressed={isSelected}
                      aria-label={`Rate ${label}`}
                      className={cx(
                        'flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[var(--r-2)] border px-1 transition-colors',
                        isSelected ? 'border-[var(--ink)] bg-[var(--fill)] text-[var(--ink)]' : 'border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink)]',
                      )}
                    >
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.8} aria-hidden="true" />
                      <span className="text-[11px] font-medium leading-tight sm:text-xs">{label}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="g-field">
              <label htmlFor="feedback-comment">Tell us more</label>
              <textarea
                id="feedback-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={COMMENT_MAX_LENGTH}
                rows={5}
                placeholder="Share your thoughts about GalaTayo…"
                className="g-input min-h-40"
              />
              <span className="g-hint text-right">
                {remainingCount < 60 ? `${remainingCount} characters left` : `${comment.length} / ${COMMENT_MAX_LENGTH}`}
              </span>
            </div>

            {errorMessage ? (
              <p className="g-hint is-error -mt-2" role="alert">
                {errorMessage}
              </p>
            ) : null}
            {statusMessage ? (
              <p className="g-sm -mt-2 font-semibold text-[var(--ok)]" role="status">
                {statusMessage}
              </p>
            ) : null}

            <Button variant="tara" onClick={() => void handleSubmit()} disabled={isSubmitting} className="w-full sm:w-auto sm:justify-self-end">
              {isSubmitting ? 'Sending…' : 'Send feedback'}
            </Button>
          </Panel>
        </section>
      ) : null}
    </Page>
  )
}

export default FeedbackPage
