export function sanitizeNextPath(value: string | null | undefined) {
  if (!value) {
    return null
  }

  if (!value.startsWith('/')) {
    return null
  }

  if (value.startsWith('//')) {
    return null
  }

  const normalizedValue = value.trim()

  if (
    normalizedValue === '/login' ||
    normalizedValue === '/login/' ||
    normalizedValue === '/signup' ||
    normalizedValue === '/signup/' ||
    normalizedValue === '/auth' ||
    normalizedValue === '/auth/'
  ) {
    return null
  }

  return normalizedValue
}

export function getRequestedNextPath(search: string = window.location.search) {
  const params = new URLSearchParams(search)
  return sanitizeNextPath(params.get('next'))
}

export function buildAuthPath(target: '/login' | '/signup', nextPath?: string | null) {
  const sanitizedNextPath = sanitizeNextPath(nextPath)

  if (!sanitizedNextPath) {
    return target
  }

  return `${target}?next=${encodeURIComponent(sanitizedNextPath)}`
}

export function resolvePostAuthPath(fallbackPath: string, search: string = window.location.search) {
  return getRequestedNextPath(search) ?? fallbackPath
}
