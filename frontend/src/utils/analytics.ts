import { getSiteOrigin } from './seo'

type AnalyticsEventParams = Record<string, string | number | boolean | undefined | null>

type PageViewParams = {
  pathname: string
  title?: string | null
}

type SearchSubmittedParams = {
  resultCount: number
  page?: number | null
  filterCount?: number | null
}

type SearchResultSelectedParams = {
  placeSlug?: string | null
  areaSlug?: string | null
  categorySlug?: string | null
}

type PlaceViewedParams = {
  placeSlug?: string | null
  areaSlug?: string | null
  category?: string | null
}

type FavoriteAddedParams = {
  placeSlug?: string | null
}

type PlaceSharedParams = {
  placeSlug?: string | null
}

type PlaceReportSubmittedParams = {
  placeSlug?: string | null
  reportType: 'place' | 'comment'
}

type PlaceSubmissionCompletedParams = {
  category?: string | null
}

type AskAiUsageParams = {
  answerLength?: number | null
  placeCount?: number | null
}

type AuthCompletedParams = {
  source?: 'login' | 'signup' | 'onboarding'
  method?: string | null
}

type AnalyticsWindow = Window & {
  dataLayer?: Array<unknown>
  gtag?: (...args: unknown[]) => void
  __galatayoAnalyticsDiagnostics?: AnalyticsDiagnostics
}

const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim()
const GA_SCRIPT_ID = 'galatayo-ga4-script'
const DISABLED_ANALYTICS_PROMISE = Promise.resolve()

type AnalyticsDiagnosticsEntry = {
  command: string
  eventName?: string
  measurementId?: string
}

type AnalyticsDiagnostics = {
  enabled: boolean
  queue: AnalyticsDiagnosticsEntry[]
  hasConfigBeforePageView: boolean
}

let analyticsInitializationPromise: Promise<void> | null = null
let lastPageViewSignature = ''

function canUseAnalytics() {
  return import.meta.env.PROD && Boolean(MEASUREMENT_ID) && typeof window !== 'undefined' && typeof document !== 'undefined'
}

function getAnalyticsWindow() {
  return window as AnalyticsWindow
}

function getSafePathname(pathname: string) {
  return pathname.split(/[?#]/, 1)[0] || '/'
}

function getSafePageLocation(pathname: string) {
  const origin = getSiteOrigin()
  const safePathname = getSafePathname(pathname)
  return `${origin}${safePathname}`
}

function pushGtagEvent(...args: unknown[]) {
  const analyticsWindow = getAnalyticsWindow()
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || []
  analyticsWindow.dataLayer.push(args)
}

function hasStoredAnalyticsDebugFlag() {
  try {
    return window.localStorage.getItem('galatayo_analytics_debug') === '1'
  } catch {
    return false
  }
}

function getAnalyticsDiagnostics(analyticsWindow: AnalyticsWindow) {
  const searchParams = new URLSearchParams(window.location.search)
  const hasDebugFlag = searchParams.has('analytics_debug') || hasStoredAnalyticsDebugFlag()

  if (!hasDebugFlag) {
    return null
  }

  const diagnostics =
    analyticsWindow.__galatayoAnalyticsDiagnostics ||
    ({
      enabled: true,
      queue: [],
      hasConfigBeforePageView: false,
    } satisfies AnalyticsDiagnostics)

  diagnostics.enabled = true
  analyticsWindow.__galatayoAnalyticsDiagnostics = diagnostics

  return diagnostics
}

function recordAnalyticsDiagnostics(args: unknown[]) {
  const analyticsWindow = getAnalyticsWindow()
  const diagnostics = getAnalyticsDiagnostics(analyticsWindow)

  if (!diagnostics) {
    return
  }

  const [command, firstParam, secondParam] = args

  if (command !== 'config' && command !== 'event') {
    return
  }

  const entry: AnalyticsDiagnosticsEntry = {
    command: String(command),
  }

  if (command === 'config' && typeof firstParam === 'string') {
    entry.measurementId = firstParam
  }

  if (command === 'event' && typeof firstParam === 'string') {
    entry.eventName = firstParam
  }

  if (command === 'event' && firstParam === 'page_view' && secondParam && typeof secondParam === 'object' && 'send_to' in secondParam) {
    const params = secondParam as { send_to?: unknown }

    if (typeof params.send_to === 'string') {
      entry.measurementId = params.send_to
    }
  }

  diagnostics.queue.push(entry)

  const configIndex = diagnostics.queue.findIndex(
    (queuedEntry) => queuedEntry.command === 'config' && queuedEntry.measurementId === MEASUREMENT_ID,
  )
  const pageViewIndex = diagnostics.queue.findIndex(
    (queuedEntry) =>
      queuedEntry.command === 'event' &&
      queuedEntry.eventName === 'page_view' &&
      queuedEntry.measurementId === MEASUREMENT_ID,
  )

  diagnostics.hasConfigBeforePageView = configIndex >= 0 && pageViewIndex > configIndex

  console.debug('[analytics]', {
    queued: entry,
    hasConfigBeforePageView: diagnostics.hasConfigBeforePageView,
  })
}

function loadAnalyticsScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (document.getElementById(GA_SCRIPT_ID)) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.id = GA_SCRIPT_ID
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('GA4 script failed to load.'))
    document.head.appendChild(script)
  })
}

