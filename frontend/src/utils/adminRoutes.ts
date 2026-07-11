const DEFAULT_ADMIN_BASE_PATH = '/ops-7f3c9b2e'
const LEGACY_ADMIN_BASE_PATH = '/admin'

function normalizeBasePath(value: string | null | undefined) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return DEFAULT_ADMIN_BASE_PATH
  }

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return normalized.replace(/\/+$/g, '') || DEFAULT_ADMIN_BASE_PATH
}

export const ADMIN_BASE_PATH = normalizeBasePath(import.meta.env.VITE_ADMIN_BASE_PATH as string | undefined)

export const ADMIN_MFA_SETUP_PATH = `${ADMIN_BASE_PATH}/mfa/setup`
export const ADMIN_MFA_VERIFY_PATH = `${ADMIN_BASE_PATH}/mfa/verify`

export function getAdminPath(subpath = '') {
  const normalizedSubpath = subpath.trim().replace(/^\/+/, '')
  return normalizedSubpath ? `${ADMIN_BASE_PATH}/${normalizedSubpath}` : ADMIN_BASE_PATH
}

export function isAdminPath(pathname: string) {
  return pathname === ADMIN_BASE_PATH || pathname === `${ADMIN_BASE_PATH}/` || pathname.startsWith(`${ADMIN_BASE_PATH}/`)
}

export function isLegacyAdminPath(pathname: string) {
  return pathname === LEGACY_ADMIN_BASE_PATH || pathname === `${LEGACY_ADMIN_BASE_PATH}/` || pathname.startsWith(`${LEGACY_ADMIN_BASE_PATH}/`)
}

export function getLegacyAdminRedirectPath(pathname: string) {
  if (!isLegacyAdminPath(pathname) || isAdminPath(pathname)) {
    return null
  }

  const suffix = pathname.slice(LEGACY_ADMIN_BASE_PATH.length)
  return `${ADMIN_BASE_PATH}${suffix}`
}

export function getAdminSectionPath(section: string) {
  return getAdminPath(section)
}

