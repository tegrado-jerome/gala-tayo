import {
  cancelAskAiTask,
  completeAskAiTask,
  failAskAiTask,
  registerAskAiTask,
} from './askAiTaskStore'
import { getApiUrl } from './apiClient'
import { buildAskAiRequestHeaders, getOrCreateAskAiGuestId } from './askAiIdentity'

type AskAiUsageStatus = {
  usageType: 'ask_ai_total' | 'live_search' | 'chatbot_ai' | 'ask_ai_maps'
  allowed: boolean
  limit: number
  used: number
  remaining: number
  resetAt: string
  message?: string
}

type AskAiSource = {
  title: string
  url: string
}

export type AskAiJobStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type AskAiUsageSummary = {
  askAi: AskAiUsageStatus
  liveSearch: AskAiUsageStatus
}

type BackendAskAiUsageStatus = {
  usageType?: string
  allowed?: boolean
  dailyLimit?: number
  requestCount?: number
  remaining?: number
  resetsAt?: string
  message?: string
}

type AskAiUsageEnvelope = {
  askAi?: unknown
  liveSearch?: unknown
  chatbotAi?: unknown
  askAiMaps?: unknown
}

type AskAiErrorResponse = {
  ok?: boolean
  answer?: string
  sources?: unknown
  error?: string
  message?: string
  userMessage?: string
  usage?: AskAiUsageSummary
  requestId?: string
}

type AskAiRuntimeState = {
  question: string
  answer: string
  sources: AskAiSource[]
  answerError: string | null
  usageStatus: AskAiUsageStatus | null
  isSubmitting: boolean
  messages: ChatMessage[]
  jobId: string | null
  jobStatus: AskAiJobStatus | null
}

type AskAiRuntimeListener = (state: AskAiRuntimeState) => void

const MAX_CONTEXT_MESSAGES = 8

function sanitizeChatbotAnswer(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<\/?div>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function trimAssistantContent(content: string): string {
  return content.length > 1200 ? `${content.slice(0, 1200)}...` : content
}

function buildConversationContext(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_CONTEXT_MESSAGES)

  return recent.map((msg) => ({
    role: msg.role,
    content: msg.role === 'assistant' ? trimAssistantContent(msg.content) : msg.content,
  }))
}

const emptyAskAiRuntimeState: AskAiRuntimeState = {
  question: '',
  answer: '',
  sources: [],
  answerError: null,
  usageStatus: null,
  isSubmitting: false,
  messages: [],
  jobId: null,
  jobStatus: null,
}

let askAiRuntimeState: AskAiRuntimeState = emptyAskAiRuntimeState
let askAiAbortController: AbortController | null = null
let activeAskAiRequestId: string | null = null
let askAiRequestVersion = 0
const listeners = new Set<AskAiRuntimeListener>()

function emitAskAiRuntimeState() {
  for (const listener of listeners) {
    listener(askAiRuntimeState)
  }
}

function setAskAiRuntimeState(nextState: AskAiRuntimeState) {
  askAiRuntimeState = nextState
  emitAskAiRuntimeState()
}

function updateAskAiRuntimeState(updater: (state: AskAiRuntimeState) => AskAiRuntimeState) {
  setAskAiRuntimeState(updater(askAiRuntimeState))
}

function getValidSourceUrl(source: Record<string, unknown>) {
  const rawUrl = typeof source.url === 'string'
    ? source.url.trim()
    : typeof source.link === 'string'
      ? source.link.trim()
      : ''

  if (!rawUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(rawUrl)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? parsedUrl.href : null
  } catch {
    return null
  }
}

function getSourceHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

function getAskAiSourceList(value: unknown): AskAiSource[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seenUrls = new Set<string>()

  return value.flatMap((source) => {
    if (!source || typeof source !== 'object') {
      return []
    }

    const candidate = source as Record<string, unknown>
    const url = getValidSourceUrl(candidate)

    if (!url || seenUrls.has(url)) {
      return []
    }

    seenUrls.add(url)

    return [{
      title: typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim()
        : getSourceHostname(url),
      url,
    }]
  })
}

function isAskAiUsageStatus(value: unknown): value is AskAiUsageStatus {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as AskAiUsageStatus
  return (
    typeof candidate.usageType === 'string' &&
    typeof candidate.allowed === 'boolean' &&
    typeof candidate.limit === 'number' &&
    typeof candidate.used === 'number' &&
    typeof candidate.remaining === 'number' &&
    typeof candidate.resetAt === 'string'
  )
}

