export function normalizeThemeRoutePath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

export function isForcedLightThemePath(pathname: string) {
  return normalizeThemeRoutePath(pathname) === '/'
}