function initializeAnalytics(): Promise<void> {
  if (!canUseAnalytics()) {
    return DISABLED_ANALYTICS_PROMISE
  }

  if (analyticsInitializationPromise) {
    return analyticsInitializationPromise
  }

  const analyticsWindow = getAnalyticsWindow()
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || []
  analyticsWindow.gtag =
    analyticsWindow.gtag ||
    function gtagShim(...args: unknown[]) {
      pushGtagEvent(...args)
    }

  const queueGtag = (...args: unknown[]) => {
    analyticsWindow.gtag?.(...args)
    recordAnalyticsDiagnostics(args)
  }

  queueGtag('js', new Date())
  queueGtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
  })

  analyticsInitializationPromise = loadAnalyticsScript()

  return analyticsInitializationPromise
}

async function ensureAnalyticsReady(): Promise<boolean> {
  try {
    await initializeAnalytics()
    return true
  } catch {
    return false
  }
}

async function trackEvent(eventName: string, params: AnalyticsEventParams = {}): Promise<void> {
  if (!canUseAnalytics()) {
    return
  }

  const analyticsReady = await ensureAnalyticsReady()

  if (!analyticsReady) {
    return
  }

  const analyticsWindow = getAnalyticsWindow()
  analyticsWindow.gtag?.('event', eventName, params)
}

async function trackPageView({ pathname, title }: PageViewParams): Promise<void> {
  if (!canUseAnalytics()) {
    return
  }

  const safePathname = getSafePathname(pathname)
  const safeTitle = title?.trim() || document.title || 'GalaTayo'
  const signature = `${safePathname}::${safeTitle}`

  if (signature === lastPageViewSignature) {
    return
  }

  const analyticsReady = await ensureAnalyticsReady()

  if (!analyticsReady) {
    return
  }

  if (signature === lastPageViewSignature) {
    return
  }

  const analyticsWindow = getAnalyticsWindow()
  analyticsWindow.gtag?.('event', 'page_view', {
    send_to: MEASUREMENT_ID,
    page_path: safePathname,
    page_title: safeTitle,
    page_location: getSafePageLocation(safePathname),
  })
  recordAnalyticsDiagnostics([
    'event',
    'page_view',
    {
      send_to: MEASUREMENT_ID,
    },
  ])
  lastPageViewSignature = signature
}

function trackSearchSubmitted({ resultCount, page = null, filterCount = null }: SearchSubmittedParams) {
  trackEvent('search_submitted', {
    result_count: resultCount,
    page: page ?? undefined,
    filter_count: filterCount ?? undefined,
  })
}

function trackSearchResultSelected({ placeSlug, areaSlug, categorySlug }: SearchResultSelectedParams) {
  trackEvent('search_result_selected', {
    place_slug: placeSlug ?? undefined,
    area_slug: areaSlug ?? undefined,
    category_slug: categorySlug ?? undefined,
  })
}

function trackPlaceViewed({ placeSlug, areaSlug, category }: PlaceViewedParams) {
  trackEvent('place_viewed', {
    place_slug: placeSlug ?? undefined,
    area_slug: areaSlug ?? undefined,
    category: category ?? undefined,
  })
}

function trackFavoriteAdded({ placeSlug }: FavoriteAddedParams) {
  trackEvent('favorite_added', {
    place_slug: placeSlug ?? undefined,
  })
}

function trackPlaceShared({ placeSlug }: PlaceSharedParams) {
  trackEvent('place_shared', {
    place_slug: placeSlug ?? undefined,
  })
}

function trackPlaceReportSubmitted({ placeSlug, reportType }: PlaceReportSubmittedParams) {
  trackEvent('place_report_submitted', {
    place_slug: placeSlug ?? undefined,
    report_type: reportType,
  })
}

function trackPlaceSubmissionCompleted({ category }: PlaceSubmissionCompletedParams) {
  trackEvent('place_submission_completed', {
    category: category ?? undefined,
  })
}

function trackAskAiMapsUsed({ placeCount }: AskAiUsageParams) {
  trackEvent('ask_ai_maps_used', {
    place_count: placeCount ?? undefined,
  })
}

function trackAskAiChatbotUsed({ answerLength }: AskAiUsageParams) {
  trackEvent('ask_ai_chatbot_used', {
    answer_length: answerLength ?? undefined,
  })
}

function trackSignUpCompleted({ source = 'signup', method }: AuthCompletedParams = {}) {
  trackEvent('sign_up_completed', {
    source,
    method: method ?? undefined,
  })
}

function trackLoginCompleted({ source = 'login', method }: AuthCompletedParams = {}) {
  trackEvent('login_completed', {
    source,
    method: method ?? undefined,
  })
}

function trackOnboardingCompleted({ source = 'onboarding', method }: AuthCompletedParams = {}) {
  trackEvent('onboarding_completed', {
    source,
    method: method ?? undefined,
  })
}

export {
  initializeAnalytics,
  trackAskAiChatbotUsed,
  trackAskAiMapsUsed,
  trackEvent,
  trackFavoriteAdded,
  trackLoginCompleted,
  trackOnboardingCompleted,
  trackPageView,
  trackPlaceReportSubmitted,
  trackPlaceShared,
  trackPlaceSubmissionCompleted,
  trackPlaceViewed,
  trackSearchResultSelected,
  trackSearchSubmitted,
  trackSignUpCompleted,
}
