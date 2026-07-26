const ASK_AI_GUEST_ID_KEY = 'galatayo:ask-ai-guest-id'
const ASK_AI_GUEST_ID_HEADER = 'x-ask-ai-guest-id'

let inMemoryGuestId: string | null = null

function isValidGuestId(value: string | null): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9-]+$/.test(value)
}

function createAskAiGuestId() {
  const browserCrypto = globalThis.crypto

  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID()
  }

  const randomPart =
    browserCrypto?.getRandomValues
      ? Array.from(browserCrypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(36)).join('-')
      : Math.random().toString(36).slice(2)

  return `${Date.now().toString(36)}-${randomPart}`
}

export function getOrCreateAskAiGuestId() {
  if (typeof window === 'undefined') {
    if (!isValidGuestId(inMemoryGuestId)) {
      inMemoryGuestId = createAskAiGuestId()
    }
    return inMemoryGuestId
  }

  try {
    const existing = window.localStorage.getItem(ASK_AI_GUEST_ID_KEY)
    if (isValidGuestId(existing)) {
      inMemoryGuestId = existing
      return existing
    }

    const nextGuestId = isValidGuestId(inMemoryGuestId) ? inMemoryGuestId : createAskAiGuestId()
    window.localStorage.setItem(ASK_AI_GUEST_ID_KEY, nextGuestId)
    inMemoryGuestId = nextGuestId
    return nextGuestId
  } catch {
    if (!isValidGuestId(inMemoryGuestId)) {
      inMemoryGuestId = createAskAiGuestId()
    }
    return inMemoryGuestId
  }
}

export function buildAskAiRequestHeaders(accessToken?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
    return headers
  }

  const guestId = getOrCreateAskAiGuestId()

  if (guestId) {
    headers[ASK_AI_GUEST_ID_HEADER] = guestId
  }

  return headers
}

export function getAskAiGuestIdHeaderName() {
  return ASK_AI_GUEST_ID_HEADER
}