function normalizeAskAiUsageStatus(value: unknown): AskAiUsageStatus | null {
  if (isAskAiUsageStatus(value)) {
    return value
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as BackendAskAiUsageStatus
  const normalizedUsageType =
    candidate.usageType === 'live_search'
      ? 'live_search'
      : candidate.usageType === 'ask_ai_total' || candidate.usageType === 'chatbot_ai' || candidate.usageType === 'ask_ai_maps'
        ? candidate.usageType
        : null

  if (
    !normalizedUsageType ||
    typeof candidate.allowed !== 'boolean' ||
    typeof candidate.dailyLimit !== 'number' ||
    typeof candidate.requestCount !== 'number' ||
    typeof candidate.remaining !== 'number' ||
    typeof candidate.resetsAt !== 'string'
  ) {
    return null
  }

  return {
    usageType: normalizedUsageType,
    allowed: candidate.allowed,
    limit: candidate.dailyLimit,
    used: candidate.requestCount,
    remaining: candidate.remaining,
    resetAt: candidate.resetsAt,
    message: typeof candidate.message === 'string' ? candidate.message : undefined,
  }
}

function getAskAiUsageStatus(value: unknown): AskAiUsageStatus | null {
  const normalizedDirect = normalizeAskAiUsageStatus(value)

  if (normalizedDirect) {
    return normalizedDirect
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const envelope = value as AskAiUsageEnvelope
  return normalizeAskAiUsageStatus(envelope.askAi) ?? normalizeAskAiUsageStatus(envelope.chatbotAi)
}

function normalizeAskAiErrorMessage(message: unknown): string | null {
  if (typeof message !== 'string') {
    return null
  }

  const normalized = message.trim()
  return normalized ? normalized : null
}

function getAskAiErrorMessage({
  response,
  fallbackMessage,
}: {
  response?: Pick<AskAiErrorResponse, 'error' | 'message' | 'userMessage'> | null
  fallbackMessage?: string | null
}) {
  return (
    normalizeAskAiErrorMessage(response?.userMessage) ??
    normalizeAskAiErrorMessage(response?.message) ??
    normalizeAskAiErrorMessage(response?.error) ??
    normalizeAskAiErrorMessage(fallbackMessage) ??
    'Sorry, I could not answer that right now. Please try again.'
  )
}

function hasMeaningfulAskAiRuntimeState(state: AskAiRuntimeState) {
  return Boolean(
    state.question ||
    state.answer ||
    state.answerError ||
    state.sources.length ||
    state.usageStatus ||
    state.isSubmitting
  )
}

function createAskAiRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function notifyAskAiRequestCancelled(requestId: string | null) {
  if (!requestId) return

  void fetch(getApiUrl('/ask-ai/cancel'), {
    method: 'POST',
    cache: 'no-store',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
    },
    body: JSON.stringify({ requestId, usageType: 'chatbot_ai' }),
  }).catch(() => undefined)
}

export function getAskAiRuntimeState() {
  return askAiRuntimeState
}

export function hasActiveAskAiRuntimeState() {
  return hasMeaningfulAskAiRuntimeState(askAiRuntimeState)
}

export function subscribeToAskAiRuntime(listener: AskAiRuntimeListener) {
  listeners.add(listener)
  listener(askAiRuntimeState)
  return () => {
    listeners.delete(listener)
  }
}

export function seedAskAiRuntimeState(state: Partial<AskAiRuntimeState>) {
  if (hasMeaningfulAskAiRuntimeState(askAiRuntimeState)) {
    return
  }

  setAskAiRuntimeState({
    question: typeof state.question === 'string' ? state.question : '',
    answer: typeof state.answer === 'string' ? state.answer : '',
    sources: Array.isArray(state.sources) ? state.sources : [],
    answerError: typeof state.answerError === 'string' ? state.answerError : null,
    usageStatus: state.usageStatus ?? null,
    isSubmitting: state.isSubmitting === true,
    messages: Array.isArray(state.messages) ? state.messages : [],
    jobId: typeof state.jobId === 'string' ? state.jobId : null,
    jobStatus: state.jobStatus ?? null,
  })
}

export function cancelAskAiRuntimeRequest() {
  notifyAskAiRequestCancelled(activeAskAiRequestId)
  askAiAbortController?.abort()
  askAiAbortController = null
  activeAskAiRequestId = null
  askAiRequestVersion += 1
  updateAskAiRuntimeState((state) => ({
    ...state,
    isSubmitting: false,
    jobStatus: 'cancelled',
    answerError: null,
  }))

  cancelAskAiTask('chatbot', askAiRuntimeState.answer
    ? { answer: askAiRuntimeState.answer, sources: askAiRuntimeState.sources }
    : null)
}

export async function resumeAskAiRuntimeJob({
  accessToken,
}: {
  accessToken: string
}) {
  void accessToken
  // Non-streaming: can't resume an in-flight fetch across page navigations.
  // Reset any stale pending state so the UI doesn't appear stuck.
  if (askAiRuntimeState.isSubmitting) {
    cancelAskAiRuntimeRequest()
  }
}

export function resetAskAiRuntimeState({
  usageStatus,
}: {
  usageStatus?: AskAiUsageStatus | null
} = {}) {
  askAiAbortController?.abort()
  askAiAbortController = null
  notifyAskAiRequestCancelled(activeAskAiRequestId)
  activeAskAiRequestId = null
  askAiRequestVersion += 1
  setAskAiRuntimeState({
    ...emptyAskAiRuntimeState,
    usageStatus: usageStatus ?? null,
  })
}

export async function submitAskAiRuntimeRequest({
  question,
  accessToken,
  guestId,
  messages,
}: {
  question: string
  accessToken?: string | null
  guestId?: string | null
  messages: ChatMessage[]
}) {
  const requestVersion = askAiRequestVersion + 1
  askAiRequestVersion = requestVersion

  askAiAbortController?.abort()
  const abortController = new AbortController()
  askAiAbortController = abortController
  const requestId = createAskAiRequestId()
  activeAskAiRequestId = requestId

  const conversationHistory = buildConversationContext(messages)

  registerAskAiTask('chatbot')

  setAskAiRuntimeState({
    ...askAiRuntimeState,
    question,
    answer: '',
    sources: [],
    answerError: null,
    isSubmitting: true,
    messages,
    jobId: null,
    jobStatus: 'pending',
  })

  try {
    const chatbotEndpoint = getApiUrl('/ask-ai/chatbot')
    const requestGuestId = accessToken ? null : (guestId ?? getOrCreateAskAiGuestId())

    if (!accessToken && !requestGuestId) {
      throw new Error('Missing Ask AI guest identifier.')
    }

    const response = await fetch(chatbotEndpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...buildAskAiRequestHeaders(accessToken ?? null),
        'x-request-id': requestId,
      },
      body: JSON.stringify({ question, conversationHistory }),
      signal: abortController.signal,
    })

    const data = await response.json() as AskAiErrorResponse

    if (!response.ok || !data.ok) {
      interface ChatbotErrorBody {
        usage?: AskAiUsageSummary
        error?: string
        message?: string
        userMessage?: string
      }

      const errorBody: ChatbotErrorBody = {
        usage: data.usage,
        error: data.error,
        message: data.message,
        userMessage: data.userMessage,
      }

      throw Object.assign(
        new Error(getAskAiErrorMessage({ response: data })),
        { errorBody },
      )
    }

    if (askAiRequestVersion !== requestVersion) {
      return
    }

    const finalAnswer = sanitizeChatbotAnswer(data.answer ?? '')
    const finalSources = getAskAiSourceList(data.sources)

    const usageStatus = getAskAiUsageStatus(data.usage)

    completeAskAiTask('chatbot', { answer: finalAnswer, sources: finalSources })

    updateAskAiRuntimeState((state) => ({
      ...state,
      question,
      answer: finalAnswer,
      sources: finalSources,
      answerError: null,
      usageStatus,
      isSubmitting: false,
      jobStatus: 'completed',
      messages,
    }))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    if (askAiRequestVersion !== requestVersion) {
      return
    }

    const rawMessage = error instanceof Error ? error.message : 'Ask AI could not answer right now.'
    const isNetworkError =
      rawMessage === 'Failed to fetch' ||
      rawMessage === 'NetworkError' ||
      rawMessage === 'Load failed'

    interface ErrorBody {
      usage?: AskAiUsageSummary
      error?: string
      message?: string
      userMessage?: string
    }

    const errorBody: ErrorBody | undefined =
      error instanceof Error && 'errorBody' in error
        ? (error as Error & { errorBody: ErrorBody }).errorBody
        : undefined

    const errorMessage = isNetworkError
      ? 'Sorry, I could not reach Ask AI right now. Please check your connection and try again.'
      : getAskAiErrorMessage({
          response: errorBody,
          fallbackMessage: rawMessage,
        })

    const updatedUsageStatus = getAskAiUsageStatus(errorBody?.usage) ?? askAiRuntimeState.usageStatus

    failAskAiTask('chatbot', errorMessage)

    updateAskAiRuntimeState((state) => ({
      ...state,
      question,
      answerError: errorMessage,
      usageStatus: updatedUsageStatus,
      isSubmitting: false,
      jobStatus: 'failed',
      messages,
    }))
  } finally {
    if (askAiAbortController === abortController) {
      askAiAbortController = null
      activeAskAiRequestId = null
    }
  }
}
