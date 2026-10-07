import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { checkPublicReadRateLimit } from "../utils/redisRateLimit";
import { getGalaScore, getSeoAreaPage, getSeoAreaSummaries, getSeoListingPage, getSeoPlaceSummaries } from "../utils/seoPlaces";
import { REGIONS } from "../utils/phDestinations";
import { getSiteUrl } from "../utils/siteUrl";

type SitemapEntry = {
  path: string;
  changefreq: string;
  priority: string;
  lastmod?: string | null;
};

type AreaCount = {
  slug: string;
  placeCount: number;
  latestUpdatedAt: string | null;
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isValidIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

// Database timestamps have no timezone, which Google rejects in <lastmod>; a plain date is always valid.
function lastmodTag(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? `    <lastmod>${value.slice(0, 10)}</lastmod>` : null;
}

function pickLatestTimestamp(current: string | null, candidate: string | null): string | null {
  if (!isValidIsoDate(candidate)) {
    return current;
  }

  if (!isValidIsoDate(current)) {
    return candidate;
  }

  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function getPositiveQueryInteger(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function buildAreaCounts(places: Awaited<ReturnType<typeof getSeoPlaceSummaries>>): Map<string, AreaCount> {
  const areaCounts = new Map<string, AreaCount>()

  for (const place of places) {
    const existing = areaCounts.get(place.areaSlug)

    if (!existing) {
      areaCounts.set(place.areaSlug, {
        slug: place.areaSlug,
        placeCount: 1,
        latestUpdatedAt: place.updatedAt ?? null,
      })
      continue
    }

    existing.placeCount += 1
    existing.latestUpdatedAt = pickLatestTimestamp(existing.latestUpdatedAt, place.updatedAt ?? null)
  }

  return areaCounts
}

function buildSitemapEntries(args: {
  areas: Awaited<ReturnType<typeof getSeoAreaSummaries>>
  places: Awaited<ReturnType<typeof getSeoPlaceSummaries>>
}): SitemapEntry[] {
  const { areas, places } = args
  const areaCounts = buildAreaCounts(places)

  const staticEntries: SitemapEntry[] = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/places", priority: "0.9", changefreq: "daily" },
    { path: "/about", priority: "0.6", changefreq: "monthly" },
    { path: "/privacy", priority: "0.4", changefreq: "yearly" },
    { path: "/terms", priority: "0.4", changefreq: "yearly" },
    { path: "/cookies", priority: "0.3", changefreq: "yearly" },
    { path: "/copyright", priority: "0.3", changefreq: "yearly" },
    { path: "/disclaimer", priority: "0.3", changefreq: "yearly" },
  ]

  const areaEntries: SitemapEntry[] = areas
    // Thin city pages stay here so the prerender writes their (noindex) HTML; it drops them from the published sitemap.
    .filter((area) => area.placeCount > 0)
    .map((area) => ({
      path: area.canonicalPath,
      priority: "0.8",
      changefreq: "weekly",
      lastmod: areaCounts.get(area.slug)?.latestUpdatedAt ?? null,
    }))

  // Region hubs (/places/metro-manila, /places/calabarzon...) only add value once places span more than one region.
  const regionsWithPlaces = REGIONS
    .map((region) => ({
      region,
      counts: region.destinations.map((destination) => areaCounts.get(destination.slug)).filter((count): count is AreaCount => Boolean(count)),
    }))
    .filter(({ counts }) => counts.length > 0)
  const regionEntries: SitemapEntry[] = regionsWithPlaces.length > 1
    ? regionsWithPlaces.map(({ region, counts }) => ({
        path: `/places/${region.slug}`,
        priority: "0.8",
        changefreq: "weekly",
        lastmod: counts.reduce<string | null>((latest, count) => pickLatestTimestamp(latest, count.latestUpdatedAt), null),
      }))
    : []

  // Best places first, so a crawler that reads only part of the list gets the strongest pages.
  const placeEntries: SitemapEntry[] = [...places].sort((left, right) => getGalaScore(right.slug) - getGalaScore(left.slug)).map((place) => ({
    path: place.canonicalPath,
    priority: "0.7",
    changefreq: "weekly",
    lastmod: place.updatedAt ?? null,
  }))

  // Category pages are gone (browsing is by vibe, and the old URLs 301), so none are listed.
  return [...staticEntries, ...regionEntries, ...areaEntries, ...placeEntries]
}

export async function seoPlaces(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkPublicReadRateLimit(request, "seo-places", 30, 60)
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response
  }

  context.log("Loading SEO places payload.")

  const areaSlug = request.query.get("area")?.trim().toLowerCase()

  if (areaSlug) {
    const areaPage = await getSeoAreaPage(areaSlug)

    if (!areaPage) {
      return {
        status: 404,
        jsonBody: {
          message: `Area not found for slug: ${areaSlug}`,
        },
      }
    }

    return {
      status: 200,
      jsonBody: areaPage,
    }
  }

  const places = await getSeoPlaceSummaries()
  const areas = await getSeoAreaSummaries(places)

  return {
    status: 200,
    jsonBody: { areas, places },
  }
}

export async function seoArea(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkPublicReadRateLimit(request, "seo-area", 30, 60)
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response
  }

  const areaSlug = request.params.areaSlug
  context.log(`Loading SEO area payload for ${areaSlug}.`)

  const areaPage = await getSeoAreaPage(areaSlug)

  if (!areaPage) {
    return {
      status: 404,
      jsonBody: {
        message: `Area not found for slug: ${areaSlug}`,
      },
    }
  }

  return {
    status: 200,
    jsonBody: areaPage,
  }
}

