/*
 * Supabase signs the user out when a token refresh fails with 429 (the auth rate limit is shared by
 * everyone behind one mobile CGNAT address). Refresh calls are retried with backoff instead, inside
 * Supabase's 10 s refresh-token reuse window, and a refresh that still fails is reported so the app
 * can say "log in again" rather than quietly showing a guest.
 */

export const REFRESH_RETRY_DELAYS_MS = [1000, 2000, 4000]
const MAX_RETRY_AFTER_MS = 4000

export function isRefreshRequest(input: RequestInfo | URL) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token')
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

/** Delay before the next try: Retry-After (capped) when sent, else the backoff step. */
export function retryDelay(response: Pick<Response, 'headers'>, attempt: number) {
  const retryAfter = Number(response.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
  return REFRESH_RETRY_DELAYS_MS[attempt] ?? REFRESH_RETRY_DELAYS_MS[REFRESH_RETRY_DELAYS_MS.length - 1]
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function createRefreshRetryFetch(
  baseFetch: FetchLike,
  { sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), onRefreshFailed }: { sleep?: (ms: number) => Promise<void>; onRefreshFailed?: (status: number) => void } = {},
): FetchLike {
  return async (input, init) => {
    if (!isRefreshRequest(input)) return baseFetch(input, init)

    let response = await baseFetch(input, init)
    for (let attempt = 0; attempt < REFRESH_RETRY_DELAYS_MS.length && isRetryableStatus(response.status); attempt += 1) {
      await sleep(retryDelay(response, attempt))
      response = await baseFetch(input, init)
    }
    if (!response.ok) onRefreshFailed?.(response.status)
    return response
  }
}
