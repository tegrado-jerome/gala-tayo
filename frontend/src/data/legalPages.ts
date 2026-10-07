/** Every legal page, in footer order. Kept apart from the page text so footers don't load it. */
export const legalPages = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/copyright', label: 'Copyright and takedown' },
  { href: '/disclaimer', label: 'Disclaimer' },
] as const

export type LegalPageType = 'privacy' | 'terms' | 'cookies' | 'copyright' | 'disclaimer'

export const LEGAL_PAGE_TYPES: LegalPageType[] = ['privacy', 'terms', 'cookies', 'copyright', 'disclaimer']

export const legalContactEmail = 'officialgalatayo@gmail.com'