export async function seoListings(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkPublicReadRateLimit(request, "seo-listings", 60, 60)
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response
  }

  const areaSlug = request.query.get("area")?.trim().toLowerCase() ?? null
  const category = request.query.get("category")?.trim().toLowerCase() ?? null
  const goodFor = request.query.get("goodFor")?.trim().toLowerCase() ?? null
  const page = getPositiveQueryInteger(request.query.get("page"), 1, 1000)
  const pageSize = getPositiveQueryInteger(request.query.get("pageSize"), 12, 50)

  context.log("Loading SEO listing payload.", { areaSlug, category, goodFor, page, pageSize })

  const payload = await getSeoListingPage({
    areaSlug,
    category,
    goodFor,
    page,
    pageSize,
  })

  return {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
    },
    jsonBody: payload,
  }
}

export async function sitemapXml(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const rateCheck = await checkPublicReadRateLimit(request, "sitemap", 10, 60)
  if (!rateCheck.allowed && rateCheck.response) {
    return rateCheck.response
  }

  context.log("Generating sitemap.xml.")

  const siteUrl = getSiteUrl(request)
  const places = await getSeoPlaceSummaries({
    onImageLoadError: (error) => {
      context.warn("Failed to load approved place images for sitemap; continuing without image entries.", error)
    },
  })
  const areas = await getSeoAreaSummaries(places)
  const urls = buildSitemapEntries({ areas, places })

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) =>
      [
        "  <url>",
        `    <loc>${xmlEscape(`${siteUrl}${url.path}`)}</loc>`,
        lastmodTag(url.lastmod),
        `    <changefreq>${url.changefreq}</changefreq>`,
        `    <priority>${url.priority}</priority>`,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "</urlset>",
  ].join("\n")

  return {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
    body,
  }
}

export async function robotsTxt(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Generating robots.txt.")

  const siteUrl = getSiteUrl(request)
  const body = [
    "User-agent: *",
    "Allow: /",
    // Same rules as frontend/public/robots.txt: block private screens only; public app screens are noindex.
    "Disallow: /admin",
    "Disallow: /auth/",
    "Disallow: /mfa/",
    "Disallow: /onboarding",
    "Disallow: /account",
    "Disallow: /settings",
    "Disallow: /privacy-center",
    "Disallow: /reset-password",
    "Disallow: /forgot-password",
    "Disallow: /profile/",
    "Disallow: /me$",
    "Disallow: /favorites",
    "Disallow: /history",
    "Disallow: /reports",
    "Disallow: /find-friends",
    "Disallow: /comment-notices",
    "Disallow: /submit-place",
    "Disallow: /places/new$",
    "Disallow: /places/submit$",
    "Disallow: /my-submissions",
    "Disallow: /submissions",
    "Disallow: /photos/upload",
    `Sitemap: ${siteUrl}/sitemap.xml`,
  ].join("\n")

  return {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
    body,
  }
}

app.http("seoPlaces", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/places",
  handler: seoPlaces,
})

app.http("seoArea", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/areas/{areaSlug}",
  handler: seoArea,
})

app.http("seoListings", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/listings",
  handler: seoListings,
})

app.http("sitemapXml", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/sitemap.xml",
  handler: sitemapXml,
})

app.http("robotsTxt", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "seo/robots.txt",
  handler: robotsTxt,
})
