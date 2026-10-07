import { useEffect, useState, type ReactNode } from 'react'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import MinimalBackNav from '../components/navigation/MinimalBackNav'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { Empty, Page, Panel, Skeleton, Tabs, Tag } from '../components/ui'
import { useSavedFavorites } from '../context/SavedFavoritesContext'
import { getSupabaseAccessToken } from '../supabase'
import { fetchMyCommentReports, type CommentReportReason, type CommentReportStatus, type MyCommentReport } from '../utils/commentReportsApi'
import { fetchMyPlaceReports, type MyPlaceReport, type PlaceReportReason, type PlaceReportStatus } from '../utils/placeReportsApi'
import { navigateToPlace } from '../utils/navigation'
import { getPublicSiteUrl } from '../utils/site'
import { InlineSkeleton } from '../components/loading/SkeletonStates'
import '../design/misc.css'

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

function looksLikeSensitiveIdentifier(value?: string | null) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return false
  }

  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmedValue)
    || /^[0-9a-f]{24,}$/i.test(trimmedValue)
    || /^[A-Za-z0-9_-]{20,}$/.test(trimmedValue)
  )
}

function sanitizeReportLabel(value: string | null | undefined, fallback: string) {
  const trimmedValue = value?.trim()

  if (!trimmedValue || looksLikeSensitiveIdentifier(trimmedValue)) {
    return fallback
  }

  return trimmedValue
}

function redactSensitiveIdentifiers(value: string) {
  return value
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[hidden]')
    .replace(/\b[0-9a-f]{24,}\b/gi, '[hidden]')
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[hidden]')
}

function statusTone(status: CommentReportStatus | PlaceReportStatus) {
  if (status === 'action_taken' || status === 'resolved') return 'ok'
  if (status === 'pending') return 'warn'
  return 'neutral'
}

function PlaceTitle({ name, slug }: { name: string; slug: string }) {
  if (!slug) return <>{name}</>
  return (
    <button type="button" onClick={() => navigateToPlace(slug)} className="text-left underline-offset-2 hover:underline">
      {name}
    </button>
  )
}

