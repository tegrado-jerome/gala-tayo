const ASK_AI_GUEST_ID_KEY = 'galatayo:ask-ai-guest-id'
const ASK_AI_GUEST_ID_HEADER = 'x-ask-ai-guest-id'

function isValidGuestId(value: string | null): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128 && /^[A-Za-z0-9-]+$/.test(value)
}

export function getOrCreateAskAiGuestId() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const existing = window.localStorage.getItem(ASK_AI_GUEST_ID_KEY)
    if (isValidGuestId(existing)) {
      return existing
    }

    const nextGuestId = crypto.randomUUID()
    window.localStorage.setItem(ASK_AI_GUEST_ID_KEY, nextGuestId)
    return nextGuestId
  } catch {
    return null
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
