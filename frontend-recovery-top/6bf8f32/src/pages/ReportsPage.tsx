import { Children, useEffect, useMemo, useState, type ReactNode } from 'react'
import AppHeader from '../components/AppHeader'
import { AppIcon } from '../components/AppIcon'
import GoogleSignInButton from '../components/GoogleSignInButton'
import MinimalBackNav from '../components/MinimalBackNav'
import UnifiedLoadingState from '../components/UnifiedLoadingState'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { fetchMyCommentReports, type CommentReportReason, type CommentReportStatus, type MyCommentReport } from '../utils/commentReportsApi'
import { fetchMyPlaceReports, type MyPlaceReport, type PlaceReportReason, type PlaceReportStatus } from '../utils/placeReportsApi'
import { navigateToPlace } from '../utils/navigation'

const commentReasonLabels: Record<CommentReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate: 'Inappropriate content',
  false_info: 'False information',
  personal_info: 'Personal information',
  other: 'Other',
}

const commentStatusLabels: Record<CommentReportStatus, string> = {
  pending: 'Under review',
  dismissed: 'Reviewed',
  action_taken: 'Action taken',
}

const placeReasonLabels: Record<PlaceReportReason, string> = {
  wrong_info: 'Wrong info',
  closed_or_moved: 'Closed or moved',
  safety_issue: 'Safety issue',
  duplicate_place: 'Duplicate place',
  photo_or_copyright: 'Photo or copyright',
  other: 'Other',
}

