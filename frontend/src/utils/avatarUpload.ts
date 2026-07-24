import {
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  IMAGE_UPLOAD_ERROR_MESSAGE,
  isValidImageFile,
  normalizeImageMimeType,
  prepareAvatarUploadFile,
} from './imageUpload'

export const avatarMimeTypes = ACCEPTED_IMAGE_TYPES
export const avatarExtensions = ACCEPTED_IMAGE_EXTENSIONS
export const maxAvatarBytes = MAX_UPLOAD_BYTES
export const avatarUploadErrorMessage = IMAGE_UPLOAD_ERROR_MESSAGE

export const avatarUploadAccept = [
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_IMAGE_EXTENSIONS,
].join(',')

export async function isValidAvatarFile(file: File): Promise<boolean> {
  return isValidImageFile(file)
}

export async function normalizeAvatarFile(file: File): Promise<File> {
  return normalizeImageMimeType(file)
}

export { prepareAvatarUploadFile }
