type AskAiUsageStatus = {
  usageType: 'ask_ai_total' | 'live_search'
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

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type AskAiUsageSummary = {
  askAi: AskAiUsageStatus
  liveSearch: AskAiUsageStatus
}

type AskAiAnswerResponse = {
  answer: string
  sources?: unknown
  usage: AskAiUsageSummary
  message?: string
}

type AskAiRuntimeState = {
  question: string
  answer: string
  sources: AskAiSource[]
  answerError: string | null
  usageStatus: AskAiUsageStatus | null
  isSubmitting: boolean
  messages: ChatMessage[]
}

type AskAiRuntimeListener = (state: AskAiRuntimeState) => void

const MAX_CONTEXT_MESSAGES = 8

function trimAssistantContent(content: string): string {
  return content.length > 1200 ? content.slice(0, 1200) + '...' : content
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
}

let askAiRuntimeState: AskAiRuntimeState = emptyAskAiRuntimeState
let askAiAbortController: AbortController | null = null
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
  })
}

export function resetAskAiRuntimeState({
  usageStatus,
}: {
  usageStatus?: AskAiUsageStatus | null
} = {}) {
  askAiAbortController?.abort()
  askAiAbortController = null
  askAiRequestVersion += 1
  setAskAiRuntimeState({
    ...emptyAskAiRuntimeState,
    usageStatus: usageStatus ?? null,
  })
}

export async function submitAskAiRuntimeRequest({
  question,
  accessToken,
  apiBaseUrl,
  messages,
}: {
  question: string
  accessToken: string
  apiBaseUrl?: string
  messages: ChatMessage[]
}) {
  const requestVersion = askAiRequestVersion + 1
  askAiRequestVersion = requestVersion

  askAiAbortController?.abort()
  const abortController = new AbortController()
  askAiAbortController = abortController

  const conversationHistory = buildConversationContext(messages)

  setAskAiRuntimeState({
    ...askAiRuntimeState,
    question,
    answer: '',
    sources: [],
    answerError: null,
    isSubmitting: true,
    messages,
  })

  try {
    const askAiEndpointBase = apiBaseUrl ? `${apiBaseUrl}/ask-ai` : '/api/ask-ai'
    const askAiEndpoint = `${askAiEndpointBase}?t=${Date.now()}`
    const response = await fetch(askAiEndpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      signal: abortController.signal,
      body: JSON.stringify({ question, conversationHistory }),
    })

    const data = (await response.json()) as Partial<AskAiAnswerResponse> & {
      error?: string
      message?: string
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Ask AI could not answer right now.')
    }

    if (
      typeof data.answer !== 'string' ||
      !data.usage ||
      !isAskAiUsageStatus(data.usage.askAi) ||
      !isAskAiUsageStatus(data.usage.liveSearch)
    ) {
      throw new Error('Ask AI response was incomplete.')
    }

    if (askAiRequestVersion !== requestVersion) {
      return
    }

    setAskAiRuntimeState({
      ...askAiRuntimeState,
      question,
      answer: data.answer,
      sources: getAskAiSourceList(data.sources),
      answerError: null,
      usageStatus: data.usage.askAi,
      isSubmitting: false,
      messages,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }

    if (askAiRequestVersion !== requestVersion) {
      return
    }

    setAskAiRuntimeState({
      ...askAiRuntimeState,
      question,
      answer: '',
      sources: [],
      answerError: error instanceof Error ? error.message : 'Ask AI could not answer right now.',
      usageStatus: askAiRuntimeState.usageStatus,
      isSubmitting: false,
      messages,
    })
  } finally {
    if (askAiAbortController === abortController) {
      askAiAbortController = null
    }
  }
}
