import { HttpRequest } from "@azure/functions";

export function getConfiguredSiteUrl(): string | null {
  const configuredSiteUrl = process.env.SITE_URL || process.env.PUBLIC_SITE_URL;

  if (configuredSiteUrl && configuredSiteUrl.trim()) {
    return configuredSiteUrl.trim().replace(/\/+$/, "");
  }

  return null;
}

export function getSiteUrl(request: HttpRequest): string {
  const configuredSiteUrl = getConfiguredSiteUrl();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const requestOrigin = new URL(request.url).origin;

  if (!host) {
    return requestOrigin.replace(/\/+$/, "");
  }

  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
    return requestOrigin.replace(/\/+$/, "");
  }

  return `${forwardedProto}://${host}`.replace(/\/+$/, "");
}
