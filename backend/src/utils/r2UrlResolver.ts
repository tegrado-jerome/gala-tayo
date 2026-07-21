const R2_PUBLIC_BASE_URL = "https://media.galatayo.app";

export function getR2PublicBaseUrl(): string {
  return process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? R2_PUBLIC_BASE_URL;
}

export function buildImageUrl(storageKey: string | null | undefined): string | null {
  if (!storageKey) {
    return null;
  }

  const baseUrl = getR2PublicBaseUrl();
  const normalizedKey = storageKey.trim().replace(/^\/+/, "");
  const separator = baseUrl.endsWith("/") ? "" : "/";
  return `${baseUrl}${separator}${normalizedKey}`;
}

export function resolveR2Url(options: {
  storageKey?: string | null;
  baseUrl?: string;
}): string | null {
  const { storageKey } = options;

  if (storageKey) {
    return buildImageUrl(storageKey);
  }

  return null;
}
