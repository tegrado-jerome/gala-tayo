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

function bytesToString(buffer: Buffer, start: number, end: number): string {
  return buffer.subarray(start, end).toString("ascii");
}

export function detectImageFormatFromBytes(
  buffer: Buffer
): "jpeg" | "png" | "webp" | "heic" | null {
  if (buffer.length < 12) {
    return null;
  }

  // JPEG: starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: "RIFF" at 0, "WEBP" at 8
  const header = bytesToString(buffer, 0, 12);
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
    return "webp";
  }

  // HEIC/HEIF: ISO Base Media File Format with ftyp box at offset 4
  const ftypHeader = bytesToString(buffer, 4, 8);
  if (ftypHeader === "ftyp") {
    const majorBrand = bytesToString(buffer, 8, 12);
    const heicBrands = ["heic", "heix", "hevc", "hevx", "mif1", "msf1"];
    if (heicBrands.includes(majorBrand)) {
      return "heic";
    }
  }

  return null;
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

  const magicBytesFormat = detectImageFormatFromBytes(inputBuffer);

  return detectedFormat || mimeToFormat[normalizedMimeType] || extensionFormat || magicBytesFormat || null;
}

export function isAcceptedImageFormat(format: string | null): boolean {
  if (!format) {
    return false;
  }

  return ["jpeg", "png", "webp"].includes(format);
}
