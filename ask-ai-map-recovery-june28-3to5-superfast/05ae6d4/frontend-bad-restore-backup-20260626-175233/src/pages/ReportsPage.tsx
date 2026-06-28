import { useEffect, useMemo, useState } from 'react'
import AppFooter from '../components/AppFooter'
import AppHeader from '../components/AppHeader'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { fetchMyCommentReports, type CommentReportReason, type CommentReportStatus, type MyCommentReport } from '../utils/commentReportsApi'
import { navigateToPath, navigateToPlace } from '../utils/navigation'

const reasonLabels: Record<CommentReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate content',
  false_info: 'False information',
  personal_info: 'Personal information',
  other: 'Other',
}

const statusLabels: Record<CommentReportStatus, string> = {
  pending: 'Under review',
  dismissed: 'Reviewed',
  action_taken: 'Action taken',
}

function BackIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M15 18 9 12l6-6" />
    </svg>
  )
}

function FlagIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M6 20V5" />
      <path d="M6 5h10.5l-1.7 3 1.7 3H6" />
    </svg>
  )
}

function PinIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M12 21s6-5.7 6-11a6 6 0 1 0-12 0c0 5.3 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.4" />
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

function getStatusClass(status: CommentReportStatus) {
  if (status === 'action_taken') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (status === 'dismissed') {
    return 'border-slate-200 bg-slate-100 text-slate-700'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function ReportCard({ report }: { report: MyCommentReport }) {
  const placeName = report.place?.name?.trim() || 'Reported place'
  const placeSlug = report.place?.slug?.trim() || ''
  const submittedDate = formatDate(report.createdAt)
  const resolvedDate = formatDate(report.resolvedAt)

  return (
    <article className="w-full rounded-lg border border-[var(--line)] bg-white p-4 shadow-[0_10px_24px_rgba(28,77,160,0.05)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.02em] text-[var(--accent-deep)]">
            {reasonLabels[report.reason]}
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">
            {placeSlug ? (
              <button
                type="button"
                onClick={() => navigateToPlace(placeSlug)}
                className="text-left transition hover:text-[var(--accent-deep)]"
              >
                {placeName}
              </button>
            ) : (
              placeName
            )}
          </h2>
        </div>

        <span className={`inline-flex w-fit shrink-0 rounded-md border px-2.5 py-1 text-xs font-black ${getStatusClass(report.status)}`}>
          {statusLabels[report.status]}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700">
        {submittedDate ? <p>Submitted {submittedDate}</p> : null}
        {resolvedDate ? <p>Resolved {resolvedDate}</p> : null}
      </div>

      {report.comment?.text ? (
        <blockquote className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-3 text-sm font-semibold leading-6 text-slate-800">
          {report.comment.text}
        </blockquote>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--line)] bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">
          Comment preview unavailable.
        </p>
      )}

      {report.details ? (
        <p className="mt-3 text-sm leading-6 text-slate-700">
          <span className="font-black text-slate-950">Your note:</span> {report.details}
        </p>
      ) : null}
    </article>
  )
}

function ReportsPage() {
  const { session, isSessionLoading } = useSavedFavorites()
  const [reports, setReports] = useState<MyCommentReport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!session?.access_token) {
      setReports([])
      setIsLoading(false)
      setErrorMessage('')
      return undefined
    }

    const controller = new AbortController()

    const loadReports = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        setReports(await fetchMyCommentReports(session.access_token, controller.signal))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load your reports. Please try again.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadReports()

    return () => controller.abort()
  }, [session?.access_token])

  const reportCountLabel = useMemo(() => {
    if (reports.length === 1) {
      return '1 submitted report'
    }

    return `${reports.length} submitted reports`
  }, [reports.length])

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fbff,#edf4ff)] text-[var(--text)]">
      <AppHeader showTaglishChip={false} />

      <main className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        <button
          type="button"
          onClick={() => navigateToPath('/search')}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-sm font-black text-slate-700 transition hover:text-[var(--accent-deep)]"
        >
          <BackIcon className="h-5 w-5" />
          Back
        </button>

        <section className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--accent-deep)] shadow-[0_10px_24px_rgba(28,77,160,0.05)]">
                <FlagIcon />
              </span>
              <h1 className="text-[34px] font-black leading-tight text-slate-950 sm:text-[42px]">My Reports</h1>
            </div>
            <p className="mt-3 max-w-xl text-base font-semibold leading-relaxed text-slate-600">
              Reports you submitted and their review status.
            </p>
          </div>

          {session?.user ? (
            <p className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-[0_10px_24px_rgba(28,77,160,0.04)]">
              <PinIcon />
              {reportCountLabel}
            </p>
          ) : null}
        </section>

        {isSessionLoading ? (
          <section className="rounded-lg border border-[var(--line)] bg-white px-4 py-5 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <p className="text-sm text-[var(--muted)]">Checking account...</p>
          </section>
        ) : null}

        {!isSessionLoading && !session?.user ? (
          <section className="rounded-lg border border-[var(--line)] bg-white px-5 py-6 shadow-[0_14px_30px_rgba(28,77,160,0.07)]">
            <h2 className="text-lg font-black text-slate-950">Please sign in to view your reports.</h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
              Your submitted reports are private to your account.
            </p>
            <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/reports`} />
          </section>
        ) : null}

        {!isSessionLoading && session?.user ? (
          <>
            <div className="min-h-5">
              {isLoading ? (
                <p className="text-sm font-semibold text-[var(--accent-deep)]">Loading your reports...</p>
              ) : errorMessage ? (
                <p className="text-sm font-medium text-red-600">{errorMessage}</p>
              ) : null}
            </div>

            {!isLoading && !errorMessage && reports.length === 0 ? (
              <section className="rounded-lg border border-dashed border-[var(--line-strong)] bg-white/82 px-5 py-8 text-center shadow-[0_14px_30px_rgba(28,77,160,0.06)]">
                <FlagIcon className="mx-auto h-10 w-10 text-[var(--accent-deep)]" />
                <h2 className="mt-3 text-lg font-black text-slate-950">No reports yet.</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
                  Any comment reports you submit will appear here.
                </p>
              </section>
            ) : null}

            {reports.length > 0 ? (
              <section className="grid gap-4">
                {reports.map((report) => (
                  <ReportCard key={report.id} report={report} />
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
      <AppFooter />
    </div>
  )
}

export default ReportsPage
