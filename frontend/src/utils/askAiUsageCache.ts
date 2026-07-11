import {
  normalizeAskAiUsageStatus,
  type AskAiUsageResponse,
  type AskAiUsageStatus,
} from './askAiUsage'

type AskAiUsageCacheRecord = {
  chatbotAi: AskAiUsageStatus | null
  askAiMaps: AskAiUsageStatus | null
}

type AskAiUsageCacheKey = keyof AskAiUsageCacheRecord
type AskAiUsageCacheListener = (usageStatus: AskAiUsageStatus | null) => void

const ASK_AI_USAGE_CACHE_KEY = 'galatayo:ask-ai-usage-cache'
const ASK_AI_USAGE_SYNC_EVENT = 'galatayo:ask-ai-usage-sync'
const ASK_AI_USAGE_BROADCAST_CHANNEL = 'galatayo:ask-ai-usage'

let usageBroadcastChannel: BroadcastChannel | null = null

function getUsageBroadcastChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null
  }

  if (!usageBroadcastChannel) {
    usageBroadcastChannel = new BroadcastChannel(ASK_AI_USAGE_BROADCAST_CHANNEL)
  }

  return usageBroadcastChannel
}

function areUsageStatusesEqual(a: AskAiUsageStatus | null, b: AskAiUsageStatus | null) {
  if (a === b) {
    return true
  }

  if (!a || !b) {
    return false
  }

  return (
    a.usageType === b.usageType &&
    a.allowed === b.allowed &&
    a.limit === b.limit &&
    a.used === b.used &&
    a.remaining === b.remaining &&
    a.resetAt === b.resetAt &&
    a.message === b.message
  )
}

function normalizeCacheRecord(value: Partial<AskAiUsageCacheRecord> | null | undefined): AskAiUsageCacheRecord {
  return {
    chatbotAi: normalizeAskAiUsageStatus(value?.chatbotAi) ?? null,
    askAiMaps: normalizeAskAiUsageStatus(value?.askAiMaps) ?? null,
  }
}

function readRawAskAiUsageCache() {
  try {
    const rawValue = window.localStorage.getItem(ASK_AI_USAGE_CACHE_KEY)

    if (!rawValue) {
      return null
    }

    return JSON.parse(rawValue) as Partial<AskAiUsageCacheRecord>
  } catch {
    return null
  }
}

function writeRawAskAiUsageCache(value: AskAiUsageCacheRecord) {
  try {
    window.localStorage.setItem(ASK_AI_USAGE_CACHE_KEY, JSON.stringify(value))
  } catch {
    // localStorage may be unavailable
  }
}

function emitUsageSync(cache: AskAiUsageCacheRecord) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AskAiUsageCacheRecord>(ASK_AI_USAGE_SYNC_EVENT, { detail: cache }))
  }

  getUsageBroadcastChannel()?.postMessage(cache)
}

function updateUsageCache(nextPartial: Partial<AskAiUsageCacheRecord>) {
  if (typeof window === 'undefined') {
    return normalizeCacheRecord(nextPartial)
  }

  const currentCache = normalizeCacheRecord(readRawAskAiUsageCache())
  const nextCache = normalizeCacheRecord({
    chatbotAi: Object.prototype.hasOwnProperty.call(nextPartial, 'chatbotAi')
      ? nextPartial.chatbotAi
      : currentCache.chatbotAi,
    askAiMaps: Object.prototype.hasOwnProperty.call(nextPartial, 'askAiMaps')
      ? nextPartial.askAiMaps
      : currentCache.askAiMaps,
  })

  if (
    areUsageStatusesEqual(currentCache.chatbotAi, nextCache.chatbotAi) &&
    areUsageStatusesEqual(currentCache.askAiMaps, nextCache.askAiMaps)
  ) {
    return currentCache
  }

  writeRawAskAiUsageCache(nextCache)
  emitUsageSync(nextCache)
  return nextCache
}

export function readCachedAskAiUsage(cacheKey: AskAiUsageCacheKey): AskAiUsageStatus | null {
  if (typeof window === 'undefined') {
    return null
  }

  const cache = normalizeCacheRecord(readRawAskAiUsageCache())
  return cache[cacheKey]
}

export function writeCachedAskAiUsage(cacheKey: AskAiUsageCacheKey, usageStatus: AskAiUsageStatus | null) {
  updateUsageCache({
    [cacheKey]: normalizeAskAiUsageStatus(usageStatus) ?? null,
  })
}

export function writeCachedAskAiUsageFromResponse(value: AskAiUsageResponse | unknown) {
  if (!value || typeof value !== 'object' || typeof window === 'undefined') {
    return
  }

  const response = value as AskAiUsageResponse

  const nextPartial: Partial<AskAiUsageCacheRecord> = {}

  if ('chatbotAi' in response) {
    nextPartial.chatbotAi = normalizeAskAiUsageStatus(response.chatbotAi) ?? null
  }

  if ('askAiMaps' in response) {
    nextPartial.askAiMaps = normalizeAskAiUsageStatus(response.askAiMaps) ?? null
  }

  updateUsageCache(nextPartial)
}

export function subscribeToCachedAskAiUsage(
  cacheKey: AskAiUsageCacheKey,
  listener: AskAiUsageCacheListener,
) {
  if (typeof window === 'undefined') {
    listener(null)
    return () => {}
  }

  const emitCurrent = (cache?: Partial<AskAiUsageCacheRecord> | null) => {
    const normalizedCache = normalizeCacheRecord(cache ?? readRawAskAiUsageCache())
    listener(normalizedCache[cacheKey])
  }

  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<AskAiUsageCacheRecord>
    emitCurrent(customEvent.detail)
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== ASK_AI_USAGE_CACHE_KEY) {
      return
    }

    if (!event.newValue) {
      listener(null)
      return
    }

    try {
      emitCurrent(JSON.parse(event.newValue) as Partial<AskAiUsageCacheRecord>)
    } catch {
      emitCurrent()
    }
  }

  const broadcastChannel = getUsageBroadcastChannel()
  const handleBroadcast = (event: MessageEvent<AskAiUsageCacheRecord>) => {
    emitCurrent(event.data)
  }

  emitCurrent()
  window.addEventListener(ASK_AI_USAGE_SYNC_EVENT, handleCustomEvent)
  window.addEventListener('storage', handleStorage)
  broadcastChannel?.addEventListener('message', handleBroadcast)

  return () => {
    window.removeEventListener(ASK_AI_USAGE_SYNC_EVENT, handleCustomEvent)
    window.removeEventListener('storage', handleStorage)
    broadcastChannel?.removeEventListener('message', handleBroadcast)
  }
}