const placeStatusLabels: Record<PlaceReportStatus, string> = {
  pending: 'Pending',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
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

function getStatusClass(status: CommentReportStatus | PlaceReportStatus) {
  if (status === 'action_taken' || status === 'resolved') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (status === 'dismissed') {
    return 'border-slate-200 bg-slate-100 text-slate-700'
  }

  if (status === 'reviewing') {
    return 'border-sky-200 bg-sky-50 text-sky-700'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function SummaryPill({ icon, label, value }: { icon: 'profile' | 'reports' | 'comments'; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
      <span className="text-slate-500">
        <AppIcon name={icon} size="ui" />
      </span>
      <span>{label}</span>
      <span className="font-black text-slate-950">{value}</span>
    </span>
  )
}

function SectionDropdown({
  icon,
  title,
  description,
  countLabel,
  isOpen,
  onToggle,
  children,
}: {
  icon: 'profile' | 'reports' | 'comments'
  title: string
  description: string
  countLabel: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="gala-card px-4 py-4 sm:px-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-start gap-3 rounded-lg py-1 text-left transition hover:bg-slate-50"
      >
        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-700">
          <AppIcon name={icon} size="ui" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="block text-lg font-black text-slate-950">{title}</span>
              <span className="mt-1 block max-w-3xl text-sm font-medium leading-6 text-slate-600">{description}</span>
            </span>
            <span className="inline-flex items-center gap-3 self-start sm:self-center">
              <span className="rounded-lg border border-[var(--line)] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-600">
                {countLabel}
              </span>
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-500 transition ${isOpen ? 'rotate-180' : ''}`}>
                <AppIcon name="chevronDown" size={18} />
              </span>
            </span>
          </span>
        </span>
      </button>
      {isOpen ? (
        <div className="pt-4">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function SectionEmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="px-0 py-1">
      <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-4 py-4">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{description}</p>
      </div>
    </section>
  )
}

function SectionList({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3">
      {children}
    </div>
  )
}

function UserReportsPlaceholder() {
  return (
    <section className="py-1">
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-[var(--line)] bg-white px-4 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/70 text-slate-700">
          <AppIcon name="profile" size="ui" />
        </span>
        <div>
          <h3 className="text-sm font-black text-slate-950">User reports will show here</h3>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
            When profile or account reporting is connected in the app, the reports you file against a user will appear in this section.
          </p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
            No user reports yet
          </p>
        </div>
      </div>
    </section>
  )
}

function CompactEntry({
  topLine,
  title,
  status,
  meta,
  children,
}: {
  topLine: string
  title: ReactNode
  status: ReactNode
  meta: string[]
  children?: ReactNode
}) {
  const detailItems = Children.toArray(children)

  return (
    <article className="rounded-lg border border-[var(--line)] bg-white px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{topLine}</p>
          <div className="mt-1 text-[15px] font-bold leading-6 text-slate-950">{title}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium text-slate-600">
            {meta.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:pl-4">
          {status}
        </div>
      </div>
      {detailItems.length > 0 ? (
        <div className="mt-3 border-t border-white/70 pt-3">
          <div className="grid gap-3 text-sm text-slate-700">
            {detailItems}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function CommentReportCard({ report }: { report: MyCommentReport }) {
  const placeName = report.place?.name?.trim() || 'Reported place'
  const placeSlug = report.place?.slug?.trim() || ''
  const submittedDate = formatDate(report.createdAt)
  const resolvedDate = formatDate(report.resolvedAt)

  return (
    <CompactEntry
      topLine={commentReasonLabels[report.reason]}
      title={
        placeSlug ? (
          <button
            type="button"
            onClick={() => navigateToPlace(placeSlug)}
            className="text-left transition hover:text-[var(--accent-deep)]"
          >
            {placeName}
          </button>
        ) : (
          placeName
        )
      }
      status={
        <span className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClass(report.status)}`}>
          {commentStatusLabels[report.status]}
        </span>
      }
      meta={[submittedDate ? `Submitted ${submittedDate}` : '', resolvedDate ? `Resolved ${resolvedDate}` : ''].filter(Boolean)}
    >
      {report.comment?.text ? (
        <blockquote className="rounded-[18px] border border-white/70 bg-white/58 px-3 py-2.5 text-sm font-medium leading-6 text-slate-800">
          {report.comment.text}
        </blockquote>
      ) : (
        <p className="text-sm font-medium text-slate-500">Comment preview unavailable.</p>
      )}
      {report.details ? (
        <p className="leading-6">
          <span className="font-black text-slate-950">Your note:</span> {report.details}
        </p>
      ) : null}
    </CompactEntry>
  )
}

function PlaceReportCard({ report }: { report: MyPlaceReport }) {
  const placeName = report.place?.name?.trim() || 'Reported place'
  const placeSlug = report.place?.slug?.trim() || ''
  const submittedDate = formatDate(report.createdAt)
  const resolvedDate = formatDate(report.resolvedAt)
  const meta = [
    submittedDate ? `Submitted ${submittedDate}` : '',
    resolvedDate ? `Resolved ${resolvedDate}` : '',
    report.image ? 'Linked to a specific place photo' : '',
  ].filter(Boolean)

  return (
    <CompactEntry
      topLine={placeReasonLabels[report.reason]}
      title={
        placeSlug ? (
          <button
            type="button"
            onClick={() => navigateToPlace(placeSlug)}
            className="text-left transition hover:text-[var(--accent-deep)]"
          >
            {placeName}
          </button>
        ) : (
          placeName
        )
      }
      status={
        <span className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClass(report.status)}`}>
          {placeStatusLabels[report.status]}
        </span>
      }
      meta={meta}
    >
      {report.details ? (
        <p className="leading-6">
          <span className="font-black text-slate-950">Your note:</span> {report.details}
        </p>
      ) : null}
      {report.moderatorNote ? (
        <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 leading-6 text-slate-800">
          <span className="font-black text-slate-950">Moderator note:</span> {report.moderatorNote}
        </div>
      ) : null}
    </CompactEntry>
  )
}

function ReportsPage() {
  const { session, isSessionLoading } = useSavedFavorites()
  const [commentReports, setCommentReports] = useState<MyCommentReport[]>([])
  const [placeReports, setPlaceReports] = useState<MyPlaceReport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [openSections, setOpenSections] = useState({
    userReports: false,
    placeReports: false,
    commentReports: false,
  })

  useEffect(() => {
    if (!session?.access_token) {
      return undefined
    }

    const controller = new AbortController()

    const loadReports = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        const [nextCommentReports, nextPlaceReports] = await Promise.all([
          fetchMyCommentReports(session.access_token, controller.signal),
          fetchMyPlaceReports(session.access_token, controller.signal),
        ])
        setCommentReports(nextCommentReports)
        setPlaceReports(nextPlaceReports)
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

  const visibleCommentReports = session?.access_token ? commentReports : []
  const visiblePlaceReports = session?.access_token ? placeReports : []
  const visibleUserReports: Array<never> = []
  const visibleIsLoading = Boolean(session?.access_token) && isLoading
  const visibleErrorMessage = session?.access_token ? errorMessage : ''

  const reportCountLabel = useMemo(() => {
    const total = visibleCommentReports.length + visiblePlaceReports.length + visibleUserReports.length
    return total === 1 ? '1 report item' : `${total} report items`
  }, [visibleCommentReports.length, visiblePlaceReports.length, visibleUserReports.length])

  const userReportsLabel = useMemo(() => {
    return visibleUserReports.length === 1 ? '1 user report' : `${visibleUserReports.length} user reports`
  }, [visibleUserReports.length])

  const placeReportsLabel = useMemo(() => {
    return visiblePlaceReports.length === 1 ? '1 place report' : `${visiblePlaceReports.length} place reports`
  }, [visiblePlaceReports.length])

  const commentReportsLabel = useMemo(() => {
    return visibleCommentReports.length === 1 ? '1 comment report' : `${visibleCommentReports.length} comment reports`
  }, [visibleCommentReports.length])

  return (
    <div className="gala-page-background flex min-h-screen flex-col text-[var(--text)]">
      <AppHeader showTaglishChip={false} />

      <main className="mx-auto flex w-full max-w-[980px] flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <MinimalBackNav to="/search" />

        <section className="px-1 py-1 sm:px-0">
          <p className="gala-page-kicker">My Reports</p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="gala-page-title">Reports and updates</h1>
              <p className="gala-page-description">
                A compact view of everything you submitted, plus admin-reviewed outcomes when they are ready to share.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SummaryPill icon="reports" label="All" value={reportCountLabel} />
              <SummaryPill icon="profile" label="Users" value={String(visibleUserReports.length)} />
              <SummaryPill icon="reports" label="Places" value={String(visiblePlaceReports.length)} />
              <SummaryPill icon="reports" label="Comments" value={String(visibleCommentReports.length)} />
            </div>
          </div>
        </section>

        {isSessionLoading ? (
          <UnifiedLoadingState
            title="Checking your account..."
            message="We are confirming access to your reports."
          />
        ) : null}

        {!isSessionLoading && !session?.user ? (
          <section className="gala-card px-5 py-6">
            <h2 className="text-lg font-black text-slate-950">Please sign in to view your reports.</h2>
            <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-[var(--muted)]">
              Your submitted reports stay private to your account, and admin-reviewed outcomes are only shown here after the team validates the issue.
            </p>
            <GoogleSignInButton className="mt-4" redirectTo={`${window.location.origin}/reports`} />
          </section>
        ) : null}

        {!isSessionLoading && session?.user ? (
          <>
            <div>
              {visibleIsLoading ? (
                <UnifiedLoadingState
                  variant="inline"
                  title="Preparing your reports..."
                  message="We are loading your submitted report history."
                />
              ) : null}
              {!visibleIsLoading && visibleErrorMessage ? <p className="text-sm font-medium text-red-600">{visibleErrorMessage}</p> : null}
            </div>

            <div className="grid gap-3">
              <SectionDropdown
                icon="profile"
                title="User Reports"
                description="Reports you submit against a user account or profile will live here."
                countLabel={userReportsLabel}
                isOpen={openSections.userReports}
                onToggle={() => setOpenSections((current) => ({ ...current, userReports: !current.userReports }))}
              >
                <UserReportsPlaceholder />
              </SectionDropdown>

              <SectionDropdown
                icon="reports"
                title="Place Reports"
                description="Concerns you submitted about a place, listing, details, or photo."
                countLabel={placeReportsLabel}
                isOpen={openSections.placeReports}
                onToggle={() => setOpenSections((current) => ({ ...current, placeReports: !current.placeReports }))}
              >
                {visiblePlaceReports.length > 0 ? (
                  <SectionList>
                    {visiblePlaceReports.map((report) => (
                      <PlaceReportCard key={report.id} report={report} />
                    ))}
                  </SectionList>
                ) : (
                  <SectionEmptyState
                    title="No place reports yet"
                    description="When you report a place concern or a photo issue, it will show up here."
                  />
                )}
              </SectionDropdown>

              <SectionDropdown
                icon="comments"
                title="Comment Reports"
                description="Reports you submitted against comments posted on a place."
                countLabel={commentReportsLabel}
                isOpen={openSections.commentReports}
                onToggle={() => setOpenSections((current) => ({ ...current, commentReports: !current.commentReports }))}
              >
                {visibleCommentReports.length > 0 ? (
                  <SectionList>
                    {visibleCommentReports.map((report) => (
                      <CommentReportCard key={report.id} report={report} />
                    ))}
                  </SectionList>
                ) : (
                  <SectionEmptyState
                    title="No comment reports yet"
                    description="When you report a comment on a place, it will appear in this section."
                  />
                )}
              </SectionDropdown>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

export default ReportsPage
