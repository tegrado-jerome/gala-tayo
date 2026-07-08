import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { fetchMyCommentModerationNotices, type CommentModerationNotice } from '../utils/commentModerationNoticesApi'
import { navigateToPath, navigateToPlace } from '../utils/navigation'
import { PageContainer, PageShell, CardSurface, Stack } from '../components/layout/ResponsiveLayouts'

function BackIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
    </svg>
  )
}

function NoticeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M12 3.5 20 7v5.5c0 4.5-3.1 7.1-8 8-4.9-.9-8-3.5-8-8V7l8-3.5Z" />
      <path d="M8.5 11.8h7" />
      <path d="M8.5 15h4.5" />
    </svg>
  )
}

function formatDate(value?: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function NoticeCard({ notice }: { notice: CommentModerationNotice }) {
  const placeName = notice.place?.name?.trim() || 'Place unavailable'
  const placeSlug = notice.place?.slug?.trim() || ''
  const resolvedDate = formatDate(notice.resolvedAt)

  return (
    <article className="w-full rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(28,77,160,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-950">{notice.message}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
            This action was taken because the comment may have violated GalaTayo community guidelines.
          </p>
        </div>

        <span className="inline-flex w-fit shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
          Action taken
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
        <p>
          <span className="font-black text-slate-950">Place:</span>{' '}
          {placeSlug ? (
            <button
              type="button"
              onClick={() => navigateToPlace(placeSlug)}
              className="font-black text-[var(--accent-deep)] underline-offset-2 transition hover:underline"
            >
              {placeName}
            </button>
          ) : (
            placeName
          )}
        </p>
        {resolvedDate ? (
          <p>
            <span className="font-black text-slate-950">Resolved:</span> {resolvedDate}
          </p>
        ) : null}
      </div>

      <blockquote className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-3 text-sm font-semibold leading-6 text-slate-800">
        <span className="font-black text-slate-950">Comment:</span> &quot;{notice.comment.text}&quot;
      </blockquote>
    </article>
  )
}

function CommentNoticesPage() {
  const { session, isSessionLoading } = useSavedFavorites()
  const [notices, setNotices] = useState<CommentModerationNotice[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!session?.access_token) {
      setNotices([])
      setIsLoading(false)
      setErrorMessage('')
      return undefined
    }

    const controller = new AbortController()

    const loadNotices = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        setNotices(await fetchMyCommentModerationNotices(session.access_token, controller.signal))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load your comment notices. Please try again.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadNotices()

    return () => controller.abort()
  }, [session?.access_token])

  return (
    <PageShell tone="surface">
      <AppHeader showTaglishChip={false} />

      <main className="w-full pb-12 pt-4 sm:pb-14 sm:pt-5 lg:py-8">
        <PageContainer size="default">
          <Stack gap="default">
            <button
              type="button"
              onClick={() => navigateToPath('/search')}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-sm font-black text-slate-700 transition hover:text-[var(--accent-deep)]"
            >
              <BackIcon className="h-5 w-5" />
              Back
            </button>

            <section className="border-b border-[var(--line)] pb-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--accent-deep)] shadow-[0_10px_24px_rgba(28,77,160,0.05)]">
                  <NoticeIcon />
                </span>
                <h1 className="text-[34px] font-black leading-tight text-slate-950 sm:text-[42px]">Comment Notices</h1>
              </div>
              <p className="mt-3 max-w-xl text-base font-semibold leading-relaxed text-slate-600">
                Moderation notices for your own comments.
              </p>
            </section>

            {isSessionLoading ? (
              <CardSurface pad="default">
                <p className="text-sm text-[var(--muted)]">Checking account...</p>
              </CardSurface>
            ) : null}

            {!isSessionLoading && !session?.user ? (
              <CardSurface pad="loose">
                <h2 className="text-lg font-black text-slate-950">Please sign in to view comment notices.</h2>
                <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
                  Comment moderation notices are private to your account.
                </p>
                <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/comment-notices`} />
              </CardSurface>
            ) : null}

            {!isSessionLoading && session?.user ? (
              <Stack gap="default">
                <div className="min-h-5">
                  {isLoading ? (
                    <p className="text-sm font-semibold text-[var(--accent-deep)]">Loading your comment notices...</p>
                  ) : errorMessage ? (
                    <p className="text-sm font-medium text-red-600">{errorMessage}</p>
                  ) : null}
                </div>

                {!isLoading && !errorMessage && notices.length === 0 ? (
                  <CardSurface tone="outlined" pad="loose" className="text-center">
                    <NoticeIcon className="mx-auto h-10 w-10 text-[var(--accent-deep)]" />
                    <h2 className="mt-3 text-lg font-black text-slate-950">No comment notices yet.</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
                      If moderation action is taken on one of your comments, it will appear here.
                    </p>
                  </CardSurface>
                ) : null}

                {notices.length > 0 ? (
                  <Stack gap="default">
                    {notices.map((notice) => (
                      <NoticeCard key={notice.id} notice={notice} />
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </PageContainer>
      </main>
    </PageShell>
  )
}

export default CommentNoticesPage
