export type AskAiUsageStatus = {
  usageType: 'ask_ai_total' | 'live_search' | 'chatbot_ai' | 'ask_ai_maps'
  allowed: boolean
  limit: number
  used: number
  remaining: number
  resetAt: string
  message?: string
}

export type AskAiUsageSummary = {
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

export type AskAiUsageResponse = Partial<AskAiUsageSummary> & {
  askAiMaps?: unknown
  chatbotAi?: unknown
  error?: string
  message?: string
}

function isAskAiUsageStatus(value: unknown): value is AskAiUsageStatus {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as AskAiUsageStatus

  return (
    (
      candidate.usageType === 'ask_ai_total' ||
      candidate.usageType === 'live_search' ||
      candidate.usageType === 'chatbot_ai' ||
      candidate.usageType === 'ask_ai_maps'
    ) &&
    typeof candidate.allowed === 'boolean' &&
    typeof candidate.limit === 'number' &&
    typeof candidate.used === 'number' &&
    typeof candidate.remaining === 'number' &&
    typeof candidate.resetAt === 'string'
  )
}

export function normalizeAskAiUsageStatus(value: unknown): AskAiUsageStatus | null {
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

export function isAskAiUsageStatusExpired(status: AskAiUsageStatus | null): boolean {
  if (!status) {
    return false
  }

  try {
    const resetDate = new Date(status.resetAt)
    return !Number.isNaN(resetDate.getTime()) && Date.now() >= resetDate.getTime()
  } catch {
    return false
  }
}

export function getAskAiUsageStatusFromResponse(
  value: unknown,
  fallbackKeys: Array<'askAi' | 'askAiMaps' | 'chatbotAi'> = ['askAi', 'chatbotAi', 'askAiMaps'],
): AskAiUsageStatus | null {
  const normalizedDirect = normalizeAskAiUsageStatus(value)

  if (normalizedDirect) {
    return normalizedDirect
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as AskAiUsageResponse

  for (const key of fallbackKeys) {
    const normalized = normalizeAskAiUsageStatus(candidate[key])
    if (normalized) {
      return normalized
    }
  }

  return null
}
