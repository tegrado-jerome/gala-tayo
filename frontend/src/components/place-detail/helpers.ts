import { IMAGE_UPLOAD_ERROR_MESSAGE, isValidImageFile } from '../../utils/imageUpload'

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

export async function isAcceptedContributionImage(file: File): Promise<boolean> {
  return isValidImageFile(file)
}

export { IMAGE_UPLOAD_ERROR_MESSAGE as contributionImageErrorMessage }

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
