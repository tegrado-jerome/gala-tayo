// Share tracking: every link we hand out says how it left the app (?ref=story|invite|gc|copy), so GA4
// can tell which share surfaces bring people back. Printed links on story images stay clean.

export const SHARE_CHANNELS = ['story', 'invite', 'gc', 'copy'] as const
export type ShareChannel = (typeof SHARE_CHANNELS)[number]

const isShareChannel = (value: string | null): value is ShareChannel => SHARE_CHANNELS.includes(value as ShareChannel)

/** The same URL with ?ref=<channel> set, keeping any other query and the hash. */
export function withShareRef(url: string, channel: ShareChannel) {
  const hashIndex = url.indexOf('#')
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const queryIndex = base.indexOf('?')
  const path = queryIndex >= 0 ? base.slice(0, queryIndex) : base
  const params = new URLSearchParams(queryIndex >= 0 ? base.slice(queryIndex + 1) : '')
  params.set('ref', channel)
  return `${path}?${params.toString()}${hash}`
}

/** The share channel a visitor arrived from, or null for anything we didn't tag. */
export function readShareRef(search: string): ShareChannel | null {
  const value = new URLSearchParams(search).get('ref')
  return isShareChannel(value) ? value : null
}

/** Native share sheets usually end up in a group chat; without one, the link is copied. */
export const nativeShareChannel = (): ShareChannel => (typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? 'gc' : 'copy')

// Invite links use our own short domain (infra/cloudflare/share-worker), which serves the backend's
// preview card to chat apps and then opens the plan or list on galatayo.app.
export const SHARE_ORIGIN = 'https://go.galatayo.app'

export const goPlanInviteUrl = (planId: string) => `${SHARE_ORIGIN}/p/${encodeURIComponent(planId)}`

/** `query` is an encodeSharedList() string. */
export const goListShareUrl = (query: string) => `${SHARE_ORIGIN}/l?${query}`
