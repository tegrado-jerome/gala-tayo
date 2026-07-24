export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const ACCEPTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
] as const

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const DEFAULT_MAX_IMAGE_DIMENSION = 2048

export const IMAGE_UPLOAD_ERROR_MESSAGE =
  'Use a JPEG, PNG, WebP, or HEIC image up to 5MB.'

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')

  if (lastDotIndex < 0) {
    return ''
  }

  return fileName.slice(lastDotIndex).toLowerCase()
}

function getMimeTypeFromExtension(fileName: string): string {
  const extension = getFileExtension(fileName)

  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.heic':
      return 'image/heic'
    case '.heif':
      return 'image/heif'
    default:
      return ''
  }
}

export function isValidImageFile(file: File): boolean {
  const normalizedType = file.type.trim().toLowerCase()
  const normalizedName = file.name.trim().toLowerCase()
  const hasValidMimeType = ACCEPTED_IMAGE_TYPES.includes(
    normalizedType as (typeof ACCEPTED_IMAGE_TYPES)[number],
  )
  const hasValidExtension = ACCEPTED_IMAGE_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension),
  )

  return (hasValidMimeType || hasValidExtension) && file.size <= MAX_UPLOAD_BYTES
}

export function normalizeImageMimeType(file: File): File {
  const normalizedType = file.type.trim().toLowerCase()

  if (ACCEPTED_IMAGE_TYPES.includes(normalizedType as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
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

function isHeicFile(file: File): boolean {
  const normalizedType = file.type.trim().toLowerCase()
  const normalizedName = file.name.trim().toLowerCase()

  return (
    normalizedType === 'image/heic' ||
    normalizedType === 'image/heif' ||
    normalizedName.endsWith('.heic') ||
    normalizedName.endsWith('.heif')
  )
}

function isStandardWebImage(file: File): boolean {
  const normalizedType = file.type.trim().toLowerCase()
  const normalizedName = file.name.trim().toLowerCase()

  const standardTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  const standardExtensions = ['.jpg', '.jpeg', '.png', '.webp']

  return (
    standardTypes.includes(normalizedType) ||
    standardExtensions.some((extension) => normalizedName.endsWith(extension))
  )
}

async function decodeHeicToBlob(file: File): Promise<Blob> {
  const heic2any = await import('heic2any')
  const result = await heic2any.default({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })

  return Array.isArray(result) ? result[0] : result
}

async function ensureDecodedImageBlob(file: File): Promise<Blob> {
  if (isHeicFile(file)) {
    return decodeHeicToBlob(file)
  }

  return file
}

function supportsWebP(): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1

  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read that image. Please try another JPEG, PNG, or WebP file.'))
    }

    image.src = objectUrl
  })
}

function calculateResizedDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  if (naturalWidth <= maxDimension && naturalHeight <= maxDimension) {
    return { width: naturalWidth, height: naturalHeight }
  }

  const ratio = naturalWidth / naturalHeight

  if (naturalWidth > naturalHeight) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension / ratio),
    }
  }

  return {
    width: Math.round(maxDimension * ratio),
    height: maxDimension,
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  outputType: 'image/webp' | 'image/jpeg',
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      outputType,
      quality,
    )
  })
}

export type PrepareImageOptions = {
  maxDimension?: number
  outputType?: 'image/webp' | 'image/jpeg'
  quality?: number
  fileName?: string
}

async function convertImageWithCanvas(
  file: File,
  options: PrepareImageOptions = {},
): Promise<File> {
  const decodedBlob = await ensureDecodedImageBlob(file)
  const image = await loadImageFromBlob(decodedBlob)

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_IMAGE_DIMENSION
  const { width, height } = calculateResizedDimensions(
    image.naturalWidth,
    image.naturalHeight,
    maxDimension,
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Could not prepare that image for upload. Please try another photo.')
  }

  context.drawImage(image, 0, 0, width, height)

  const requestedOutputType = options.outputType ?? 'image/webp'
  const outputType =
    requestedOutputType === 'image/webp' && !supportsWebP()
      ? 'image/jpeg'
      : requestedOutputType

  const quality = options.quality ?? 0.9
  const blob = await canvasToBlob(canvas, outputType, quality)

  if (!blob) {
    throw new Error('Could not prepare that image for upload. Please try another photo.')
  }

  const baseName = (options.fileName ?? file.name).replace(/\.[^.]+$/, '') || 'image'
  const extension = outputType === 'image/webp' ? 'webp' : 'jpg'

  return new File([blob], `${baseName}.${extension}`, {
    type: outputType,
    lastModified: file.lastModified,
  })
}

export async function prepareImageForUpload(
  file: File,
  options: PrepareImageOptions = {},
): Promise<File> {
  const normalizedFile = normalizeImageMimeType(file)

  if (!isValidImageFile(normalizedFile)) {
    if (normalizedFile.size > MAX_UPLOAD_BYTES) {
      throw new Error('This photo is too large. Please choose one under 5MB.')
    }

    throw new Error(IMAGE_UPLOAD_ERROR_MESSAGE)
  }

  // For standard web images (JPEG/PNG/WebP), send the original file as-is.
  // Browser-specific decoding issues are avoided; the backend (Sharp) handles conversion.
  if (isStandardWebImage(normalizedFile)) {
    return normalizedFile
  }

  // For HEIC/HEIF, attempt client-side decode. If it fails for any reason,
  // fall back to sending the original file so the backend can attempt conversion.
  try {
    return await convertImageWithCanvas(normalizedFile, options)
  } catch {
    return normalizedFile
  }
}

export async function prepareAvatarUploadFile(file: File): Promise<File> {
  return prepareImageForUpload(file, {
    maxDimension: 1024,
    outputType: 'image/webp',
    quality: 0.92,
    fileName: file.name,
  })
}

export async function preparePlaceImageUploadFile(file: File): Promise<File> {
  return prepareImageForUpload(file, {
    maxDimension: DEFAULT_MAX_IMAGE_DIMENSION,
    outputType: 'image/webp',
    quality: 0.88,
    fileName: file.name,
  })
}

export async function preparePlaceSubmissionImageFile(file: File): Promise<File> {
  return prepareImageForUpload(file, {
    maxDimension: DEFAULT_MAX_IMAGE_DIMENSION,
    outputType: 'image/webp',
    quality: 0.88,
    fileName: file.name,
  })
}
