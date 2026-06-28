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
  const hasValidExtension = avatarExtensions.includes(getFileExtension(file.name) as (typeof avatarExtensions)[number])

  return (hasValidMimeType || hasValidExtension) && file.size <= maxAvatarBytes
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

function convertLoadedImageToWebp(file: File) {
  return new Promise<File>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight

      const context = canvas.getContext('2d')

      if (!context) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Avatar upload is not supported in this browser.'))
        return
      }

      context.drawImage(image, 0, 0)

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl)

          if (!blob) {
            reject(new Error('Could not prepare that image for upload. Please try another photo.'))
            return
          }

          const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar'

          resolve(
            new File([blob], `${baseName}.webp`, {
              type: 'image/webp',
              lastModified: file.lastModified,
            }),
          )
        },
        'image/webp',
        0.9,
      )
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read that image. Please try another JPEG, PNG, or WebP file.'))
    }

    image.src = objectUrl
  })
}

export async function prepareAvatarUploadFile(file: File) {
  const normalizedFile = normalizeAvatarFile(file)

  if (normalizedFile.type === 'image/webp') {
    return normalizedFile
  }

  return convertLoadedImageToWebp(normalizedFile)
}
