import { useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import GoogleSignInButton from '../components/GoogleSignInButton'
import MinimalBackNav from '../components/MinimalBackNav'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import { useSavedFavorites } from '../context/SavedFavoritesContext'

const COMMENT_MAX_LENGTH = 500

const ratingOptions = [
  { value: 1, label: 'Very bad', face: 'frown-heavy' },
  { value: 2, label: 'Bad', face: 'frown' },
  { value: 3, label: 'Okay', face: 'neutral' },
  { value: 4, label: 'Good', face: 'smile' },
  { value: 5, label: 'Excellent', face: 'laugh' },
]

type IconProps = {
  className?: string
}

function HeartGraphic() {
  return (
    <svg viewBox="0 0 180 180" className="h-[164px] w-[164px]" aria-hidden="true">
      <defs>
        <radialGradient id="heart-bg" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="55%" stopColor="#86b5ff" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#3770ed" stopOpacity="1" />
        </radialGradient>
        <linearGradient id="heart-spark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8be6d9" />
          <stop offset="100%" stopColor="#58d1bf" />
        </linearGradient>
      </defs>
      <circle cx="92" cy="96" r="56" fill="url(#heart-bg)" opacity="0.95" />
      <path
        d="M75.5 71.5c7.4 0 13.2 3.8 16.5 9.1 3.3-5.3 9.1-9.1 16.5-9.1 10.6 0 19 8.4 19 18.9 0 21.5-35.5 38.5-35.5 38.5S56.5 111.9 56.5 90.4c0-10.5 8.4-18.9 19-18.9Z"
        fill="#ffffff"
        opacity="0.96"
      />
      <path d="M44 114l-18 8 11 6 7-14Z" fill="#ffffff" opacity="0.95" />
      <path d="M42 114l-6 20 20-14-14-6Z" fill="#eaf1ff" opacity="0.9" />
      <path d="M120 34l2.5 10 10 2.5-10 2.5-2.5 10-2.5-10-10-2.5 10-2.5 2.5-10Z" fill="url(#heart-spark)" />
      <circle cx="43" cy="40" r="11" fill="#c5dcff" opacity="0.9" />
      <circle cx="149" cy="132" r="5" fill="#6abce8" opacity="0.85" />
      <path d="M72 138c11 4 22 4 33 0" fill="none" stroke="#8ab4ff" strokeDasharray="7 8" strokeWidth="3" strokeLinecap="round" />
      <path d="M104 141l16-1-7-10-9 11Z" fill="#ffffff" opacity="0.92" />
    </svg>
  )
}

function FaceIcon({ mood, className = 'h-10 w-10' }: IconProps & { mood: string }) {
  const iconName =
    mood === 'laugh'
      ? 'moodLaugh'
      : mood === 'smile'
        ? 'moodSmile'
        : mood === 'neutral'
          ? 'moodNeutral'
          : 'moodFrown'

  return <AppIcon name={iconName} className={className} strokeWidth={1.8} />
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

    if (!cleanComment) {
      setErrorMessage('Please tell us a little more.')
      setStatusMessage('')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage('')
      setStatusMessage('')

      const response = await fetch(getApiEndpoint('/feedback'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating,
          comment: cleanComment,
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
    <div className="gala-page-background flex min-h-screen flex-col text-[var(--text)]">
      <AppHeader showTaglishChip={false} />

      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">
        <MinimalBackNav to="/search" />

        <section className="gala-card overflow-hidden p-4 sm:p-7 lg:p-8">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
            <div className="space-y-2 sm:space-y-3">
              <p className="gala-page-kicker">Help &amp; Feedback</p>
              <h1 className="gala-page-title max-w-2xl">
                How can we help?
              </h1>
              <p className="gala-page-description">
                Send feedback connected to your account.
              </p>
            </div>
            <div className="hidden justify-end lg:flex" aria-hidden="true">
              <div className="drop-shadow-[0_18px_34px_rgba(47,116,232,0.22)]">
                <HeartGraphic />
              </div>
            </div>
          </div>
        </section>

        {isSessionLoading ? (
          <UnifiedLoadingState
            title="Checking your account..."
            message="We are confirming feedback access for your account."
          />
        ) : null}

        {!isSessionLoading && !session?.user ? (
          <section className="gala-card px-5 py-6">
            <h2 className="text-lg font-black text-slate-950">Sign in to use Help &amp; Feedback</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
              Feedback is connected to your account so we can keep submissions useful.
            </p>
            <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/feedback`} />
          </section>
        ) : null}

        {!isSessionLoading && session?.user ? (
          <section id="feedback-form" className="gala-card mx-auto w-full max-w-3xl scroll-mt-6 px-4 py-5 sm:px-7 sm:py-7 lg:px-8">
            <div className="grid gap-4 sm:gap-6">
              <section>
                <h2 className="mb-2 text-[20px] font-black tracking-[-0.03em] text-slate-950 sm:mb-3 sm:text-[24px]">How was your experience?</h2>
                <div className="grid grid-cols-5 gap-1 sm:gap-3">
                  {ratingOptions.map((option) => {
                    const isSelected = rating === option.value

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRating(option.value)}
                        className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-none border-0 bg-transparent px-0 py-1 text-center font-black transition active:scale-[0.98] ${
                          isSelected
                            ? 'text-[var(--accent-deep)]'
                            : 'text-slate-700 hover:text-[var(--accent-deep)]'
                        }`}
                        aria-label={`Rate ${option.label}`}
                      >
                        <FaceIcon mood={option.face} className={`h-7 w-7 sm:h-12 sm:w-12 ${isSelected ? 'scale-105' : ''}`} />
                        <span className="text-[9px] leading-tight sm:text-sm">{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <label className="block">
                <span className="mb-2 block text-[20px] font-black tracking-[-0.03em] text-slate-950 sm:mb-3 sm:text-[22px]">Tell us more</span>
                <div className="relative">
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    maxLength={COMMENT_MAX_LENGTH}
                    rows={5}
                    placeholder="Share your thoughts about your experience on GalaTayo..."
                    className="gala-field min-h-40 w-full resize-none px-4 py-3.5 pb-9 text-sm leading-relaxed placeholder:text-slate-400 sm:min-h-44 sm:py-4 sm:pb-10 sm:text-base"
                  />
                  <span className="absolute bottom-2.5 right-3.5 text-xs font-semibold text-[var(--muted)] sm:bottom-3 sm:right-4 sm:text-sm">
                    {comment.length} / {COMMENT_MAX_LENGTH}
                  </span>
                </div>
                {remainingCount < 60 ? (
                  <p className="mt-2 text-xs font-semibold text-[var(--muted)]">{remainingCount} characters left</p>
                ) : null}
              </label>

              {errorMessage || statusMessage ? (
                <div className="-mt-1">
                  {errorMessage ? <p className="text-sm font-semibold text-red-600">{errorMessage}</p> : null}
                  {statusMessage ? <p className="text-sm font-semibold text-[var(--accent-deep)]">{statusMessage}</p> : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="gala-primary-button h-12 w-full gap-3 px-4 sm:h-14 sm:text-base"
              >
                <AppIcon name="send" className="h-5 w-5" />
                {isSubmitting ? 'Sending...' : 'Send Feedback'}
              </button>
            </div>
          </section>
        ) : null}
      </main>

    </div>
  )
}

export default FeedbackPage