function ReportEntry({
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
  return (
    <article className="g-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="g-xs g-mut">{topLine}</p>
          <div className="g-h3 mt-0.5">{title}</div>
          {meta.length > 0 ? <p className="g-xs g-fnt mt-1">{meta.join(' · ')}</p> : null}
        </div>
        {status}
      </div>
      {children ? <div className="g-sm mt-3 grid gap-2">{children}</div> : null}
    </article>
  )
}

function CommentReportCard({ report }: { report: MyCommentReport }) {
  const placeName = sanitizeReportLabel(report.place?.name, 'Reported place')
  const placeSlug = report.place?.slug?.trim() || ''
  const submittedDate = formatDate(report.createdAt)
  const resolvedDate = formatDate(report.resolvedAt)
  const commentPreview = report.comment?.text ? redactSensitiveIdentifiers(report.comment.text) : ''

  return (
    <ReportEntry
      topLine={commentReasonLabels[report.reason]}
      title={<PlaceTitle name={placeName} slug={placeSlug} />}
      status={<Tag tone={statusTone(report.status)} className="shrink-0">{commentStatusLabels[report.status]}</Tag>}
      meta={[submittedDate ? `Submitted ${submittedDate}` : '', resolvedDate ? `Resolved ${resolvedDate}` : ''].filter(Boolean)}
    >
      {commentPreview ? (
        <blockquote className="border-l-2 border-[var(--line)] pl-3 text-[var(--ink-2)]">{commentPreview}</blockquote>
      ) : (
        <p className="g-fnt">Comment preview unavailable.</p>
      )}
      {report.details ? (
        <p>
          <span className="font-semibold">Your note:</span> {report.details}
        </p>
      ) : null}
    </ReportEntry>
  )
}

function PlaceReportCard({ report }: { report: MyPlaceReport }) {
  const placeName = sanitizeReportLabel(report.place?.name, 'Reported place')
  const placeSlug = report.place?.slug?.trim() || ''
  const submittedDate = formatDate(report.createdAt)
  const resolvedDate = formatDate(report.resolvedAt)
  const meta = [
    submittedDate ? `Submitted ${submittedDate}` : '',
    resolvedDate ? `Resolved ${resolvedDate}` : '',
    report.image ? 'Linked to a specific place photo' : '',
  ].filter(Boolean)
  const hasDetails = Boolean(report.details || report.moderatorNote)

  return (
    <ReportEntry
      topLine={placeReasonLabels[report.reason]}
      title={<PlaceTitle name={placeName} slug={placeSlug} />}
      status={<Tag tone={statusTone(report.status)} className="shrink-0">{placeStatusLabels[report.status]}</Tag>}
      meta={meta}
    >
      {hasDetails ? (
        <>
          {report.details ? (
            <p>
              <span className="font-semibold">Your note:</span> {report.details}
            </p>
          ) : null}
          {report.moderatorNote ? (
            <p className="rounded-[var(--r-2)] bg-[var(--fill)] px-3 py-2">
              <span className="font-semibold">Moderator note:</span> {report.moderatorNote}
            </p>
          ) : null}
        </>
      ) : null}
    </ReportEntry>
  )
}

function ReportsPage() {
  const { session, isSessionLoading } = useSavedFavorites()
  const [commentReports, setCommentReports] = useState<MyCommentReport[]>([])
  const [placeReports, setPlaceReports] = useState<MyPlaceReport[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isTokenLoading, setIsTokenLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'places' | 'comments'>('places')

  useEffect(() => {
    if (!session?.user) {
      return undefined
    }

    let isActive = true

    const resolveAccessToken = async () => {
      try {
        setIsTokenLoading(true)
        const nextAccessToken = await getSupabaseAccessToken(session)

        if (!isActive) {
          return
        }

        setAccessToken(nextAccessToken)
      } finally {
        if (isActive) {
          setIsTokenLoading(false)
        }
      }
    }

    void resolveAccessToken()

    return () => {
      isActive = false
    }
  }, [session])

  useEffect(() => {
    if (!accessToken) {
      return undefined
    }

    const controller = new AbortController()

    const loadReports = async () => {
      try {
        setIsLoading(true)
        setErrorMessage('')
        const [nextCommentReports, nextPlaceReports] = await Promise.all([
          fetchMyCommentReports(accessToken, controller.signal),
          fetchMyPlaceReports(accessToken, controller.signal),
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
  }, [accessToken])

  const hasAuthenticatedReportAccess = Boolean(session?.user && accessToken && !isTokenLoading)
  const visibleCommentReports = hasAuthenticatedReportAccess ? commentReports : []
  const visiblePlaceReports = hasAuthenticatedReportAccess ? placeReports : []
  const visibleIsLoading = hasAuthenticatedReportAccess && isLoading
  const visibleErrorMessage = hasAuthenticatedReportAccess ? errorMessage : ''

  const signInPanel = (title: string, body: string) => (
    <Panel className="mt-6">
      <h2 className="g-h3">{title}</h2>
      <p className="g-sm g-mut mt-1">{body}</p>
      <GoogleSignInButton className="mt-4" redirectTo={getPublicSiteUrl('/reports')} />
    </Panel>
  )

  const activeReports = activeTab === 'places' ? visiblePlaceReports : visibleCommentReports

  return (
    <Page narrow>
      <MinimalBackNav to="/home" label="Home" preferHistory={false} />
      <header className="m-art-head mt-2">
        <span className="m-art-ic" aria-hidden="true">
          <Flag weight="duotone" />
        </span>
        <p className="m-onb-step">Safety</p>
        <h1 className="g-h1 mt-1.5">Your reports</h1>
        <p className="g-mut mt-2 text-[16px]">Everything you flagged, plus what the team decided.</p>
      </header>

      {isSessionLoading || (session?.user && isTokenLoading) ? <InlineSkeleton className="mt-6" /> : null}

      {!isSessionLoading && !session?.user
        ? signInPanel(
            'Sign in to see your reports',
            'Your submitted reports stay private to your account, and admin-reviewed outcomes are only shown here after the team validates the issue.',
          )
        : null}

      {!isSessionLoading && session?.user && !isTokenLoading && !accessToken
        ? signInPanel('Please sign in again', 'Your account is recognized, but the secure session needed to load private reports is missing.')
        : null}

      {!isSessionLoading && hasAuthenticatedReportAccess ? (
        <div className="mt-6">
          <Tabs
            label="Report type"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'places', label: `Places · ${visiblePlaceReports.length}` },
              { value: 'comments', label: `Comments · ${visibleCommentReports.length}` },
            ]}
          />
          <p className="g-sm g-mut mb-3">
            {activeTab === 'places'
              ? 'Concerns you submitted about a place, listing, details, or photo.'
              : 'Reports you submitted against comments posted on a place.'}
          </p>

          {visibleIsLoading ? (
            <div className="g-list" aria-busy="true">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : visibleErrorMessage ? (
            <Empty title="Couldn't load reports" description={visibleErrorMessage} />
          ) : activeReports.length === 0 ? (
            <Empty
              title={activeTab === 'places' ? 'No place reports yet' : 'No comment reports yet'}
              description={
                activeTab === 'places'
                  ? 'When you report a place concern or a photo issue, it will show up here.'
                  : 'When you report a comment on a place, it will appear here.'
              }
            />
          ) : (
            <div className="g-list">
              {activeTab === 'places'
                ? visiblePlaceReports.map((report) => <PlaceReportCard key={report.id} report={report} />)
                : visibleCommentReports.map((report) => <CommentReportCard key={report.id} report={report} />)}
            </div>
          )}
        </div>
      ) : null}
    </Page>
  )
}

export default ReportsPage
