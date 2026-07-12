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
}

const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim()
const GA_SCRIPT_ID = 'galatayo-ga4-script'

let analyticsScriptPromise: Promise<void> | null = null
let lastPageViewSignature = ''

function canUseAnalytics() {
  return Boolean(MEASUREMENT_ID) && typeof window !== 'undefined' && typeof document !== 'undefined'
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

function ensureScriptLoaded() {
  if (!canUseAnalytics()) {
    return Promise.resolve()
  }

  const analyticsWindow = getAnalyticsWindow()

  if (analyticsWindow.gtag && analyticsWindow.dataLayer && document.getElementById(GA_SCRIPT_ID)) {
    return Promise.resolve()
  }

  if (analyticsScriptPromise) {
    return analyticsScriptPromise
  }

  analyticsScriptPromise = new Promise<void>((resolve, reject) => {
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

  const analyticsWindowWithData = analyticsWindow
  analyticsWindowWithData.dataLayer = analyticsWindowWithData.dataLayer || []
  analyticsWindowWithData.gtag =
    analyticsWindowWithData.gtag ||
    function gtagShim(...args: unknown[]) {
      pushGtagEvent(...args)
    }

  analyticsWindowWithData.gtag('js', new Date())
  analyticsWindowWithData.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
  })

  return analyticsScriptPromise
}

function initializeAnalytics() {
  void ensureScriptLoaded().catch(() => undefined)
}

function trackEvent(eventName: string, params: AnalyticsEventParams = {}) {
  if (!canUseAnalytics()) {
    return
  }

  initializeAnalytics()

  const analyticsWindow = getAnalyticsWindow()
  analyticsWindow.gtag?.('event', eventName, params)
}

function trackPageView({ pathname, title }: PageViewParams) {
  if (!canUseAnalytics()) {
    return
  }

  const safePathname = getSafePathname(pathname)
  const safeTitle = title?.trim() || document.title || 'GalaTayo'
  const signature = `${safePathname}::${safeTitle}`

  if (signature === lastPageViewSignature) {
    return
  }

  lastPageViewSignature = signature
  initializeAnalytics()

  const analyticsWindow = getAnalyticsWindow()
  analyticsWindow.gtag?.('event', 'page_view', {
    page_path: safePathname,
    page_title: safeTitle,
    page_location: getSafePageLocation(safePathname),
  })
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
