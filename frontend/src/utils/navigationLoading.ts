export type NavigationSource = 'push' | 'replace' | 'pop'

export function shouldBlockOnNavigationEntry(navigationSource: NavigationSource) {
  return navigationSource !== 'pop'
}
