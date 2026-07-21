const R2_PUBLIC_BASE_URL = "https://media.galatayo.app";

export function getR2PublicBaseUrl(): string {
  return process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? R2_PUBLIC_BASE_URL;
}

function getCanonicalImageUrlFromPath(pathname: string, search = "", hash = ""): string {
  const baseUrl = getR2PublicBaseUrl();
  const normalizedPath = pathname.replace(/^\/+/, "");
  const separator = baseUrl.endsWith("/") ? "" : "/";
  return `${baseUrl}${separator}${normalizedPath}${search}${hash}`;
}

export function buildImageUrl(storageKey: string | null | undefined): string | null {
  if (!storageKey) {
    return null;
  }

  const normalizedKey = storageKey.trim().replace(/^\/+/, "");
  return getCanonicalImageUrlFromPath(normalizedKey);
}

export function normalizeImageUrl(imageUrl: string | null | undefined): string | null {
  if (typeof imageUrl !== "string") {
    return null;
  }

  const trimmed = imageUrl.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmed);
    const canonicalBaseUrl = new URL(getR2PublicBaseUrl());

    if (parsedUrl.origin === canonicalBaseUrl.origin) {
      return getCanonicalImageUrlFromPath(parsedUrl.pathname, parsedUrl.search, parsedUrl.hash);
    }

    if (parsedUrl.hostname.endsWith(".pub.dev")) {
      return getCanonicalImageUrlFromPath(parsedUrl.pathname, parsedUrl.search, parsedUrl.hash);
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

export function normalizeImageUrls(imageUrls: Array<string | null | undefined>): string[] {
  const normalizedUrls: string[] = [];
  const seen = new Set<string>();

  for (const imageUrl of imageUrls) {
    const normalizedUrl = normalizeImageUrl(imageUrl);

    if (!normalizedUrl || seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    normalizedUrls.push(normalizedUrl);
  }

  return normalizedUrls;
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
