// Proof links: 1-3 public posts or articles showing people go to a submitted place on purpose.
// Mirrors backend/src/utils/proofLinks.ts (the API re-checks everything); keep the two in sync.

export const MIN_PROOF_LINKS = 1
export const MAX_PROOF_LINKS = 3
export const MAX_PROOF_LINK_LENGTH = 500

export type ProofSource = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'reddit' | 'article'

const SOCIAL_HOSTS: Array<[string, ProofSource]> = [
  ['tiktok.com', 'tiktok'],
  ['instagram.com', 'instagram'],
  ['facebook.com', 'facebook'],
  ['fb.watch', 'facebook'],
  ['youtube.com', 'youtube'],
  ['youtu.be', 'youtube'],
  ['reddit.com', 'reddit'],
  ['redd.it', 'reddit'],
]

const BLOCKED_HOSTS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'shorturl.at', 'galatayo.app']

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igsh',
  'igshid',
  'mibextid',
  'rdid',
  'si',
  'pp',
  'feature',
  'share_id',
  '_t',
  '_r',
  'is_from_webapp',
  'sender_device',
  'sender_web_id',
  'web_id',
  'ref',
  'ref_src',
  'ref_url',
])

const SOURCE_LABELS: Record<ProofSource, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  reddit: 'Reddit',
  article: 'Article',
}

function matchesHost(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

export function getProofSource(hostname: string): ProofSource {
  const host = hostname.toLowerCase()
  return SOCIAL_HOSTS.find(([domain]) => matchesHost(host, domain))?.[1] ?? 'article'
}

export function getProofSourceLabel(url: string) {
  try {
    const { hostname } = new URL(url)
    const source = getProofSource(hostname)
    return source === 'article' ? hostname.replace(/^www\./, '') : SOURCE_LABELS[source]
  } catch {
    return 'Link'
  }
}

/** Only https links are ever rendered as clickable. */
export function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/** Pasted "tiktok.com/@x/video/1" gets the https:// it was copied without. */
export function withHttps(raw: string) {
  const value = raw.trim()
  return value && !/^[a-z][a-z\d+.-]*:/i.test(value) && /^[\w-]+(\.[\w-]+)+(\/|$)/.test(value) ? `https://${value}` : value
}

export type ProofLinkResult = { ok: true; url: string; source: ProofSource } | { ok: false; error: string }

export function normalizeProofLink(raw: string): ProofLinkResult {
  const value = raw.trim()

  if (value.length > MAX_PROOF_LINK_LENGTH) {
    return { ok: false, error: `Links can be at most ${MAX_PROOF_LINK_LENGTH} characters.` }
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: "That doesn't look like a full link. Copy it from the share button." }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: 'Use a link that starts with https://.' }
  }

  const hostname = url.hostname.toLowerCase()

  if (url.username || url.password || url.port || !hostname.includes('.') || /^[\d.]+$/.test(hostname)) {
    return { ok: false, error: 'Use a public web link.' }
  }

  if (BLOCKED_HOSTS.some((domain) => matchesHost(hostname, domain))) {
    return { ok: false, error: "Short links and GalaTayo links can't be checked. Paste the full post or article link." }
  }

  if (url.pathname.replace(/\/+$/, '') === '') {
    return { ok: false, error: 'Link to a post or article, not just a homepage.' }
  }

  for (const key of Array.from(url.searchParams.keys())) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key)
    }
  }
  url.hash = ''

  const normalized = url.toString()
  if (normalized.length > MAX_PROOF_LINK_LENGTH) {
    return { ok: false, error: `Links can be at most ${MAX_PROOF_LINK_LENGTH} characters.` }
  }

  return { ok: true, url: normalized, source: getProofSource(hostname) }
}

export type ProofLinksResult = { ok: true; links: string[] } | { ok: false; errors: string[]; message: string }

/** Checks the form's link slots in place; errors line up with the slots so each input can show its own. */
export function validateProofLinkSlots(slots: string[]): ProofLinksResult {
  const errors = slots.map(() => '')
  const links: string[] = []

  slots.forEach((slot, index) => {
    if (!slot.trim()) return
    const result = normalizeProofLink(withHttps(slot))
    if (!result.ok) {
      errors[index] = result.error
    } else if (links.includes(result.url)) {
      errors[index] = 'Same link as above. Add a different one or leave it blank.'
    } else {
      links.push(result.url)
    }
  })

  if (errors.some(Boolean)) {
    return { ok: false, errors, message: 'Fix the proof links first.' }
  }

  if (links.length < MIN_PROOF_LINKS) {
    errors[0] = 'Add at least 1 link that shows people go there.'
    return { ok: false, errors, message: errors[0] }
  }

  return { ok: true, links: links.slice(0, MAX_PROOF_LINKS) }
}
