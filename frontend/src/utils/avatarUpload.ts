const avatarMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const
const avatarExtensions = ['.jpg', '.jpeg', '.png', '.webp'] as const

export const avatarUploadAccept = [...avatarMimeTypes, ...avatarExtensions].join(',')
export const maxAvatarBytes = 5 * 1024 * 1024
export const avatarUploadErrorMessage = 'Use a JPEG, PNG, or WebP image up to 5MB.'

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.')

  if (lastDotIndex < 0) {
    return ''
  }

  return fileName.slice(lastDotIndex).toLowerCase()
}

function getMimeTypeFromExtension(fileName: string) {
  const extension = getFileExtension(fileName)

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg'
  }

  if (extension === '.png') {
    return 'image/png'
  }

  if (extension === '.webp') {
    return 'image/webp'
  }

  return ''
}

export function isValidAvatarFile(file: File) {
  const hasValidMimeType = avatarMimeTypes.includes(file.type as (typeof avatarMimeTypes)[number])
  const hasImageMimeType = file.type.trim().toLowerCase().startsWith('image/')
  const hasValidExtension = avatarExtensions.includes(getFileExtension(file.name) as (typeof avatarExtensions)[number])

  return (hasValidMimeType || hasImageMimeType || hasValidExtension) && file.size <= maxAvatarBytes
}

export function normalizeAvatarFile(file: File) {
  if (avatarMimeTypes.includes(file.type as (typeof avatarMimeTypes)[number])) {
    return file
  }

  const inferredMimeType = getMimeTypeFromExtension(file.name)

  if (!inferredMimeType) {
    return file
  }

  return new File([file], file.name, {
    type: inferredMimeType,
    lastModified: file.lastModified,
  })
}
