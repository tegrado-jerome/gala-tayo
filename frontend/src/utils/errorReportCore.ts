// GA4 cuts event parameter values at 100 characters.
const MAX_DESCRIPTION_LENGTH = 100

// Browser noise that says nothing about our code: cross-origin script errors arrive as a bare
// "Script error.", and ResizeObserver loop warnings are harmless.
const IGNORED_MESSAGES = [/^script error\.?$/i, /resizeobserver loop/i]

function rawMessage(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  return ''
}

/**
 * A short, anonymous description for a GA4 `exception` event, or null when it is not worth sending.
 * Emails, query strings, long numbers and token-like strings are masked so no personal data leaves.
 */
export function describeException(error: unknown): string | null {
  const message = rawMessage(error).replace(/\s+/g, ' ').trim()
  if (!message || IGNORED_MESSAGES.some((pattern) => pattern.test(message))) return null
  const masked = message
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]')
    .replace(/\d{5,}/g, '#')
  return masked.slice(0, MAX_DESCRIPTION_LENGTH)
}
