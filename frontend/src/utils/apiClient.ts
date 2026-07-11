import { supabase } from '../supabase'

const DEFAULT_TIMEOUT_MS = 15000

export function getApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  return apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, '')}${path}` : `/api${path}`
}

export async function getSessionToken(errorMessage = 'Sign in is required.') {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? null

  if (!token) {
    throw new Error(errorMessage)
  }

  return token
}

export async function apiFetch(
  path: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const hasExternalSignal = options?.signal !== undefined

  if (hasExternalSignal) {
    const response = await fetch(getApiUrl(path), options)
    return response
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(getApiUrl(path), {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function apiFetchUrl(
  url: string,
  options?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}
