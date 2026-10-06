import { readShareRef, type ShareChannel } from './shareRef'

type AnalyticsEventParams = Record<string, string | number | boolean | undefined | null>

type PageViewParams = {
  pathname?: string
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
  dataLayer?: Array<IArguments>
  gtag?: (...args: unknown[]) => void
}

const CONSENT_STORAGE_KEY = 'galatayo-cookie-consent'
const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim()
const GA_SCRIPT_ID = 'galatayo-ga4-script'
const DISABLED_ANALYTICS_PROMISE = Promise.resolve()

let analyticsInitializationPromise: Promise<void> | null = null
let lastPageViewSignature = ''

function getStoredConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY)
  } catch {
    return null
  }
}

function canUseAnalytics() {
  return import.meta.env.PROD && Boolean(MEASUREMENT_ID) && typeof window !== 'undefined' && typeof document !== 'undefined' && getStoredConsent() === 'accepted'
}

function getAnalyticsWindow() {
  return window as AnalyticsWindow
}

function getSafePathname(pathname: string) {
  return pathname.split(/[?#]/, 1)[0] || '/'
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
  analyticsWindow.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    analyticsWindow.dataLayer!.push(arguments)
  }

  analyticsWindow.gtag('js', new Date())
  analyticsWindow.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
  })

  analyticsInitializationPromise = loadAnalyticsScript()

  return analyticsInitializationPromise
}

function reinitializeAnalytics() {
  analyticsInitializationPromise = null
  lastPageViewSignature = ''
  return initializeAnalytics()
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

async function trackPageView({ pathname }: PageViewParams): Promise<void> {
  if (!canUseAnalytics()) {
    return
  }

  const requestedPath = getSafePathname(pathname || window.location.pathname)
  const requestedSearch = window.location.search
  const signature = `${requestedPath}${requestedSearch}`

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
    page_title: document.title,
    page_location: window.location.href,
    page_path: window.location.pathname + window.location.search,
    // Which share surface brought this visit (?ref=story|invite|gc|copy). Register "share_ref" as a custom dimension to report on it.
    share_ref: readShareRef(window.location.search) ?? undefined,
  })
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

/** GA4's recommended "share" event: method is the channel the link was tagged with. */
function trackShare({ channel, contentType, itemId }: { channel: ShareChannel; contentType: 'place' | 'plan' | 'guide' | 'list' | 'gala_today' | 'saan_tayo' | 'profile'; itemId?: string | null }) {
  trackEvent('share', {
    method: channel,
    content_type: contentType,
    item_id: itemId ?? undefined,
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
  reinitializeAnalytics,
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
  trackShare,
  trackSignUpCompleted,
}
