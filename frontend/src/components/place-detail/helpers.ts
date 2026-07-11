export function cleanString(value?: string | null) {
  return value?.trim() || ''
}

export function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function uniqueList(values: Array<string | undefined | null>) {
  const seen = new Set<string>()
  return values
    .map((value) => cleanString(value))
    .filter(Boolean)
    .filter((value) => {
      const normalized = value.toLowerCase()
      if (seen.has(normalized)) {
        return false
      }
      seen.add(normalized)
      return true
    })
}

export function formatPriceLevel(level: number | null | undefined): string {
  if (level == null) return ''
  const symbols = ['Free', '₱', '₱₱', '₱₱₱', '₱₱₱₱']
  return symbols[Math.min(Math.max(Math.floor(level), 0), 4)] || ''
}

export function isAcceptedContributionImage(file: File) {
  const CONTRIBUTION_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
  const CONTRIBUTION_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

  const normalizedType = file.type.trim().toLowerCase()

  if (CONTRIBUTION_IMAGE_TYPES.includes(normalizedType)) {
    return true
  }

  const normalizedName = file.name.trim().toLowerCase()
  return CONTRIBUTION_IMAGE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
}

export function parseJsonResponse<T>(text: string): T | null {
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export type { PlaceComment } from './types'
