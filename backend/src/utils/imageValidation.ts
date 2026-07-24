import { detectImageFormat } from "./r2ImageStorage";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export function hasAllowedImageExtension(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension)
  );
}

export function normalizeImageMimeType(
  mimeType: string,
  fileName: string
): string {
  const trimmed = mimeType.trim().toLowerCase();

  if (ALLOWED_IMAGE_TYPES.has(trimmed)) {
    return trimmed;
  }

  const normalizedName = fileName.trim().toLowerCase();

  if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (normalizedName.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedName.endsWith(".webp")) {
    return "image/webp";
  }

  return trimmed;
}

export function isDangerousImage(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 512).toString("utf8").toLowerCase();
  const isSvg = head.includes("<svg");
  const isGif =
    buffer.length >= 6 && buffer.subarray(0, 3).toString("ascii") === "GIF";
  return isSvg || isGif;
}

export async function getEffectiveImageFormat(
  inputBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  const detectedFormat = await detectImageFormat(inputBuffer);
  const normalizedMimeType = normalizeImageMimeType(mimeType, fileName);
  const mimeToFormat: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const extensionFormat = hasAllowedImageExtension(fileName)
    ? (() => {
        const normalizedName = fileName.trim().toLowerCase();
        if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
          return "jpeg";
        }
        if (normalizedName.endsWith(".png")) {
          return "png";
        }
        if (normalizedName.endsWith(".webp")) {
          return "webp";
        }
        return null;
      })()
    : null;

  return detectedFormat || mimeToFormat[normalizedMimeType] || extensionFormat || null;
}

export function isAcceptedImageFormat(format: string | null): boolean {
  if (!format) {
    return false;
  }

  return ["jpeg", "png", "webp"].includes(format);
}
